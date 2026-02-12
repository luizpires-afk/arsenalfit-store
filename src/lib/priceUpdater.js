import { createHash } from "node:crypto";
import { buildUpdatePayload, isTimeoutError } from "./priceSync.js";

const maskEtag = (etag) => {
  if (!etag || typeof etag !== "string") return null;
  const hash = createHash("sha256").update(etag).digest("hex").slice(0, 8);
  return { len: etag.length, hash };
};

export const processProduct = async ({
  product,
  provider,
  now,
  accessToken,
  timeoutMs,
  onUpdate,
  log,
}) => {
  const startedAt = Date.now();
  let result = null;
  let errorMessage = null;

  if (!provider) {
    result = { statusCode: 0, error: "provider_not_found" };
  } else {
    try {
      result = await provider.fetchItem({
        itemId: product.external_id,
        etag: product.etag,
        accessToken,
        timeoutMs,
      });
    } catch (error) {
      if (isTimeoutError(error)) {
        result = { isTimeout: true, error: "timeout" };
      } else {
        result = { statusCode: 0, error: "provider_error" };
        errorMessage = error?.message || String(error);
      }
    }
  }

  const { update, nextCheck, action } = buildUpdatePayload({ product, result, now });

  await onUpdate(product.id, update);

  const durationMs = Date.now() - startedAt;
  const etagBefore = maskEtag(product?.etag);
  const etagAfter = maskEtag(result?.etag ?? product?.etag ?? null);

  if (log) {
    log({
      level: action === "updated" || action === "not_modified" ? "info" : "warn",
      message: "price_check",
      item_id: product.external_id,
      marketplace: product.marketplace,
      status_http: result?.statusCode ?? null,
      action,
      next_check: nextCheck,
      duration_ms: durationMs,
      etag_before: etagBefore,
      etag_after: etagAfter,
      preco_before: product?.price ?? null,
      preco_after:
        result?.statusCode === 200 && typeof result?.price === "number"
          ? result.price
          : product?.price ?? null,
      error: errorMessage || result?.error || null,
    });
  }

  return { result, nextCheck, action };
};
