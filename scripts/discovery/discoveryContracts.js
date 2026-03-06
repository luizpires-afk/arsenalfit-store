export const DISCOVERY_SCORE_PAYLOAD_VERSION = "v2";

export const DISCOVERY_STATUS_TRANSITIONS = {
  new: ["reviewing", "approved", "rejected", "saved"],
  reviewing: ["approved", "rejected", "saved"],
  saved: ["reviewing", "approved", "rejected"],
  approved: ["saved"],
  rejected: ["saved"],
};

export const DISCOVERY_EVENT_TYPES = [
  "reviewing",
  "approved",
  "rejected",
  "saved",
  "auto_filtered",
  "pipeline_issue",
];

export const DISCOVERY_ERROR_TAXONOMY = {
  P1: [
    "pipeline_down",
    "critical_baseline_breach",
    "schema_drift_blocking_write",
  ],
  P2: [
    "collector_degraded",
    "seo_publish_retry_exhausted",
    "batch_partial_failure",
  ],
  P3: [
    "quality_gate_filtered",
    "idempotent_skip",
    "non_critical_signal_missing",
  ],
};

export const classifyDiscoveryErrorSeverity = (code) => {
  const normalized = String(code || "").trim();
  if (DISCOVERY_ERROR_TAXONOMY.P1.includes(normalized)) return "P1";
  if (DISCOVERY_ERROR_TAXONOMY.P2.includes(normalized)) return "P2";
  if (DISCOVERY_ERROR_TAXONOMY.P3.includes(normalized)) return "P3";
  return "P3";
};

export const isValidDiscoveryTransition = (fromStatus, toStatus) => {
  const from = String(fromStatus || "");
  const to = String(toStatus || "");
  const allowed = DISCOVERY_STATUS_TRANSITIONS[from] || [];
  return allowed.includes(to);
};
