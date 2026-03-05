import fs from "fs";
import path from "path";
import { pathToFileURL } from "url";
import {
  DEFAULT_ENV,
  getArg,
  parseEnvAndClient,
  writeJson,
} from "./_affiliate_catalog_common.js";

const envFile = getArg("--env", DEFAULT_ENV);
const outFile = getArg("--out-file", "reports/system-deployment-report.json");

const REQUIRED_TABLES = [
  "products",
  "product_catalog_data",
  "product_conversion_metrics",
  "trend_signals",
  "predicted_trends",
  "trend_discovered_products",
  "trend_near_matches",
  "seo_pages",
  "seo_page_products",
  "seo_page_metrics",
];

const REQUIRED_ADMIN_ROUTES = [
  "/admin/ai-system",
  "/admin/import-products",
  "/admin/products-queue",
  "/admin/trend-products",
];

const FUNCTION_FILES = [
  "netlify/functions/pipeline-status.js",
  "netlify/functions/admin-import-pipeline.js",
  "netlify/functions/deals.js",
  "netlify/functions/search.js",
];

const checkTable = async (url, key, table) => {
  try {
    const resp = await fetch(`${url}/rest/v1/${table}?select=id&limit=1`, {
      method: "GET",
      headers: {
        apikey: key,
        Authorization: `Bearer ${key}`,
      },
    });
    return resp.ok;
  } catch {
    return false;
  }
};

const checkAdminRoutes = () => {
  const appPath = path.resolve("src/app/App.tsx");
  if (!fs.existsSync(appPath)) {
    return {
      ok: false,
      missing: [...REQUIRED_ADMIN_ROUTES],
      detected: [],
    };
  }

  const content = String(fs.readFileSync(appPath, "utf8"));
  const detected = REQUIRED_ADMIN_ROUTES.filter((route) => content.includes(`path=\"${route}\"`));
  const missing = REQUIRED_ADMIN_ROUTES.filter((route) => !detected.includes(route));

  return {
    ok: missing.length === 0,
    missing,
    detected,
  };
};

const checkFunctions = async () => {
  const checks = [];

  for (const relPath of FUNCTION_FILES) {
    const absPath = path.resolve(relPath);
    if (!fs.existsSync(absPath)) {
      checks.push({ function: relPath, ok: false, reason: "file_missing" });
      continue;
    }

    try {
      const mod = await import(pathToFileURL(absPath).href);
      if (typeof mod?.handler !== "function") {
        checks.push({ function: relPath, ok: false, reason: "missing_handler" });
        continue;
      }

      if (relPath.includes("admin-import-pipeline")) {
        checks.push({ function: relPath, ok: true, mode: "export_check_only" });
        continue;
      }

      let invocationOk = true;
      try {
        const event = relPath.includes("admin-import-pipeline")
          ? { body: JSON.stringify({ productIds: [] }) }
          : { queryStringParameters: {} };
        const result = await mod.handler(event);
        invocationOk = result && typeof result.statusCode === "number";
      } catch {
        invocationOk = false;
      }

      checks.push({ function: relPath, ok: invocationOk });
    } catch (error) {
      checks.push({ function: relPath, ok: false, reason: String(error?.message || error) });
    }
  }

  return {
    ok: checks.every((item) => item.ok),
    checks,
  };
};

const main = async () => {
  let databaseConnected = false;
  let tableChecks = [];
  let databaseError = null;

  try {
    const { env } = parseEnvAndClient(envFile);
    const pingResp = await fetch(`${env.SUPABASE_URL}/rest/v1/products?select=id&limit=1`, {
      method: "GET",
      headers: {
        apikey: env.SERVICE_ROLE_KEY,
        Authorization: `Bearer ${env.SERVICE_ROLE_KEY}`,
      },
    });
    databaseConnected = pingResp.ok;

    tableChecks = await Promise.all(
      REQUIRED_TABLES.map(async (table) => ({
        table,
        ok: await checkTable(env.SUPABASE_URL, env.SERVICE_ROLE_KEY, table),
      })),
    );
  } catch (error) {
    databaseError = String(error?.message || error);
    databaseConnected = false;
    tableChecks = REQUIRED_TABLES.map((table) => ({ table, ok: false }));
  }

  const routes = checkAdminRoutes();
  const functions = await checkFunctions();

  const pipelineLogPath = path.resolve("logs/ml-30m-sync-cycle.log");
  const pipelineDetected = fs.existsSync(pipelineLogPath);

  const tablesOk = tableChecks.every((item) => item.ok);
  const overallOk = databaseConnected && tablesOk && pipelineDetected && routes.ok && functions.ok;

  const report = {
    generated_at: new Date().toISOString(),
    database_connected: databaseConnected,
    tables_ok: tablesOk,
    pipeline_detected: pipelineDetected,
    admin_routes_ok: routes.ok,
    functions_ok: functions.ok,
    overall_status: overallOk ? "READY" : "DEGRADED",
    details: {
      table_checks: tableChecks,
      admin_routes: routes,
      function_checks: functions.checks,
      pipeline_log_path: pipelineLogPath,
      database_error: databaseError,
    },
  };

  writeJson(outFile, report);
  console.log(JSON.stringify(report, null, 2));
};

main().catch((error) => {
  console.error(error?.message || error);
  process.exit(1);
});
