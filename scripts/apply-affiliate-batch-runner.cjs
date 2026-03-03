const fs = require("fs");
const path = require("path");
const {
  readRunnerEnv,
  createSupabaseRestClient,
  toCsv,
} = require("./_supabase_runner_utils.cjs");

const args = process.argv.slice(2);

const getArg = (name, fallback = null) => {
  const idx = args.indexOf(name);
  if (idx >= 0 && idx + 1 < args.length) return args[idx + 1];
  return fallback;
};

const hasArg = (name) => args.includes(name);

const envFile = getArg("--env", "supabase/functions/.env.scheduler");
const batchId = getArg("--batch-id", null);
const linksFile = getArg("--links-file", null);
const outPrefix = getArg("--out-prefix", null);
const allowPartial = hasArg("--allow-partial");
const allowExtra = hasArg("--allow-extra");
const strictCount = !hasArg("--non-strict-count");
const asJson = hasArg("--json");

if (!batchId) {
  console.error("Informe --batch-id <uuid>.");
  process.exit(1);
}

let links = [];
if (linksFile) {
  if (!fs.existsSync(linksFile)) {
    console.error(`Arquivo nao encontrado: ${linksFile}`);
    process.exit(1);
  }
  links = String(fs.readFileSync(linksFile, "utf8"));
} else {
  try {
    if (!process.stdin.isTTY) {
      links = String(fs.readFileSync(0, "utf8"));
    }
  } catch {
    // ignore stdin read errors
  }
}

const summarizeItems = (rows) => ({
  items: rows.length,
  pending: rows.filter((row) => String(row?.apply_status || "").toUpperCase() === "PENDING").length,
  applied: rows.filter((row) => String(row?.apply_status || "").toUpperCase() === "APPLIED").length,
  invalid: rows.filter((row) => String(row?.apply_status || "").toUpperCase() === "INVALID").length,
  skipped: rows.filter((row) => String(row?.apply_status || "").toUpperCase() === "SKIPPED").length,
});

const main = async () => {
  const {
    parseAffiliateLinksInput,
    isUuid,
    validateAffiliateLinksForBatch,
    isMercadoLivreSecLink,
  } = await import("../src/lib/affiliateValidationRules.js");

  if (!isUuid(batchId)) {
    throw new Error("Parametro --batch-id invalido. Informe um UUID valido.");
  }

  const env = readRunnerEnv(envFile);
  if (!env.SUPABASE_URL || !env.SERVICE_ROLE_KEY) {
    throw new Error("SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY ausentes no ambiente.");
  }

  const client = createSupabaseRestClient({
    supabaseUrl: env.SUPABASE_URL,
    serviceRoleKey: env.SERVICE_ROLE_KEY,
  });

  const batchRows = await client.request(
    `/affiliate_validation_batches?select=id,source,status,total_items,applied_items,invalid_items,ignored_extra,created_at,expires_at&id=eq.${encodeURIComponent(batchId)}&limit=1`,
    { method: "GET" },
  );
  const batch = Array.isArray(batchRows) ? batchRows[0] : null;
  if (!batch) {
    throw new Error(`Lote nao encontrado para batch_id=${batchId}.`);
  }

  const itemsBefore = await client.request(
    `/affiliate_validation_batch_items?select=id,position,product_id,source_url,external_id,affiliate_url,apply_status,error_message,applied_at,old_status,new_status,old_is_active,new_is_active&batch_id=eq.${encodeURIComponent(batchId)}&order=position.asc`,
    { method: "GET" },
  );
  const orderedItems = Array.isArray(itemsBefore) ? itemsBefore : [];
  const expectedCount = orderedItems.length;

  const parsedInputLinks = parseAffiliateLinksInput(links);

  if (String(batch.status || "").toUpperCase() !== "OPEN") {
    const noopPayload = {
      ok: true,
      noop: true,
      reason: `batch_not_open:${batch.status}`,
      batch,
      totals: summarizeItems(orderedItems),
      rows: orderedItems,
    };
    if (outPrefix) {
      fs.mkdirSync(path.dirname(outPrefix), { recursive: true });
      fs.writeFileSync(`${outPrefix}.json`, `${JSON.stringify(noopPayload, null, 2)}\n`, "utf8");
      fs.writeFileSync(`${outPrefix}.csv`, `${toCsv(orderedItems)}\n`, "utf8");
    }
    console.log(JSON.stringify(noopPayload, null, 2));
    return;
  }

  const validation = validateAffiliateLinksForBatch({
    links: parsedInputLinks,
    expectedCount,
    strictCount,
    allowPartial,
    allowExtra,
  });

  if (!validation.ok) {
    throw new Error(`Falha de validacao de entrada:\n- ${validation.errors.join("\n- ")}`);
  }

  const rpcResult = await client.rpc("apply_affiliate_validation_batch", {
    p_batch_id: batchId,
    p_affiliate_urls: validation.normalizedLinks,
  });

  const itemsAfter = await client.request(
    `/affiliate_validation_batch_items?select=id,position,product_id,source_url,external_id,affiliate_url,apply_status,error_message,applied_at,old_status,new_status,old_is_active,new_is_active&batch_id=eq.${encodeURIComponent(batchId)}&order=position.asc`,
    { method: "GET" },
  );
  const rowsAfter = Array.isArray(itemsAfter) ? itemsAfter : [];

  const productIds = [...new Set(rowsAfter.map((row) => row.product_id).filter(Boolean))];
  const products = productIds.length
    ? await client.request(
        `/products?select=id,status,is_active,affiliate_verified,affiliate_link,affiliate_validation_status,affiliate_validation_error&id=in.(${productIds.map((id) => encodeURIComponent(id)).join(",")})`,
        { method: "GET" },
      )
    : [];
  const productById = new Map((Array.isArray(products) ? products : []).map((product) => [product.id, product]));

  const finalIntegrity = rowsAfter
    .filter((row) => String(row?.apply_status || "").toUpperCase() === "APPLIED")
    .map((row) => {
      const product = productById.get(row.product_id);
      const issues = [];
      if (!product) {
        issues.push("product_not_found_after_apply");
      } else {
        if (String(product.status || "").toLowerCase() !== "active") issues.push("product_status_not_active");
        if (!Boolean(product.is_active)) issues.push("product_is_active_false");
        if (!Boolean(product.affiliate_verified)) issues.push("affiliate_not_verified");
        if (!isMercadoLivreSecLink(product.affiliate_link)) issues.push("affiliate_link_not_sec");
      }
      return {
        position: row.position,
        product_id: row.product_id,
        affiliate_url: row.affiliate_url || null,
        integrity_ok: issues.length === 0,
        issues,
      };
    });

  const payload = {
    ok: true,
    batch,
    input: {
      received_links_count: parsedInputLinks.length,
      normalized_links_count: validation.normalizedLinks.length,
      strict_count: strictCount,
      allow_partial: allowPartial,
      allow_extra: allowExtra,
      warnings: validation.warnings,
    },
    result: rpcResult,
    totals: summarizeItems(rowsAfter),
    final_integrity: {
      checked: finalIntegrity.length,
      failures: finalIntegrity.filter((row) => !row.integrity_ok).length,
    },
    rows: rowsAfter,
    integrity_rows: finalIntegrity,
  };

  if (outPrefix) {
    fs.mkdirSync(path.dirname(outPrefix), { recursive: true });
    fs.writeFileSync(`${outPrefix}.json`, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
    fs.writeFileSync(`${outPrefix}.csv`, `${toCsv(rowsAfter)}\n`, "utf8");
    fs.writeFileSync(`${outPrefix}-integrity.csv`, `${toCsv(finalIntegrity)}\n`, "utf8");
  }

  if (asJson) {
    console.log(JSON.stringify(payload ?? {}, null, 2));
    return;
  }

  console.log(JSON.stringify(payload ?? {}, null, 2));
};

main().catch((err) => {
  console.error(err?.message || err);
  process.exit(1);
});
