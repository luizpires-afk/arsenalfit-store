import {
  DEFAULT_ENV,
  getArg,
  parseEnvAndClient,
  writeJson,
} from "./_affiliate_catalog_common.js";

const envFile = getArg("--env", DEFAULT_ENV);
const outFile = getArg("--out-file", "reports/viral-momentum-observability.json");
const minScored24h = Math.max(1, Number(getArg("--min-scored-24h", process.env.VIRAL_MIN_SCORED_24H || "10")) || 10);

const toN = (v, fallback = 0) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
};

const main = async () => {
  const { client } = parseEnvAndClient(envFile);
  const now = Date.now();
  const iso24h = new Date(now - 24 * 60 * 60 * 1000).toISOString();

  const [scores24h, highScores, candidates, alerts] = await Promise.all([
    client.fetchPagedRows(`/viral_scores?select=id,score,created_at&created_at=gte.${encodeURIComponent(iso24h)}&limit=10000`, 1000).catch(() => []),
    client.fetchPagedRows(`/viral_scores?select=id,score,created_at&created_at=gte.${encodeURIComponent(iso24h)}&score=gte.78&limit=10000`, 1000).catch(() => []),
    client.fetchPagedRows(`/discovery_candidates?select=id,status,updated_at&updated_at=gte.${encodeURIComponent(iso24h)}&limit=10000`, 1000).catch(() => []),
    client.fetchPagedRows("/discovery_alerts?select=id,severity,status,alert_type,created_at&status=in.(new,acknowledged)&limit=10000", 1000).catch(() => []),
  ]);

  const scored24h = toN(scores24h?.length || 0);
  const highViral24h = toN(highScores?.length || 0);
  const approved24h = (candidates || []).filter((row) => String(row?.status || "") === "approved").length;
  const criticalOpen = (alerts || []).filter((row) => String(row?.severity || "") === "critical").length;

  let riskLevel = "low";
  if (scored24h < minScored24h || criticalOpen > 0) riskLevel = "high";
  else if (highViral24h === 0 || approved24h === 0) riskLevel = "medium";

  if (scored24h < minScored24h) {
    await client.request("/discovery_alerts", {
      method: "POST",
      headers: { Prefer: "return=minimal" },
      body: JSON.stringify([
        {
          marketplace: "mercadolivre",
          external_product_id: "viral-baseline",
          alert_type: "pipeline_issue",
          severity: "critical",
          status: "new",
          message: `viral momentum baseline breached: scored_24h=${scored24h}, expected_min=${minScored24h}`,
          payload: {
            scored_24h: scored24h,
            expected_min: minScored24h,
          },
        },
      ]),
    }).catch(() => null);
  }

  const report = {
    generated_at: new Date(now).toISOString(),
    ok: true,
    metrics: {
      scored_24h: scored24h,
      high_viral_24h: highViral24h,
      approved_24h: approved24h,
      critical_alerts_open: criticalOpen,
    },
    baseline: {
      expected_min_scored_24h: minScored24h,
      breached: scored24h < minScored24h,
    },
    risk: {
      level: riskLevel,
      reasons: {
        baseline_breached: scored24h < minScored24h,
        no_high_viral_24h: highViral24h === 0,
        no_approved_24h: approved24h === 0,
        critical_alert_open: criticalOpen > 0,
      },
    },
  };

  writeJson(outFile, report);
  console.log(JSON.stringify(report, null, 2));
};

main().catch((error) => {
  console.error(error?.message || error);
  process.exit(1);
});
