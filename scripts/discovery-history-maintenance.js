import { DEFAULT_ENV, getArg, parseEnvAndClient, writeJson } from "./_affiliate_catalog_common.js";

const envFile = getArg("--env", DEFAULT_ENV);
const outFile = getArg("--out-file", "reports/discovery-history-maintenance.json");
const keepDays = Math.max(30, Number(getArg("--keep-days", "180")) || 180);

async function main() {
  const { client } = parseEnvAndClient(envFile);
  const threshold = new Date(Date.now() - keepDays * 24 * 60 * 60 * 1000).toISOString();

  const staleRows = await client.request(
    `/discovery_price_history?select=id&captured_at=lt.${encodeURIComponent(threshold)}&limit=10000`,
    { method: "GET" },
  );

  let removed = 0;
  for (const row of staleRows || []) {
    await client.request(`/discovery_price_history?id=eq.${row.id}`, { method: "DELETE" });
    removed += 1;
  }

  const report = {
    generated_at: new Date().toISOString(),
    ok: true,
    keep_days: keepDays,
    threshold,
    removed,
  };
  writeJson(outFile, report);
  console.log(JSON.stringify(report, null, 2));
}

main().catch((error) => {
  console.error(error?.message || error);
  process.exit(1);
});
