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

export const classifyDiscoveryError = (errorInput) => {
  const raw = String(errorInput || "").toLowerCase();

  let code = "non_critical_signal_missing";
  if (raw.includes("below baseline") || raw.includes("expected_min")) {
    code = "critical_baseline_breach";
  } else if (raw.includes("schema") || raw.includes("column") || raw.includes("relation")) {
    code = "schema_drift_blocking_write";
  } else if (
    raw.includes("timeout") ||
    raw.includes("econnreset") ||
    raw.includes("network") ||
    raw.includes("429") ||
    raw.includes("ml_api_401") ||
    raw.includes("unauthorized")
  ) {
    code = "collector_degraded";
  } else if (raw.includes("pipeline") && raw.includes("down")) {
    code = "pipeline_down";
  } else if (raw.includes("partial") || raw.includes("batch")) {
    code = "batch_partial_failure";
  }

  const severity = classifyDiscoveryErrorSeverity(code);
  return {
    code,
    severity,
    priority: severity,
  };
};

export const buildScorePayload = ({
  payload_version = DISCOVERY_SCORE_PAYLOAD_VERSION,
  opportunity = {},
  viral = {},
  filter = {},
  metadata = {},
} = {}) => {
  return {
    payload_version,
    generated_at: new Date().toISOString(),
    opportunity: {
      score: Number(opportunity?.score || 0),
      components: opportunity?.components || {},
    },
    viral: {
      score: Number(viral?.score || 0),
      score_version: viral?.score_version || null,
      signal_confidence: Number(viral?.signal_confidence || 0),
      decision_reason: viral?.decision_reason || null,
      components: viral?.components || {},
    },
    filter: {
      passed: Boolean(filter?.passed),
      reasons: Array.isArray(filter?.reasons) ? filter.reasons : [],
    },
    metadata,
  };
};

export const isValidDiscoveryTransition = (fromStatus, toStatus) => {
  const from = String(fromStatus || "");
  const to = String(toStatus || "");
  const allowed = DISCOVERY_STATUS_TRANSITIONS[from] || [];
  return allowed.includes(to);
};
