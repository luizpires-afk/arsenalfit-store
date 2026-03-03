const {
  readRunnerEnv,
  createSupabaseRestClient,
  resolveSiteFinalPrice,
} = require("./_supabase_runner_utils.cjs");

const args = process.argv.slice(2);
const hasArg = (name) => args.includes(name);
const getArg = (name, fallback = null) => {
  const index = args.indexOf(name);
  if (index >= 0 && index + 1 < args.length) return args[index + 1];
  return fallback;
};

const envPath = getArg("--env", "supabase/functions/.env.scheduler");
const limit = Math.max(1, Math.min(5000, Number(getArg("--limit", "1500")) || 1500));
const apply = hasArg("--apply");

const parseNumber = (value) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

const computePromo = (row) => {
  const finalPrice = resolveSiteFinalPrice(row);
  const original = parseNumber(row.original_price);
  if (!(finalPrice && finalPrice > 0) || !(original && original > finalPrice)) {
    return {
      discount_percentage: 0,
      is_on_sale: false,
      changed:
        Number(row.discount_percentage || 0) !== 0 ||
        row.is_on_sale === true,
    };
  }

  const discount = Math.round(((original - finalPrice) / original) * 100);
  return {
    discount_percentage: Math.max(0, discount),
    is_on_sale: discount > 0,
    changed:
      Number(row.discount_percentage || 0) !== Math.max(0, discount) ||
      row.is_on_sale !== (discount > 0),
  };
};

const main = async () => {
  const env = readRunnerEnv(envPath);
  if (!env.SUPABASE_URL || !env.SERVICE_ROLE_KEY) {
    throw new Error("SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY ausentes no ambiente.");
  }

  const client = createSupabaseRestClient({
    supabaseUrl: env.SUPABASE_URL,
    serviceRoleKey: env.SERVICE_ROLE_KEY,
  });

  const rows = await client.request(
    `/products?select=id,name,marketplace,price,pix_price,original_price,discount_percentage,is_on_sale,updated_at&marketplace=ilike.mercado*&removed_at=is.null&order=updated_at.desc&limit=${limit}`,
    { method: "GET" },
  );

  const candidates = (Array.isArray(rows) ? rows : [])
    .map((row) => ({ row, next: computePromo(row) }))
    .filter((item) => item.next.changed);

  const sample = [];
  let updated = 0;

  for (const item of candidates) {
    const payload = {
      discount_percentage: item.next.discount_percentage,
      is_on_sale: item.next.is_on_sale,
      updated_at: new Date().toISOString(),
    };

    if (apply) {
      await client.patch(`/products?id=eq.${encodeURIComponent(item.row.id)}`, payload);
      updated += 1;
    }

    if (sample.length < 50) {
      sample.push({
        id: item.row.id,
        name: item.row.name,
        before: {
          discount_percentage: item.row.discount_percentage,
          is_on_sale: item.row.is_on_sale,
        },
        after: {
          discount_percentage: item.next.discount_percentage,
          is_on_sale: item.next.is_on_sale,
        },
      });
    }
  }

  console.log(
    JSON.stringify(
      {
        ok: true,
        mode: apply ? "apply" : "dry_run",
        scanned: rows.length,
        affected: candidates.length,
        updated,
        sample,
      },
      null,
      2,
    ),
  );
};

main().catch((error) => {
  console.error(error?.message || error);
  process.exit(1);
});
