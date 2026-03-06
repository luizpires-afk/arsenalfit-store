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
  "/admin/ops",
  "/admin/discovery",
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
    if (resp.ok) return { ok: true, status: "ok" };

    const text = await resp.text().catch(() => "");
    const msg = String(text || "").toLowerCase();
    if (
      resp.status === 404 ||
      msg.includes("does not exist") ||
      msg.includes("could not find the table")
    ) {
      return { ok: false, status: "table_missing" };
    }
    if (resp.status === 401 || resp.status === 403 || msg.includes("permission")) {
      return { ok: false, status: "permission_error" };
    }
    return { ok: false, status: "connection_error" };
  } catch {
    return { ok: false, status: "connection_error" };
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
  const adminBlocks = [
    ...content.matchAll(/<Route\b[^>]*path\s*=\s*["']\/admin(?:\/\*)?["'][^>]*>([\s\S]*?)<\/Route>/g),
  ].map((match) => String(match[1] || ""));

  const hasLegacyRoute = (route) => {
    const escaped = route.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    return new RegExp(`path\\s*=\\s*["']${escaped}["']`).test(content);
  };

  const hasNestedChildRoute = (route) => {
    const childPath = route.replace(/^\/admin\//, "");
    if (!childPath || childPath === route) return false;
    const escaped = childPath.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const childRegex = new RegExp(`path\\s*=\\s*["']${escaped}["']`);
    return adminBlocks.some((block) => childRegex.test(block));
  };

  const detected = REQUIRED_ADMIN_ROUTES.filter(
    (route) => hasLegacyRoute(route) || hasNestedChildRoute(route),
  );
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

const checkDiscoveryPayloadContract = async () => {
  const contractsPath = path.resolve("shared/discoveryContracts.js");
  const runnerPath = path.resolve("scripts/discovery-intelligence-runner.js");

  if (!fs.existsSync(contractsPath)) {
    return {
      ok: false,
      status: "contracts_file_missing",
      version: null,
      details: { contracts_path: contractsPath, runner_path: runnerPath },
    };
  }
  if (!fs.existsSync(runnerPath)) {
    return {
      ok: false,
      status: "runner_file_missing",
      version: null,
      details: { contracts_path: contractsPath, runner_path: runnerPath },
    };
  }

  try {
    const contractMod = await import(pathToFileURL(contractsPath).href);
    const payloadVersion = String(contractMod?.DISCOVERY_SCORE_PAYLOAD_VERSION || "").trim();
    const runnerContent = String(fs.readFileSync(runnerPath, "utf8"));

    const hasVersionConstImport = /DISCOVERY_SCORE_PAYLOAD_VERSION/.test(runnerContent);
    const hasPayloadVersionUsage = /payload_version\s*:\s*DISCOVERY_SCORE_PAYLOAD_VERSION/.test(runnerContent);
    const hasPayloadBuilder = /buildScorePayload\s*\(/.test(runnerContent);

    const ok =
      /^v\d+$/i.test(payloadVersion) &&
      hasVersionConstImport &&
      hasPayloadVersionUsage &&
      hasPayloadBuilder;

    return {
      ok,
      status: ok ? "ok" : "contract_mismatch",
      version: payloadVersion || null,
      details: {
        contracts_path: contractsPath,
        runner_path: runnerPath,
        has_version_const_import: hasVersionConstImport,
        has_payload_version_usage: hasPayloadVersionUsage,
        has_payload_builder: hasPayloadBuilder,
      },
    };
  } catch (error) {
    return {
      ok: false,
      status: "contract_check_error",
      version: null,
      details: {
        contracts_path: contractsPath,
        runner_path: runnerPath,
        error: String(error?.message || error),
      },
    };
  }
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
    if (!pingResp.ok) {
      databaseError = `connection_error_http_${pingResp.status}`;
    }

    tableChecks = await Promise.all(
      REQUIRED_TABLES.map(async (table) => {
        const result = await checkTable(env.SUPABASE_URL, env.SERVICE_ROLE_KEY, table);
        return {
          table,
          ok: result.ok,
          status: result.status,
        };
      }),
    );
  } catch (error) {
    databaseError = String(error?.message || error);
    databaseConnected = false;
    tableChecks = REQUIRED_TABLES.map((table) => ({ table, ok: false, status: "connection_error" }));
  }

  const routes = checkAdminRoutes();
  const functions = await checkFunctions();
  const payloadContract = await checkDiscoveryPayloadContract();

  const pipelineLogPath = path.resolve("logs/ml-30m-sync-cycle.log");
  const pipelineDetected = fs.existsSync(pipelineLogPath);

  const tablesOk = tableChecks.every((item) => item.ok);
  const overallOk = databaseConnected && tablesOk && pipelineDetected && routes.ok && functions.ok && payloadContract.ok;

  const report = {
    generated_at: new Date().toISOString(),
    database_connected: databaseConnected,
    tables_ok: tablesOk,
    pipeline_detected: pipelineDetected,
    admin_routes_ok: routes.ok,
    functions_ok: functions.ok,
    payload_contract_ok: payloadContract.ok,
    overall_status: overallOk ? "READY" : "DEGRADED",
    details: {
      table_checks: tableChecks,
      admin_routes: routes,
      function_checks: functions.checks,
      payload_contract: payloadContract,
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
