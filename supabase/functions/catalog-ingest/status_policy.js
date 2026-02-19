const normalizeStatus = (value) => String(value ?? "").trim().toLowerCase();

const isPausedLike = (status) => {
  const normalized = normalizeStatus(status);
  return normalized === "paused" || normalized === "archived";
};

export const resolveExistingProductActivation = ({
  existingStatus,
  existingIsActive,
  affiliateVerified,
  qualityPublishable,
  forceStandby,
  isPinned,
  preserveExistingActive = true,
}) => {
  const status = normalizeStatus(existingStatus);
  const keepPaused = status === "paused" && !isPinned;
  if (keepPaused) {
    return { status: "paused", isActive: false, reason: "keep_paused" };
  }

  const shouldPreserve =
    preserveExistingActive &&
    existingIsActive === true &&
    !isPausedLike(existingStatus);
  if (shouldPreserve) {
    return { status: "active", isActive: true, reason: "preserve_existing_active" };
  }

  const canActivate =
    affiliateVerified === true &&
    qualityPublishable === true &&
    forceStandby !== true;

  return canActivate
    ? { status: "active", isActive: true, reason: "affiliate_validated" }
    : { status: "standby", isActive: false, reason: "pending_validation_or_quality" };
};

export const resolveNewProductActivation = ({
  affiliateVerified,
  qualityPublishable,
  forceStandby,
}) => {
  const shouldActivate =
    affiliateVerified === true &&
    qualityPublishable === true &&
    forceStandby !== true;
  return shouldActivate
    ? { status: "active", isActive: true, reason: "affiliate_validated" }
    : { status: "standby", isActive: false, reason: "pending_validation_or_quality" };
};
