const fs = require("fs");
const path = require("path");
const {
  readRunnerEnv,
  createSupabaseRestClient,
  toCsv,
  resolveCanonicalMlItemId,
} = require("./_supabase_runner_utils.cjs");

const args = process.argv.slice(2);
const getArg = (name, fallback = null) => {
  const idx = args.indexOf(name);
  if (idx >= 0 && idx + 1 < args.length) return args[idx + 1];
  return fallback;
};

const envFile = getArg("--env", "supabase/functions/.env.scheduler");
const outDir = getArg("--out-dir", "logs");
const ts = new Date().toISOString().replace(/[:.]/g, "-");

const hostOf = (value) => {
  try {
    return new URL(String(value || "")).host.toLowerCase();
  } catch {
    return "";
  }
};

const writeArtifacts = ({ payload, rows, outDirPath }) => {
  const base = path.join(outDirPath, "robot-dedup-audit");
  const stamped = `${base}-${ts}`;
  const json = `${base}.json`;
  const csv = `${base}.csv`;
  const jsonTs = `${stamped}.json`;
  const csvTs = `${stamped}.csv`;
  fs.writeFileSync(json, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
  fs.writeFileSync(csv, `${toCsv(rows)}\n`, "utf8");
  fs.writeFileSync(jsonTs, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
  fs.writeFileSync(csvTs, `${toCsv(rows)}\n`, "utf8");
  return { json, csv, timestamped: { json: jsonTs, csv: csvTs } };
};

const main = async () => {
  const env = readRunnerEnv(envFile);
  if (!env.SUPABASE_URL || !env.SERVICE_ROLE_KEY) {
    throw new Error("SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY ausentes no ambiente.");
  }
  fs.mkdirSync(outDir, { recursive: true });

  const client = createSupabaseRestClient({
    supabaseUrl: env.SUPABASE_URL,
    serviceRoleKey: env.SERVICE_ROLE_KEY,
  });

  const fields = [
    "id",
    "name",
    "status",
    "is_active",
    "category_id",
    "source_url",
    "affiliate_link",
    "canonical_offer_url",
    "ml_item_id",
    "external_id",
    "updated_at",
  ].join(",");

  const products = await client.fetchPagedRows(
    `/products?select=${encodeURIComponent(fields)}&marketplace=eq.mercadolivre&removed_at=is.null&order=updated_at.desc`,
  );

  const categories = await client.request(`/categories?select=id,name,slug`, { method: "GET" });
  const categoryById = new Map((Array.isArray(categories) ? categories : []).map((row) => [row.id, row.name || row.slug || "sem_categoria"]));

  const keyed = products.map((product) => {
    const canonical = resolveCanonicalMlItemId(product) || hostOf(product.canonical_offer_url || product.source_url || product.affiliate_link) || product.id;
    return {
      ...product,
      canonical_key: canonical,
      source_host: hostOf(product.source_url),
      category_name: categoryById.get(product.category_id) || "sem_categoria",
    };
  });

  const byKey = new Map();
  for (const row of keyed) {
    if (!byKey.has(row.canonical_key)) byKey.set(row.canonical_key, []);
    byKey.get(row.canonical_key).push(row);
  }

  const duplicateGroups = [...byKey.entries()].filter(([, rows]) => rows.length > 1);
  const duplicateRows = [];
  for (const [canonicalKey, rows] of duplicateGroups) {
    const activeCount = rows.filter((item) => String(item.status || "").toLowerCase() === "active" && item.is_active === true).length;
    const hosts = [...new Set(rows.map((item) => item.source_host).filter(Boolean))];
    const categoriesSet = [...new Set(rows.map((item) => item.category_name))];
    for (const item of rows) {
      duplicateRows.push({
        canonical_key: canonicalKey,
        duplicate_group_size: rows.length,
        duplicate_group_active: activeCount,
        host_count: hosts.length,
        category_count: categoriesSet.length,
        id: item.id,
        name: item.name,
        status: item.status,
        is_active: item.is_active,
        category: item.category_name,
        source_host: item.source_host || null,
        updated_at: item.updated_at || null,
      });
    }
  }

  const uniqueKeys = byKey.size;
  const totalProducts = keyed.length;
  const duplicateProducts = duplicateRows.length;

  const categoryVariety = {};
  for (const row of keyed) {
    categoryVariety[row.category_name] = (categoryVariety[row.category_name] || 0) + 1;
  }

  const sourceVariety = {};
  for (const row of keyed) {
    const host = row.source_host || "sem_host";
    sourceVariety[host] = (sourceVariety[host] || 0) + 1;
  }

  const payload = {
    ok: true,
    generated_at: new Date().toISOString(),
    totals: {
      products_scanned: totalProducts,
      canonical_unique_keys: uniqueKeys,
      duplicate_groups: duplicateGroups.length,
      duplicate_products: duplicateProducts,
      duplicate_rate_pct: totalProducts > 0 ? Number(((duplicateProducts / totalProducts) * 100).toFixed(2)) : 0,
    },
    diversity: {
      categories: Object.fromEntries(Object.entries(categoryVariety).sort((a, b) => b[1] - a[1]).slice(0, 20)),
      source_hosts: Object.fromEntries(Object.entries(sourceVariety).sort((a, b) => b[1] - a[1]).slice(0, 20)),
    },
    recommendations: {
      dedup_canonical_key: "Preferir ml_item_id/canonical permalink normalizado e bloquear inserção quando chave já ativa.",
      equivalent_item_block: "Ao detectar canonical_key já ativo, atualizar metadados/preço no item existente em vez de inserir novo produto.",
      diversity_priority: "Aplicar cota por categoria + host por rodada de ingestão para ampliar variedade.",
      retry_backoff: "Usar retry exponencial com jitter (429/5xx) e circuit breaker para origem instável.",
      pagination_limits: "Subir paginação em lotes menores com checkpoint por cursor para evitar burst e duplicidade por corrida.",
    },
    duplicate_rows: duplicateRows,
  };

  const outputs = writeArtifacts({ payload, rows: duplicateRows, outDirPath: outDir });
  console.log(JSON.stringify({ ok: true, totals: payload.totals, outputs }, null, 2));
};

main().catch((error) => {
  console.error(error?.stack || error?.message || error);
  process.exit(1);
});
