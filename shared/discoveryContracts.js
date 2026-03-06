export const DISCOVERY_SCORE_PAYLOAD_VERSION = "v2";

export const DISCOVERY_PRIORITY_LEVELS = ["P1", "P2", "P3"];

export const DISCOVERY_SEVERITY_TO_PRIORITY = {
  critical: "P1",
  warning: "P2",
  info: "P3",
};

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

export const discoveryPriorityFromSeverity = (severity) =>
  DISCOVERY_SEVERITY_TO_PRIORITY[String(severity || "").trim().toLowerCase()] || "P3";

export const classifyDiscoveryErrorSeverity = (code) => {
  const normalized = String(code || "").trim();
  if (DISCOVERY_ERROR_TAXONOMY.P1.includes(normalized)) return "P1";
  if (DISCOVERY_ERROR_TAXONOMY.P2.includes(normalized)) return "P2";
  if (DISCOVERY_ERROR_TAXONOMY.P3.includes(normalized)) return "P3";
  return "P3";
};

export const classifyDiscoveryError = (errorLike) => {
  const raw = String(errorLike?.code || errorLike?.message || errorLike || "")
    .trim()
    .toLowerCase();

  const matchedCode =
    Object.values(DISCOVERY_ERROR_TAXONOMY)
      .flat()
      .find((code) => raw.includes(code.toLowerCase())) || "non_critical_signal_missing";

  const priority = classifyDiscoveryErrorSeverity(matchedCode);
  return {
    code: matchedCode,
    severity: priority === "P1" ? "critical" : priority === "P2" ? "warning" : "info",
    priority,
  };
};

export const isValidDiscoveryTransition = (fromStatus, toStatus) => {
  const from = String(fromStatus || "");
  const to = String(toStatus || "");
  const allowed = DISCOVERY_STATUS_TRANSITIONS[from] || [];
  return allowed.includes(to);
};

export const buildScorePayload = ({
  payload_version = DISCOVERY_SCORE_PAYLOAD_VERSION,
  opportunity,
  viral,
  filter,
  metadata,
} = {}) => ({
  payload_version,
  opportunity: {
    score: Number(opportunity?.score || 0),
    components: { ...(opportunity?.components || {}), ...(opportunity?.explanation || {}) },
  },
  viral: {
    score: Number(viral?.score || 0),
    score_components: viral?.score_components || {},
    decision_reason: String(viral?.decision_reason || ""),
    score_version: String(viral?.score_version || "unknown"),
    signal_confidence: Number(viral?.signal_confidence || 0),
    top_signals: viral?.top_signals || [],
    windows: viral?.windows || {},
    components: { ...(viral?.components || {}), ...(viral?.explanation || {}) },
  },
  filter: {
    accepted: Boolean(filter?.accepted),
    reasons: Array.isArray(filter?.reasons) ? filter.reasons : [],
  },
  metadata: {
    ...(metadata || {}),
    generated_at: new Date().toISOString(),
  },
});
