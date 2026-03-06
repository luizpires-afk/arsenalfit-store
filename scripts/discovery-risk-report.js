import {
  DEFAULT_ENV,
  getArg,
  parseEnvAndClient,
  writeJson,
} from "./_affiliate_catalog_common.js";

const envFile = getArg("--env", DEFAULT_ENV);
const outFile = getArg("--out-file", "reports/discovery-risk-report.json");

const nowIso = () => new Date().toISOString();

const toN = (value, fallback = 0) => {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
};

const main = async () => {
  const { client } = parseEnvAndClient(envFile);
  const now = Date.now();
  const iso24h = new Date(now - 24 * 60 * 60 * 1000).toISOString();
  const iso72h = new Date(now - 72 * 60 * 60 * 1000).toISOString();

  const [
    backlogRows,
    created24h,
    created72h,
    alertsRows,
    events24h,
    events72h,
  ] = await Promise.all([
    client.fetchPagedRows("/discovery_candidates?select=id,status&status=in.(new,reviewing)&limit=5000", 1000),
    client.fetchPagedRows(`/discovery_candidates?select=id&created_at=gte.${encodeURIComponent(iso24h)}&limit=5000`, 1000),
    client.fetchPagedRows(`/discovery_candidates?select=id&created_at=gte.${encodeURIComponent(iso72h)}&limit=5000`, 1000),
    client.fetchPagedRows("/discovery_alerts?select=id,severity,status,created_at&status=in.(new,acknowledged)&limit=5000", 1000),
    client.fetchPagedRows(`/discovery_candidate_events?select=id,event_type,created_at&created_at=gte.${encodeURIComponent(iso24h)}&event_type=in.(approved,rejected,saved)&limit=10000`, 1000),
    client.fetchPagedRows(`/discovery_candidate_events?select=id,event_type,created_at&created_at=gte.${encodeURIComponent(iso72h)}&event_type=in.(approved,rejected,saved)&limit=20000`, 1000),
  ]);

  const alertsCritical = (alertsRows || []).filter((row) => String(row?.severity || "") === "critical").length;
  const alertsWarning = (alertsRows || []).filter((row) => String(row?.severity || "") === "warning").length;

  const throughput24h = toN(events24h?.length || 0);
  const throughput72h = toN(events72h?.length || 0);
  const backlog = toN(backlogRows?.length || 0);
  const intake24h = toN(created24h?.length || 0);
  const intake72h = toN(created72h?.length || 0);

  let riskLevel = "low";
  if (alertsCritical > 0 || backlog > 200) {
    riskLevel = "high";
  } else if (alertsWarning > 0 || backlog > 120 || throughput24h < 5) {
    riskLevel = "medium";
  }

  const payload = {
    generated_at: nowIso(),
    ok: true,
    backlog,
    intake: {
      candidates_24h: intake24h,
      candidates_72h: intake72h,
    },
    throughput: {
      decisions_24h: throughput24h,
      decisions_72h: throughput72h,
      decisions_per_hour_24h: Number((throughput24h / 24).toFixed(2)),
    },
    alerts: {
      critical_open: alertsCritical,
      warning_open: alertsWarning,
      total_open: toN(alertsRows?.length || 0),
    },
    risk: {
      level: riskLevel,
      reasons: {
        backlog_gt_120: backlog > 120,
        backlog_gt_200: backlog > 200,
        low_decisions_24h: throughput24h < 5,
        critical_alert_open: alertsCritical > 0,
      },
    },
  };

  writeJson(outFile, payload);
  console.log(JSON.stringify(payload, null, 2));
};

main().catch((error) => {
  console.error(error?.message || error);
  process.exit(1);
});
