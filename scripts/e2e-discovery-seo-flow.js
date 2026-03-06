import {
  DEFAULT_ENV,
  getArg,
  parseEnvAndClient,
  writeJson,
  toSlug,
} from "./_affiliate_catalog_common.js";
import { approveCandidateAndGenerateSeo } from "./discovery/discoveryQueueService.js";
import { upsertDiscoveryCandidates } from "./discovery/discoveryQueueService.js";

const envFile = getArg("--env", DEFAULT_ENV);
const outFile = getArg("--out-file", "reports/e2e-discovery-seo-flow.json");
const actor = getArg("--actor", "e2e_ops");
const limit = Math.max(1, Number(getArg("--limit", "20")) || 20);
const autoSeed = String(getArg("--auto-seed", "true")).toLowerCase() !== "false";

const nowIso = () => new Date().toISOString();

const loadSeedProduct = async (client) => {
  const rows = await client.request(
    "/discovery_products?select=marketplace,external_product_id,title,category,seller,seller_reputation,affiliate_link,product_url,current_price,original_price,discount_percent,sold_quantity,reviews_count,rating,stock,favorites_count,opportunity_score,viral_score,score_components,updated_at&marketplace=eq.mercadolivre&order=updated_at.desc&limit=1",
    { method: "GET" },
  );
  return (rows || [])[0] || null;
};

const seedCandidateFromProduct = async (client, actorName) => {
  const product = await loadSeedProduct(client);
  const syntheticExternalId = `E2E-${Date.now()}`;
  const source = product?.external_product_id
    ? product
    : {
        marketplace: "mercadolivre",
        external_product_id: syntheticExternalId,
        title: "E2E Discovery Seed Candidate",
        category: "e2e",
        seller: "system",
        seller_reputation: "unknown",
        affiliate_link: null,
        product_url: null,
        current_price: 99,
        original_price: 129,
        discount_percent: 23,
        sold_quantity: 10,
        reviews_count: 1,
        rating: 4.5,
        stock: 5,
        favorites_count: 0,
        opportunity_score: 52,
        viral_score: 51,
        score_components: {},
      };

  const seededAt = nowIso();
  const slug = toSlug(source.title || source.external_product_id || "discovery-seed", "discovery-seed");
  const acceptedRows = [
    {
      marketplace: source.marketplace || "mercadolivre",
      external_product_id: source.external_product_id,
      title: source.title || `E2E Discovery Seed ${source.external_product_id}`,
      category: source.category || "e2e",
      seller: source.seller || "system",
      seller_reputation: source.seller_reputation || "unknown",
      affiliate_link: source.affiliate_link || null,
      product_url: source.product_url || null,
      current_price: Number(source.current_price || 0),
      original_price: Number(source.original_price || 0),
      discount_percent: Number(source.discount_percent || 0),
      sold_quantity: Number(source.sold_quantity || 0),
      reviews_count: Number(source.reviews_count || 0),
      rating: Number(source.rating || 0),
      stock: Number(source.stock || 0),
      favorites_count: Number(source.favorites_count || 0),
      opportunity_score: Number(source.opportunity_score || 50),
      viral_score: Number(source.viral_score || 50),
      viral_momentum_score: Number(source.viral_score || 50),
      signal_origin: "e2e_auto_seed",
      score_components: {
        ...(source.score_components || {}),
        metadata: {
          ...(source?.score_components?.metadata || {}),
          e2e_seeded_by: actorName,
          e2e_seeded_at: seededAt,
          e2e_seed_slug: slug,
        },
      },
      status: "new",
      confidence: 0.51,
      score_version: "e2e-seed-v1",
      score_decision_reason: "e2e_auto_seed_queue_empty",
      updated_at: seededAt,
    },
  ];

  const upserted = await upsertDiscoveryCandidates({ client, acceptedRows });
  const candidate = (upserted || []).find((row) => String(row?.external_product_id || "") === String(source.external_product_id));
  if (!candidate) {
    return { ok: false, reason: "candidate_seed_upsert_empty" };
  }

  return {
    ok: true,
    reason: product?.external_product_id
      ? "candidate_seeded_from_discovery_products"
      : "candidate_seeded_synthetic_fallback",
    candidate,
    seed: {
      external_product_id: source.external_product_id,
      title: source.title || null,
      seeded_at: seededAt,
      signal_origin: "e2e_auto_seed",
      source: product?.external_product_id ? "discovery_products" : "synthetic",
    },
  };
};

const main = async () => {
  const { client } = parseEnvAndClient(envFile);
  const generatedAt = new Date().toISOString();

  const candidates = await client.request(
    `/discovery_candidates?select=*&status=in.(new,reviewing,saved)&order=updated_at.desc&limit=${limit}`,
    { method: "GET" },
  );

  let candidate = (candidates || [])[0] || null;
  let seedResult = null;
  if (!candidate && autoSeed) {
    seedResult = await seedCandidateFromProduct(client, actor);
    if (seedResult?.ok) candidate = seedResult.candidate;
  }

  if (!candidate) {
    const payload = {
      generated_at: generatedAt,
      ok: false,
      reason: seedResult?.reason || "no_candidate_available_for_e2e",
      auto_seed_attempted: autoSeed,
    };
    writeJson(outFile, payload);
    console.log(JSON.stringify(payload, null, 2));
    process.exit(1);
  }

  await approveCandidateAndGenerateSeo({
    client,
    candidate,
    productId: null,
    actor,
  });

  const [updatedRows, eventRows, seoRows] = await Promise.all([
    client.request(`/discovery_candidates?select=id,status,reviewed_at,updated_at&id=eq.${candidate.id}`, { method: "GET" }),
    client.request(`/discovery_candidate_events?select=id,event_type,next_status,actor,created_at,candidate_id&candidate_id=eq.${candidate.id}&order=created_at.desc&limit=10`, { method: "GET" }),
    client.request(`/seo_generated_pages?select=id,candidate_id,slug,title,publication_status,created_at&candidate_id=eq.${candidate.id}&order=created_at.desc&limit=10`, { method: "GET" }),
  ]);

  const updated = (updatedRows || [])[0] || null;
  const approvedEvent = (eventRows || []).find((row) => row.event_type === "approved");
  const seoPublished = (seoRows || []).find((row) => row.publication_status === "published");

  const payload = {
    generated_at: generatedAt,
    ok: Boolean(updated?.status === "approved" && approvedEvent && seoPublished),
    input: {
      candidate_id: candidate.id,
      previous_status: candidate.status,
    },
    transitions: {
      candidate_status_after: updated?.status || null,
      approved_event: approvedEvent || null,
      seo_publication: seoPublished || null,
    },
    auto_seed: seedResult,
  };

  writeJson(outFile, payload);
  console.log(JSON.stringify(payload, null, 2));

  if (!payload.ok) {
    process.exit(1);
  }
};

main().catch((error) => {
  console.error(error?.message || error);
  process.exit(1);
});
