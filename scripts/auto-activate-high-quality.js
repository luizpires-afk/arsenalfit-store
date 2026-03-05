import {
  DEFAULT_ENV,
  getArg,
  parseEnvAndClient,
  writeJson,
} from "./_affiliate_catalog_common.js";

const envFile = getArg("--env", DEFAULT_ENV);
const outFile = getArg("--out-file", "logs/auto-activate-high-quality.json");
const limit = Math.max(100, Number(getArg("--limit", "50000")) || 50000);

const toNum = (value) => {
  const n = Number(value || 0);
  return Number.isFinite(n) ? n : 0;
};

const meetsQualityGate = (row) =>
  toNum(row?.profit_score) > 0.6 &&
  toNum(row?.trend_score) > 0.5 &&
  toNum(row?.conversion_score) > 0.4;

const main = async () => {
  const { client } = parseEnvAndClient(envFile);
  const nowIso = new Date().toISOString();

  const products = await client.fetchPagedRows(
    `/products?select=id,is_active,status,profit_score,trend_score,conversion_score,removed_at&marketplace=eq.mercadolivre&removed_at=is.null&limit=${limit}`,
    1000,
  );

  const target = (products || []).filter((row) => !row?.is_active && meetsQualityGate(row));

  let activated = 0;
  for (const row of target) {
    const patched = await client.patch(`/products?id=eq.${encodeURIComponent(row.id)}`, {
      is_active: true,
      status: "active",
      updated_at: nowIso,
    });
    if (Array.isArray(patched) && patched.length > 0) activated += 1;
  }

  const report = {
    generated_at: nowIso,
    ok: true,
    thresholds: {
      profit_score: "> 0.6",
      trend_score: "> 0.5",
      conversion_score: "> 0.4",
    },
    totals: {
      scanned: products.length,
      qualified_for_activation: target.length,
      activated,
    },
  };

  writeJson(outFile, report);
  console.log(JSON.stringify(report, null, 2));
};

main().catch((error) => {
  console.error(error?.message || error);
  process.exit(1);
});
