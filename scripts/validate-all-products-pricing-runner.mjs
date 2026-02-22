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
const outJsonPath = getArg("--out-json", ".tmp-all-products-pricing-check.json");

const readEnv = (filePath) => {
  const env = {};
  const text = fs.readFileSync(path.resolve(filePath), "utf8");
  for (const line of text.split(/\r?\n/)) {
    if (!line || line.trim().startsWith("#") || !line.includes("=")) continue;
    const idx = line.indexOf("=");
    env[line.slice(0, idx).trim()] = line.slice(idx + 1).trim();
  }
  return env;
};

const asNumber = (value) => (typeof value === "number" && Number.isFinite(value) ? value : null);

const main = async () => {
  const env = readEnv(envFile);
  const supabaseUrl = String(env.SUPABASE_URL ?? "").replace(/\/$/, "");
  const key = env.SERVICE_ROLE_KEY || env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !key) {
    throw new Error("SUPABASE_URL ou SERVICE_ROLE_KEY/SUPABASE_SERVICE_ROLE_KEY ausente");
  }

  const select = [
    "id",
    "name",
    "ml_item_id",
    "status",
    "is_active",
    "data_health_status",
    "price",
    "pix_price",
    "pix_price_source",
    "original_price",
    "previous_price",
    "previous_price_source",
    "previous_price_expires_at",
    "last_price_source",
    "last_price_verified_at",
    "updated_at",
    "discount_percentage",
    "is_on_sale",
  ].join(",");

  const url = `${supabaseUrl}/rest/v1/products?select=${encodeURIComponent(select)}&marketplace=eq.mercadolivre&removed_at=is.null&is_active=eq.true&status=eq.active&order=updated_at.desc&limit=1000`;
  const response = await fetch(url, {
    headers: { apikey: key, authorization: `Bearer ${key}` },
  });
  if (!response.ok) {
    throw new Error(`Falha no fetch: ${response.status} ${await response.text()}`);
  }

  const rows = await response.json();
  const anomalies = [];
  let promoDisplayed = 0;
  let promoHidden = 0;
  let unhealthy = 0;

  for (const row of rows) {
    const pricing = resolvePricePresentation(row);
    const primary = asNumber(pricing.displayPricePrimary);
    const strike = asNumber(pricing.displayStrikethrough);
    const discount = asNumber(pricing.discountPercent);
    const rawFlagPromo = Number(row.discount_percentage || 0) > 0 || Boolean(row.is_on_sale);

    if (String(row.data_health_status || "").toUpperCase() !== "HEALTHY") unhealthy += 1;

    if (strike !== null && primary !== null) {
      if (!(strike > primary)) {
        anomalies.push({
          id: row.id,
          name: row.name,
          issue: "invalid_strikethrough_not_greater_than_primary",
          primary,
          strike,
          discount,
          last_price_source: row.last_price_source,
          previous_price: row.previous_price,
        });
      } else {
        promoDisplayed += 1;
      }
    }

    if (rawFlagPromo && strike === null) {
      promoHidden += 1;
    }
  }

  const report = {
    generated_at: new Date().toISOString(),
    totals: {
      total_active: rows.length,
      unhealthy_total: unhealthy,
      promo_displayed_total: promoDisplayed,
      raw_flag_hidden_total: promoHidden,
      anomalies_total: anomalies.length,
    },
    anomalies: anomalies.slice(0, 100),
  };

  fs.writeFileSync(path.resolve(outJsonPath), JSON.stringify(report, null, 2), "utf8");
  console.log(JSON.stringify(report, null, 2));
  console.log(`\nJSON: ${path.resolve(outJsonPath)}`);
};

main().catch((error) => {
  console.error(error?.message || String(error));
  process.exit(1);
});
