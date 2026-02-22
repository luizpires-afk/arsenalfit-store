const fs = require("fs");
const path = require("path");
const {
  readRunnerEnv,
  createSupabaseRestClient,
  extractMlItemIdFromUrl,
  resolveCanonicalMlItemId,
  isMercadoLivreSecLink,
} = require("./_supabase_runner_utils.cjs");

const args = process.argv.slice(2);
const getArg = (name, fallback = null) => {
  const index = args.indexOf(name);
  if (index >= 0 && index + 1 < args.length) return args[index + 1];
  return fallback;
};

const envPath = getArg("--env", "supabase/functions/.env.scheduler");
const inputReportPath = getArg("--input", "docs/strict-case-fallback-report.json");
const outPrefix = getArg("--out-prefix", "docs/strict-case-operational");

const isAllowedMlDomain = (url) =>
  /^https?:\/\/(www\.)?(mercadolivre\.com\.br|mercadolivre\.com|produto\.mercadolivre\.com\.br)\//i.test(
    String(url || "").trim(),
  );

const isCatalogPermalink = (url) => /\/p\/MLB\d{6,14}/i.test(String(url || ""));

const extractExplicitMlItem = (url) => {
  const direct = extractMlItemIdFromUrl(url);
  if (direct) return direct;
  const fallback = String(url || "").toUpperCase().match(/\/MLB[-_ ]?(\d{6,14})(?:[-_/]|$)/);
  if (fallback?.[1]) return `MLB${fallback[1]}`;
  return null;
};

const toCsv = (rows) => {
  if (!rows.length) return "";
  const headers = Object.keys(rows[0]);
  const encode = (value) => {
    if (value === null || value === undefined) return "";
    const text = String(value);
    if (/[",\n]/.test(text)) return `"${text.replace(/"/g, '""')}"`;
    return text;
  };
  const lines = [headers.join(",")];
  for (const row of rows) {
    lines.push(headers.map((header) => encode(row[header])).join(","));
  }
  return lines.join("\n");
};

const ensureDir = (filePath) => {
  const dir = path.dirname(path.resolve(filePath));
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
};

const evaluateProductCoherence = (row, expectedSourceUrl = null) => {
  const sourceUrl = String(row?.source_url || "").trim() || String(row?.affiliate_link || "").trim();
  const trackedMlItem = resolveCanonicalMlItemId(row);
  const sourceItem = extractExplicitMlItem(sourceUrl);
  const affiliateItem = extractExplicitMlItem(row?.affiliate_link);
  const affiliateSec = isMercadoLivreSecLink(row?.affiliate_link);
  const sourceIsCatalog = isCatalogPermalink(sourceUrl);

  const checks = {
    has_tracked_ml_item: Boolean(trackedMlItem),
    has_source_url: Boolean(sourceUrl),
    source_domain_allowed: isAllowedMlDomain(sourceUrl),
    source_item_match_or_catalog_permalink: sourceIsCatalog
      ? true
      : sourceItem
        ? Boolean(trackedMlItem && sourceItem === trackedMlItem)
        : true,
    affiliate_sec_or_standby: affiliateSec || String(row?.status || "").toLowerCase() !== "active",
    affiliate_item_match_if_present: affiliateSec && affiliateItem
      ? Boolean(trackedMlItem && affiliateItem === trackedMlItem)
      : true,
    healthy_and_no_mismatch:
      String(row?.data_health_status || "HEALTHY") === "HEALTHY" &&
      String(row?.price_mismatch_status || "NONE") !== "OPEN",
    expected_collected_source_match: expectedSourceUrl
      ? sourceUrl === String(expectedSourceUrl).trim()
      : true,
  };

  const failed = Object.entries(checks)
    .filter(([, ok]) => !ok)
    .map(([key]) => key);

  return {
    ok: failed.length === 0,
    failed,
    source_url: sourceUrl,
    tracked_ml_item: trackedMlItem,
    source_ml_item: sourceItem,
    affiliate_ml_item: affiliateItem,
    checks,
  };
};

const main = async () => {
  const env = readRunnerEnv(envPath);
  if (!env.SUPABASE_URL || !env.SERVICE_ROLE_KEY) {
    throw new Error("SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY ausentes no ambiente.");
  }

  if (!fs.existsSync(inputReportPath)) {
    throw new Error(`Arquivo de entrada não encontrado: ${inputReportPath}`);
  }

  const input = JSON.parse(fs.readFileSync(inputReportPath, "utf8"));
  const selected = Array.isArray(input?.selected) ? input.selected : [];
  if (!selected.length) {
    throw new Error("Relatório de entrada não possui itens em selected.");
  }

  const client = createSupabaseRestClient({
    supabaseUrl: env.SUPABASE_URL,
    serviceRoleKey: env.SERVICE_ROLE_KEY,
  });

  const allRows = await client.request(
    "/products?select=id,name,marketplace,status,is_active,affiliate_verified,data_health_status,price_mismatch_status,ml_item_id,external_id,source_url,affiliate_link,canonical_offer_url,removed_at,updated_at&marketplace=ilike.mercado*&removed_at=is.null&limit=3000",
    { method: "GET" },
  );
  const rows = Array.isArray(allRows) ? allRows : [];
  const byId = new Map(rows.map((row) => [row.id, row]));

  const selectedOperational = selected.map((item, index) => ({
    position: index + 1,
    product_id: item.id,
    name: item.name,
    ml_item_id: item.ml_item_id,
    source_url: item.source_url,
  }));

  const activeRows = rows.filter(
    (row) => String(row?.status || "").toLowerCase() === "active" && Boolean(row?.is_active),
  );

  const selectedChecks = [];
  for (const item of selected) {
    const row = byId.get(item.id);
    if (!row) {
      selectedChecks.push({
        product_id: item.id,
        name: item.name,
        ok: false,
        failed: ["product_not_found"],
      });
      continue;
    }
    const coherence = evaluateProductCoherence(row, item.source_url);
    selectedChecks.push({
      product_id: row.id,
      name: row.name,
      status: row.status,
      is_active: row.is_active,
      ...coherence,
    });
  }

  const activeChecks = activeRows.map((row) => ({
    product_id: row.id,
    name: row.name,
    status: row.status,
    is_active: row.is_active,
    ...evaluateProductCoherence(row),
  }));

  const selectedFailures = selectedChecks.filter((item) => !item.ok);
  const activeFailures = activeChecks.filter((item) => !item.ok);

  const txtPath = `${outPrefix}-urls.txt`;
  const csvPath = `${outPrefix}-batch.csv`;
  const jsonPath = `${outPrefix}-batch.json`;
  const verifyPath = `${outPrefix}-coherence-report.json`;

  ensureDir(txtPath);
  fs.writeFileSync(txtPath, selectedOperational.map((row) => row.source_url).join("\n") + "\n", "utf8");
  fs.writeFileSync(csvPath, toCsv(selectedOperational), "utf8");
  fs.writeFileSync(jsonPath, JSON.stringify({ generated_at: new Date().toISOString(), items: selectedOperational }, null, 2), "utf8");
  fs.writeFileSync(
    verifyPath,
    JSON.stringify(
      {
        generated_at: new Date().toISOString(),
        input_report: path.resolve(inputReportPath),
        totals: {
          selected_total: selectedChecks.length,
          selected_ok: selectedChecks.length - selectedFailures.length,
          selected_fail: selectedFailures.length,
          active_total: activeChecks.length,
          active_ok: activeChecks.length - activeFailures.length,
          active_fail: activeFailures.length,
        },
        selected_failures: selectedFailures,
        active_failures: activeFailures,
      },
      null,
      2,
    ),
    "utf8",
  );

  console.log(
    JSON.stringify(
      {
        ok: true,
        outputs: {
          txt: path.resolve(txtPath),
          csv: path.resolve(csvPath),
          json: path.resolve(jsonPath),
          coherence_report: path.resolve(verifyPath),
        },
        totals: {
          selected_total: selectedChecks.length,
          selected_ok: selectedChecks.length - selectedFailures.length,
          selected_fail: selectedFailures.length,
          active_total: activeChecks.length,
          active_ok: activeChecks.length - activeFailures.length,
          active_fail: activeFailures.length,
        },
      },
      null,
      2,
    ),
  );
};

main().catch((error) => {
  console.error(error?.message || error);
  process.exit(1);
});
