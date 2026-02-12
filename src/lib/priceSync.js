const HOURS_6_MS = 6 * 60 * 60 * 1000;
const HOURS_12_MS = 12 * 60 * 60 * 1000;
const HOURS_24_MS = 24 * 60 * 60 * 1000;

const addHours = (now, ms) => new Date(now.getTime() + ms);

export const buildUpdatePayload = ({ product, result, now }) => {
  const safeNow = now instanceof Date ? now : new Date(now);
  const base = {
    last_sync: safeNow.toISOString(),
  };

  const statusCode = result?.statusCode;
  const isTimeout = result?.isTimeout === true;

  if (statusCode === 304) {
    const nextCheck = addHours(safeNow, HOURS_6_MS).toISOString();
    return {
      update: {
        ...base,
        next_check_at: nextCheck,
      },
      nextCheck,
      action: "not_modified",
    };
  }

  if (statusCode === 200 && typeof result?.price === "number") {
    const nextCheck = addHours(safeNow, HOURS_6_MS).toISOString();
    const resolvedStatus =
      product?.status === "paused"
        ? "paused"
        : result?.status ?? product?.status ?? "active";
    const currentOriginal = product?.original_price ?? null;
    const candidateOriginal = Math.max(product?.price ?? 0, result.price);
    const nextOriginal =
      currentOriginal === null
        ? candidateOriginal
        : result.price > currentOriginal
          ? result.price
          : currentOriginal;
    const discountPercentage =
      nextOriginal && nextOriginal > result.price
        ? Math.round(((nextOriginal - result.price) / nextOriginal) * 100)
        : 0;
    const hasPriceChange =
      typeof result.price === "number" &&
      (product?.price === null || product?.price === undefined || result.price !== product.price);
    return {
      update: {
        ...base,
        previous_price: product?.price ?? null,
        original_price: nextOriginal,
        price: result.price,
        discount_percentage: discountPercentage,
        ...(hasPriceChange
          ? { detected_price: result.price, detected_at: safeNow.toISOString() }
          : {}),
        etag: result?.etag ?? product?.etag ?? null,
        status: resolvedStatus,
        next_check_at: nextCheck,
      },
      nextCheck,
      action: "updated",
    };
  }

  if (statusCode === 404) {
    const nextCheck = addHours(safeNow, HOURS_24_MS).toISOString();
    return {
      update: {
        ...base,
        status: "paused",
        next_check_at: nextCheck,
      },
      nextCheck,
      action: "not_found",
    };
  }

  if (statusCode === 403 || statusCode === 429 || isTimeout) {
    const nextCheck = addHours(safeNow, HOURS_12_MS).toISOString();
    return {
      update: {
        ...base,
        next_check_at: nextCheck,
      },
      nextCheck,
      action: "backoff",
    };
  }

  const nextCheck = addHours(safeNow, HOURS_12_MS).toISOString();
  return {
    update: {
      ...base,
      next_check_at: nextCheck,
    },
    nextCheck,
    action: "error",
  };
};

export const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export const randomInt = (min, max) => {
  const minValue = Math.ceil(min);
  const maxValue = Math.floor(max);
  return Math.floor(Math.random() * (maxValue - minValue + 1)) + minValue;
};

export const isTimeoutError = (error) => {
  return error?.name === "AbortError" || error?.code === "ETIMEDOUT";
};

export const hoursFromNow = (now, hours) =>
  new Date((now instanceof Date ? now : new Date(now)).getTime() + hours * 60 * 60 * 1000).toISOString();

export const NEXT_CHECK_HOURS = {
  SUCCESS: 6,
  BACKOFF: 12,
};
