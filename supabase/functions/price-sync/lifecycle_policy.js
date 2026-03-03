const REACTIVATABLE_AUTO_DISABLED_REASONS = new Set([
  "supervisao_automatica_incoerencia",
  "suspect_outlier",
  "suspect_untrusted_drop",
  "suspect_offer_binding",
  "suspect_catalog_without_preferred_item",
  "http_404",
]);

const normalize = (value) => String(value ?? "").trim().toLowerCase();

const canAutoReactivateByReason = (reason) => {
  const normalized = normalize(reason);
  if (!normalized) return false;
  if (normalized === "blocked") return false;
  if (REACTIVATABLE_AUTO_DISABLED_REASONS.has(normalized)) return true;
  return normalized.startsWith("suspect_");
};

export const resolveLifecycleState = ({
  existingStatus,
  existingIsActive,
  mappedStatus,
  autoDisabledReason,
  isReliableSource,
}) => {
  const currentStatus = normalize(existingStatus);
  const incomingStatus = normalize(mappedStatus) || "active";
  const disabledReason = normalize(autoDisabledReason);
  const hasAutoDisabledReason = disabledReason.length > 0;

  const shouldKeepPaused = currentStatus === "paused";
  const shouldKeepManualStandby =
    currentStatus === "standby" && !hasAutoDisabledReason;

  const resolvedStatus = shouldKeepPaused || shouldKeepManualStandby
    ? (currentStatus || "active")
    : incomingStatus;

  const shouldReactivate =
    hasAutoDisabledReason &&
    canAutoReactivateByReason(disabledReason) &&
    isReliableSource === true &&
    resolvedStatus !== "paused" &&
    resolvedStatus !== "standby";

  const isActive = shouldReactivate ? true : existingIsActive ?? true;

  const reason = shouldReactivate
    ? "auto_reactivated_with_reliable_source"
    : shouldKeepPaused
      ? "preserve_paused"
      : shouldKeepManualStandby
        ? "preserve_manual_standby"
        : "follow_marketplace_status";

  return {
    resolvedStatus,
    isActive,
    shouldReactivate,
    reason,
  };
};
