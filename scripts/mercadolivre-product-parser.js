import {
  DEFAULT_ENV,
  getArg,
  parseEnvAndClient,
  chunk,
  normalizeMlItemId,
  writeJson,
} from "./_affiliate_catalog_common.js";

const envFile = getArg("--env", DEFAULT_ENV);
const outFile = getArg("--out-file", "logs/mercadolivre-product-parser.json");
const limit = Number(getArg("--limit", "200")) || 200;

const extractJsonLdBlocks = (html) => {
  const blocks = [];
  const re = /<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let match;
  while ((match = re.exec(html)) !== null) {
    const raw = String(match[1] || "").trim();
    if (raw) blocks.push(raw);
  }
  return blocks;
};

const findProductJsonLd = (html) => {
  const blocks = extractJsonLdBlocks(html);
  for (const block of blocks) {
    try {
      const parsed = JSON.parse(block);
      const list = Array.isArray(parsed) ? parsed : [parsed];
      for (const item of list) {
        const type = String(item?.["@type"] || "").toLowerCase();
        if (type.includes("product")) return item;
      }
    } catch {
      // ignore invalid JSON-LD block
    }
  }
  return null;
};

const num = (value) => {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
};

const intOrNull = (value) => {
  const n = Number(value);
  if (!Number.isFinite(n)) return null;
  return Math.floor(n);
};

const parseAvailabilityToStock = (availability) => {
  const text = String(availability || "").toLowerCase();
  if (!text) return null;
  if (text.includes("instock") || text.includes("in_stock")) return 1;
  if (text.includes("outofstock") || text.includes("out_of_stock")) return 0;
  return null;
};

const parseMercadoLivreProductPage = (html, sourceUrl) => {
  const product = findProductJsonLd(html);
  const title = product?.name || null;
  const image = Array.isArray(product?.image) ? product.image[0] || null : product?.image || null;
  const offer = Array.isArray(product?.offers) ? product.offers[0] || {} : product?.offers || {};
  const price = num(offer?.price ?? product?.price);
  const seller =
    product?.brand?.name ||
    product?.seller?.name ||
    product?.offers?.seller?.name ||
    product?.offers?.offeredBy?.name ||
    null;
  const rating = num(product?.aggregateRating?.ratingValue);
  const reviewCount = intOrNull(product?.aggregateRating?.reviewCount);
  const category = product?.category || null;
  const stock = parseAvailabilityToStock(offer?.availability || product?.availability);

  return {
    source_url: sourceUrl,
    title,
    price,
    image,
    seller,
    rating,
    review_count: reviewCount,
    stock,
    category,
    raw_payload: {
      parser: "mercadolivre-product-parser",
      product_json_ld: product,
    },
  };
};

const fetchHtml = async (url) => {
  const resp = await fetch(url, {
    method: "GET",
    headers: {
      "user-agent": "Mozilla/5.0 (compatible; ArsenalFitBot/1.0)",
      accept: "text/html,application/xhtml+xml",
    },
  });
  if (!resp.ok) {
    throw new Error(`fetch_failed:${resp.status}`);
  }
  return resp.text();
};

const fetchMlApiFallback = async (mlItemId) => {
  try {
    const itemResp = await fetch(`https://api.mercadolibre.com/items/${encodeURIComponent(mlItemId)}`);
    if (!itemResp.ok) return null;
    const item = await itemResp.json();

    let reviews = null;
    try {
      const reviewResp = await fetch(`https://api.mercadolibre.com/reviews/item/${encodeURIComponent(mlItemId)}`);
      if (reviewResp.ok) reviews = await reviewResp.json();
    } catch {
      reviews = null;
    }

    return {
      title: item?.title || null,
      price: num(item?.price),
      image: item?.thumbnail || item?.secure_thumbnail || null,
      seller: String(item?.seller_id || "") || null,
      rating: num(reviews?.rating_average),
      review_count: intOrNull(reviews?.paging?.total),
      stock: intOrNull(item?.available_quantity),
      category: item?.category_id || null,
      raw_payload: {
        parser: "mercadolivre-product-parser-api-fallback",
        item,
        reviews,
      },
    };
  } catch {
    return null;
  }
};

const main = async () => {
  const { client } = parseEnvAndClient(envFile);

  const products = await client.fetchPagedRows(
    `/products?select=id,ml_item_id,source_url,marketplace,status&marketplace=eq.mercadolivre&source_url=not.is.null&order=updated_at.desc&limit=${limit}`,
    200,
  );

  const upserts = [];
  const errors = [];

  for (const row of products) {
    const sourceUrl = String(row?.source_url || "").trim();
    const mlItemId = normalizeMlItemId(row?.ml_item_id || sourceUrl);
    if (!sourceUrl || !mlItemId) {
      errors.push({ id: row?.id || null, reason: "missing_source_or_ml_item_id" });
      continue;
    }

    try {
      const html = await fetchHtml(sourceUrl);
      const parsed = parseMercadoLivreProductPage(html, sourceUrl);
      const fallbackNeeded = !parsed.title || parsed.price === null;
      const apiFallback = fallbackNeeded ? await fetchMlApiFallback(mlItemId) : null;

      upserts.push({
        product_id: row.id,
        ml_item_id: mlItemId,
        source_url: sourceUrl,
        title: apiFallback?.title ?? parsed.title,
        price: apiFallback?.price ?? parsed.price,
        image: apiFallback?.image ?? parsed.image,
        seller: apiFallback?.seller ?? parsed.seller,
        rating: apiFallback?.rating ?? parsed.rating,
        review_count: apiFallback?.review_count ?? parsed.review_count,
        stock: apiFallback?.stock ?? parsed.stock,
        category: apiFallback?.category ?? parsed.category,
        raw_payload: apiFallback?.raw_payload || parsed.raw_payload,
      });
    } catch (error) {
      const apiFallback = await fetchMlApiFallback(mlItemId);
      if (apiFallback) {
        upserts.push({
          product_id: row.id,
          ml_item_id: mlItemId,
          source_url: sourceUrl,
          title: apiFallback.title,
          price: apiFallback.price,
          image: apiFallback.image,
          seller: apiFallback.seller,
          rating: apiFallback.rating,
          review_count: apiFallback.review_count,
          stock: apiFallback.stock,
          category: apiFallback.category,
          raw_payload: apiFallback.raw_payload,
        });
      } else {
        errors.push({ id: row.id, ml_item_id: mlItemId, reason: error?.message || "parse_failed" });
      }
    }
  }

  let upserted = 0;
  for (const batch of chunk(upserts, 100)) {
    const result = await client.request(`/product_catalog_data`, {
      method: "POST",
      headers: {
        Prefer: "resolution=merge-duplicates,return=representation",
      },
      body: JSON.stringify(batch),
    });
    upserted += Array.isArray(result) ? result.length : batch.length;
  }

  const report = {
    generated_at: new Date().toISOString(),
    totals: {
      products_scanned: products.length,
      products_selected: upserts.length,
      product_catalog_data_upserted: upserted,
      errors: errors.length,
    },
    errors: errors.slice(0, 50),
  };

  writeJson(outFile, report);
  console.log(JSON.stringify(report, null, 2));
};

main().catch((error) => {
  console.error(error?.message || error);
  process.exit(1);
});
