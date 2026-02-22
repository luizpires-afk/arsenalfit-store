const {
  readRunnerEnv,
  createSupabaseRestClient,
} = require("./_supabase_runner_utils.cjs");

const args = process.argv.slice(2);
const getArg = (name, fallback = null) => {
  const index = args.indexOf(name);
  if (index === -1) return fallback;
  return index + 1 < args.length ? args[index + 1] : fallback;
};

const productId = getArg("--product-id") || getArg("--product");
const limit = Number(getArg("--limit", "20")) || 20;
const envPath = getArg("--env", "supabase/functions/.env.scheduler");

if (!productId) {
  console.error("Uso: node scripts/offer-link-trace-runner.cjs --product-id <uuid> [--limit 20] [--env supabase/functions/.env.scheduler]");
  process.exit(1);
}

const run = async () => {
  const env = readRunnerEnv(envPath);
  if (!env.SUPABASE_URL || !env.SERVICE_ROLE_KEY) {
    throw new Error("SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY ausentes no ambiente");
  }

  const client = createSupabaseRestClient({
    supabaseUrl: env.SUPABASE_URL,
    serviceRoleKey: env.SERVICE_ROLE_KEY,
  });

  const events = await client.request(
    `/v_product_offer_destination_trace?select=id,created_at,product_id,click_source,resolved_source,resolution_reason,destination_url,canonical_ml_item_id,destination_ml_item_id,previous_destination_ml_item_id,destination_ml_item_changed,product_price_snapshot,last_verified_price,last_verified_price_source,last_verified_at&product_id=eq.${productId}&order=created_at.desc,id.desc&limit=${Math.min(Math.max(limit, 1), 200)}`,
    { method: "GET" },
  );

  console.log("\n=== TRACE DE DESTINO ===");
  if (!Array.isArray(events) || events.length === 0) {
    console.log("Nenhum evento de clique encontrado para o produto.");
    return;
  }

  for (const event of events) {
    const effectivePrice =
      typeof event.last_verified_price === "number"
        ? event.last_verified_price
        : event.product_price_snapshot;

    let samePriceCandidates = [];
    if (typeof effectivePrice === "number") {
      samePriceCandidates = await client.request(
        `/products?select=id,name,ml_item_id,price,status,is_active,canonical_offer_url&marketplace=ilike.*mercado*&price=eq.${effectivePrice}&order=updated_at.desc&limit=15`,
        { method: "GET" },
      );
    }

    console.log(
      JSON.stringify(
        {
          click_id: event.id,
          created_at: event.created_at,
          reason: event.resolution_reason,
          resolved_source: event.resolved_source,
          destination_url: event.destination_url,
          canonical_ml_item_id: event.canonical_ml_item_id,
          destination_ml_item_id: event.destination_ml_item_id,
          previous_destination_ml_item_id: event.previous_destination_ml_item_id,
          destination_ml_item_changed: event.destination_ml_item_changed,
          product_price_snapshot: event.product_price_snapshot,
          last_verified_price: event.last_verified_price,
          last_verified_price_source: event.last_verified_price_source,
          last_verified_at: event.last_verified_at,
          ml_products_same_price: Array.isArray(samePriceCandidates)
            ? samePriceCandidates.map((row) => ({
                id: row.id,
                name: row.name,
                ml_item_id: row.ml_item_id,
                price: row.price,
                status: row.status,
                is_active: row.is_active,
                canonical_offer_url: row.canonical_offer_url,
              }))
            : [],
        },
        null,
        2,
      ),
    );
  }
};

run().catch((error) => {
  console.error(error?.message || error);
  process.exit(1);
});
