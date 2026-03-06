import {
  DEFAULT_ENV,
  getArg,
  parseEnvAndClient,
  writeJson,
} from "./_affiliate_catalog_common.js";
import { approveCandidateAndGenerateSeo } from "./discovery/discoveryQueueService.js";

const envFile = getArg("--env", DEFAULT_ENV);
const outFile = getArg("--out-file", "reports/e2e-discovery-seo-flow.json");
const actor = getArg("--actor", "e2e_ops");
const limit = Math.max(1, Number(getArg("--limit", "20")) || 20);

const main = async () => {
  const { client } = parseEnvAndClient(envFile);
  const generatedAt = new Date().toISOString();

  const candidates = await client.request(
    `/discovery_candidates?select=*&status=in.(new,reviewing,saved)&order=updated_at.desc&limit=${limit}`,
    { method: "GET" },
  );

  const candidate = (candidates || [])[0] || null;
  if (!candidate) {
    const payload = {
      generated_at: generatedAt,
      ok: false,
      reason: "no_candidate_available_for_e2e",
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
