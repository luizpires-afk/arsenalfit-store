import { seoGenerationService } from "./seoGenerationService.js";

const nowIso = () => new Date().toISOString();

const createSlugFallback = (externalId) => `discovery-${String(externalId || "ml")}-${Date.now()}`;

export async function upsertDiscoveryCandidates({ client, acceptedRows = [] }) {
  if (!acceptedRows.length) return [];

  await client.request(
    "/discovery_candidates?on_conflict=marketplace,external_product_id",
    {
      method: "POST",
      headers: {
        Prefer: "resolution=merge-duplicates,return=representation",
      },
      body: JSON.stringify(acceptedRows),
    },
  );

  const ids = acceptedRows.map((row) => row.external_product_id).filter(Boolean);
  const inFilter = ids.map((id) => `"${String(id).replace(/"/g, '\\"')}"`).join(",");
  if (!inFilter) return [];

  return await client.request(
    `/discovery_candidates?select=*&marketplace=eq.mercadolivre&external_product_id=in.(${inFilter})`,
    { method: "GET" },
  );
}

export async function writeCandidateEvent({ client, candidateId, previousStatus = null, nextStatus, eventType, payload = {}, actor = "system" }) {
  await client.request("/discovery_candidate_events", {
    method: "POST",
    headers: { Prefer: "return=minimal" },
    body: JSON.stringify([
      {
        candidate_id: candidateId,
        event_type: eventType,
        previous_status: previousStatus,
        next_status: nextStatus,
        event_payload: payload,
        actor,
      },
    ]),
  });
}

export async function approveCandidateAndGenerateSeo({ client, candidate, productId = null, actor = "admin" }) {
  const seoPayload = seoGenerationService(candidate);

  await client.patch(`/discovery_candidates?id=eq.${candidate.id}`, {
    status: "approved",
    reviewed_at: nowIso(),
    updated_at: nowIso(),
  });

  await writeCandidateEvent({
    client,
    candidateId: candidate.id,
    previousStatus: candidate.status,
    nextStatus: "approved",
    eventType: "approved",
    payload: { seo_slug: seoPayload.slug },
    actor,
  });

  await client.request("/seo_generated_pages?on_conflict=slug", {
    method: "POST",
    headers: {
      Prefer: "resolution=merge-duplicates,return=minimal",
    },
    body: JSON.stringify([
      {
        candidate_id: candidate.id,
        marketplace: candidate.marketplace,
        external_product_id: candidate.external_product_id,
        slug: seoPayload.slug || createSlugFallback(candidate.external_product_id),
        title: seoPayload.title,
        meta_description: seoPayload.meta_description,
        seo_description: seoPayload.seo_description,
        faq_json: seoPayload.faq_json,
        schema_json: seoPayload.schema_json,
        affiliate_link: candidate.affiliate_link,
        publication_status: "published",
        published_product_id: productId,
      },
    ]),
  });

  return seoPayload;
}
