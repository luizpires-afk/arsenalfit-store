import fs from "fs";
import path from "path";
import { resolvePricePresentation } from "../src/lib/pricing.js";

const args = process.argv.slice(2);
const getArg = (name, fallback = null) => {
  const index = args.indexOf(name);
  if (index >= 0 && index + 1 < args.length) return args[index + 1];
  return fallback;
};

const envFile = getArg("--env", "supabase/functions/.env.scheduler");
const outJsonPath = getArg("--out-json", ".tmp-reference-pricing-check.json");

const readEnvFile = (filePath) => {
  const abs = path.resolve(filePath);
  const text = fs.readFileSync(abs, "utf8");
  const env = {};
  for (const line of text.split(/\r?\n/)) {
    if (!line || line.trim().startsWith("#") || !line.includes("=")) continue;
    const idx = line.indexOf("=");
    env[line.slice(0, idx).trim()] = line.slice(idx + 1).trim();
  }
  return env;
};

const normalizeText = (value) =>
  String(value ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim();

const references = [
  {
    label: "Adaptogen",
    matches: (name) => normalizeText(name).includes("adaptogen"),
  },
  {
    label: "Iso Blend",
    matches: (name) => {
      const n = normalizeText(name);
      return n.includes("iso") && n.includes("blend");
    },
  },
  {
    label: "Dux 300g",
    matches: (name) => {
      const n = normalizeText(name);
      return n.includes("dux") && n.includes("300g");
    },
  },
  {
    label: "+mu",
    matches: (name) => {
      const n = normalizeText(name);
      return /\+\s*mu\b/.test(n) || /\bmu\b/.test(n);
    },
  },
];

const main = async () => {
  const env = readEnvFile(envFile);
  const supabaseUrl = String(env.SUPABASE_URL ?? "").replace(/\/$/, "");
  const serviceKey = env.SERVICE_ROLE_KEY || env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceKey) {
    throw new Error("SUPABASE_URL ou SERVICE_ROLE_KEY/SUPABASE_SERVICE_ROLE_KEY ausente no env");
  }

  const select = [
    "id",
    "name",
    "ml_item_id",
    "price",
    "pix_price",
    "pix_price_source",
    "original_price",
    "previous_price",
    "previous_price_source",
    "previous_price_expires_at",
    "last_price_source",
    "status",
    "is_active",
    "data_health_status",
    "updated_at",
  ].join(",");

  const url = `${supabaseUrl}/rest/v1/products?select=${encodeURIComponent(select)}&marketplace=eq.mercadolivre&removed_at=is.null&is_active=eq.true&status=eq.active&order=updated_at.desc&limit=500`;

  const response = await fetch(url, {
    headers: {
      apikey: serviceKey,
      authorization: `Bearer ${serviceKey}`,
    },
  });

  if (!response.ok) {
    throw new Error(`Falha ao buscar produtos: ${response.status} ${await response.text()}`);
  }

  const rows = await response.json();
  const examples = [];

  for (const reference of references) {
    const matches = rows.filter((row) => reference.matches(row?.name));
    if (matches.length === 0) {
      examples.push({ reference: reference.label, found: false });
      continue;
    }

    for (const row of matches.slice(0, 3)) {
      const pricing = resolvePricePresentation(row);
      examples.push({
        reference: reference.label,
        found: true,
        id: row.id,
        name: row.name,
        ml_item_id: row.ml_item_id,
        status: row.status,
        is_active: row.is_active,
        data_health_status: row.data_health_status,
        last_price_source: row.last_price_source,
        price: row.price,
        previous_price: row.previous_price,
        previous_price_source: row.previous_price_source,
        display_primary: pricing.displayPricePrimary,
        display_secondary: pricing.displayPriceSecondary,
        display_strikethrough: pricing.displayStrikethrough,
        discount_percent: pricing.discountPercent,
        updated_at: row.updated_at,
      });
    }
  }

  const report = {
    generated_at: new Date().toISOString(),
    total_active: rows.length,
    references: examples,
  };

  fs.writeFileSync(path.resolve(outJsonPath), JSON.stringify(report, null, 2), "utf8");
  console.log(JSON.stringify(report, null, 2));
  console.log(`\nJSON: ${path.resolve(outJsonPath)}`);
};

main().catch((error) => {
  console.error(error?.message || String(error));
  process.exit(1);
});
