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

const getProjectRef = () => {
  if (process.env.SUPABASE_PROJECT_REF) return String(process.env.SUPABASE_PROJECT_REF).trim();
  const projectRefFile = "supabase/.temp/project-ref";
  if (fs.existsSync(projectRefFile)) return String(fs.readFileSync(projectRefFile, "utf8")).trim();
  return "";
};

const sqlEscape = (value) => String(value ?? "").replace(/'/g, "''");

const runAdminSqlApplyFallback = async ({ batchIdValue, normalizedLinks }) => {
  const projectRef = getProjectRef();
  const accessToken = String(process.env.SUPABASE_ACCESS_TOKEN || "").trim();
  if (!projectRef || !accessToken) {
    throw new Error(
      "admin_required and fallback_unavailable: set SUPABASE_ACCESS_TOKEN (and project ref if needed) to use SQL admin API fallback",
    );
  }

  const safeBatchId = sqlEscape(batchIdValue);
  const sqlLinksArray = (Array.isArray(normalizedLinks) ? normalizedLinks : [])
    .map((url) => `'${sqlEscape(url)}'`)
    .join(",");
  const query = [
    "select set_config('request.jwt.claim.role','service_role', true);",
    `select public.apply_affiliate_validation_batch('${safeBatchId}'::uuid, ARRAY[${sqlLinksArray}]::text[]) as result;`,
  ].join(" ");

  const response = await fetch(`https://api.supabase.com/v1/projects/${projectRef}/database/query`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ query }),
  });

  const text = await response.text();
  let parsed = null;
  if (text) {
    try {
      parsed = JSON.parse(text);
    } catch {
      parsed = text;
    }
  }
  if (!response.ok) {
    throw new Error(
      `admin_sql_fallback_failed: ${response.status} ${response.statusText} ${typeof parsed === "string" ? parsed : JSON.stringify(parsed || {})}`,
    );
  }
  return parsed;
};

const main = async () => {
  const {
    parseAffiliateLinksInput,
    normalizeAffiliateInputLines,
    isUuid,
    validateAffiliateLinksForBatch,
    isMercadoLivreSecLink,
    resolveAffiliateBatchApplyMode,
    summarizeErrorReasons,
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

  const parsedInputLinks = normalizeAffiliateInputLines(parseAffiliateLinksInput(links));

  const applyMode = resolveAffiliateBatchApplyMode(batch);
  if (applyMode.noop) {
    const noopPayload = {
      ok: true,
      noop: true,
      reason: applyMode.reason,
      batch,
      totals: summarizeItems(orderedItems),
      error_summary: summarizeErrorReasons(orderedItems),
      rows: orderedItems,
    };
    if (outPrefix) {
      fs.mkdirSync(path.dirname(outPrefix), { recursive: true });
      fs.writeFileSync(`${outPrefix}.json`, `${JSON.stringify(noopPayload, null, 2)}\n`, "utf8");
      fs.writeFileSync(`${outPrefix}.csv`, `${toCsv(orderedItems)}\n`, "utf8");
      const txtSummary = [
        `ok=true`,
        `noop=true`,
        `reason=${noopPayload.reason}`,
        `items=${noopPayload.totals.items}`,
        `applied=${noopPayload.totals.applied}`,
        `invalid=${noopPayload.totals.invalid}`,
        `skipped=${noopPayload.totals.skipped}`,
      ].join("\n");
      fs.writeFileSync(`${outPrefix}.txt`, `${txtSummary}\n`, "utf8");
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

  let rpcResult = null;
  let executionMode = "rpc";
  try {
    rpcResult = await client.rpc("apply_affiliate_validation_batch", {
      p_batch_id: batchId,
      p_affiliate_urls: validation.normalizedLinks,
    });
  } catch (error) {
    const message = String(error?.message || error);
    if (!/admin_required/i.test(message)) {
      throw error;
    }
    rpcResult = await runAdminSqlApplyFallback({
      batchIdValue: batchId,
      normalizedLinks: validation.normalizedLinks,
    });
    executionMode = "admin_sql_api";
  }

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
    execution_mode: executionMode,
    totals: summarizeItems(rowsAfter),
    error_summary: summarizeErrorReasons(rowsAfter),
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
    const txtSummary = [
      `ok=true`,
      `batch_id=${batchId}`,
      `items=${payload.totals.items}`,
      `applied=${payload.totals.applied}`,
      `invalid=${payload.totals.invalid}`,
      `skipped=${payload.totals.skipped}`,
      `integrity_failures=${payload.final_integrity.failures}`,
    ].join("\n");
    fs.writeFileSync(`${outPrefix}.txt`, `${txtSummary}\n`, "utf8");
  }

  if (asJson) {
    console.log(JSON.stringify(payload ?? {}, null, 2));
    return;
  }

  console.log(JSON.stringify(payload ?? {}, null, 2));
};

main().catch((err) => {
  const message = err?.message || String(err);
  if (outPrefix) {
    try {
      fs.mkdirSync(path.dirname(outPrefix), { recursive: true });
      const payload = {
        ok: false,
        batch_id: batchId || null,
        error: message,
      };
      fs.writeFileSync(`${outPrefix}.json`, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
      fs.writeFileSync(`${outPrefix}.csv`, `${toCsv([payload])}\n`, "utf8");
      fs.writeFileSync(`${outPrefix}.txt`, `ok=false\nerror=${message}\n`, "utf8");
    } catch {
      // ignore artifact write errors on failure path
    }
  }
  console.error(message);
  process.exit(1);
});
