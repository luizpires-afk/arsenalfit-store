import fetch from "node-fetch";

const API_BASE = "https://api.mercadolibre.com/items/";
const DEFAULT_TIMEOUT_MS = 8000;

const mapStatus = (data) => {
  const rawStatus = String(data?.status || "").toLowerCase();
  if (rawStatus === "paused") return "paused";
  if (rawStatus === "closed" || rawStatus === "inactive" || data?.available_quantity === 0) {
    return "out_of_stock";
  }
  return "active";
};

export const fetchMercadoLivreItem = async ({
  itemId,
  etag,
  accessToken,
  timeoutMs,
}) => {
  const url = `${API_BASE}${encodeURIComponent(itemId)}`;
  const headers = {
    Accept: "application/json",
  };

  if (etag) headers["If-None-Match"] = etag;
  if (accessToken) headers.Authorization = `Bearer ${accessToken}`;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs ?? DEFAULT_TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      method: "GET",
      headers,
      signal: controller.signal,
    });

    const responseEtag = response.headers.get("etag");

    if (response.status === 304) {
      return { statusCode: 304, etag: responseEtag };
    }

    if (response.status === 200) {
      const data = await response.json();
      return {
        statusCode: 200,
        price: data?.price,
        status: mapStatus(data),
        etag: responseEtag,
      };
    }

    return { statusCode: response.status, etag: responseEtag };
  } catch (error) {
    if (error?.name === "AbortError") {
      return { isTimeout: true, error: "timeout" };
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
};

export const mercadolivreProvider = {
  marketplace: "mercadolivre",
  fetchItem: fetchMercadoLivreItem,
};
