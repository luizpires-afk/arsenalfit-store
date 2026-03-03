const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");

const args = process.argv.slice(2);

const getArg = (name, fallback = null) => {
  const idx = args.indexOf(name);
  if (idx >= 0 && idx + 1 < args.length) return args[idx + 1];
  return fallback;
};

const hasArg = (name) => args.includes(name);

const envFile = getArg("--env", "supabase/functions/.env.scheduler");
const linksFile = getArg("--links-file", "links-sec-fresh.txt");
const autoRepairLinksFile = getArg("--auto-repair-links-file", null);
const source = getArg("--source", "ops_affiliate_daily");
const category = getArg("--category", "suplementos");
const outDir = getArg("--out-dir", "logs");
const summaryPrefix = getArg("--summary-prefix", "logs/affiliate-fallback-daily-summary");
const runId = getArg("--run-id", new Date().toISOString().replace(/[:.]/g, "-"));

const pendingLimit = Math.max(1, Math.min(5000, Number(getArg("--pending-limit", "800")) || 800));
const limit = Math.max(1, Math.min(30, Number(getArg("--limit", "30")) || 30));
const maxItems = Math.max(1, Math.min(30, Number(getArg("--max-items", String(limit))) || limit));

const allowPartial = String(getArg("--allow-partial", "true")).toLowerCase() === "true";
const strictCount = String(getArg("--strict-count", "false")).toLowerCase() === "true";
const rotateLinks = String(getArg("--rotate-links", "true")).toLowerCase() === "true";
const autoRepairOnInvalid = String(getArg("--auto-repair-on-invalid", "true")).toLowerCase() === "true";
const forceCorrection = String(getArg("--force-correction", "false")).toLowerCase() === "true";
const requireCorrection = String(getArg("--require-correction", "false")).toLowerCase() === "true";
const asJson = hasArg("--json");

const exportPrefix = path.join(outDir, `affiliate-batch-export-fallback-${runId}`);
const applyPrefix = path.join(outDir, `affiliate-validation-apply-fallback-${runId}`);
const openPrefix = path.join(outDir, `affiliate-validation-open-fallback-${runId}`);

const ensureDir = (dir) => fs.mkdirSync(dir, { recursive: true });

const readJson = (filePath) => JSON.parse(String(fs.readFileSync(filePath, "utf8")));

const runNodeScript = (scriptPath, scriptArgs) => {
  const commandArgs = [scriptPath, ...scriptArgs];
  const result = spawnSync("node", commandArgs, {
    cwd: process.cwd(),
    env: process.env,
    encoding: "utf8",
  });

  const stdout = String(result.stdout || "").trim();
  const stderr = String(result.stderr || "").trim();

  if (result.status !== 0) {
    const errorText = [
      `command_failed: node ${commandArgs.join(" ")}`,
      stdout ? `stdout: ${stdout}` : "",
      stderr ? `stderr: ${stderr}` : "",
    ]
      .filter(Boolean)
      .join("\n");
    throw new Error(errorText);
  }

  return { stdout, stderr, status: result.status };
};

const rotateLinksFile = ({ filePath, consumedCount }) => {
  if (!consumedCount || consumedCount <= 0) return { rotated: false, consumed: 0, total_before: 0, total_after: 0 };
  if (!fs.existsSync(filePath)) return { rotated: false, consumed: 0, total_before: 0, total_after: 0, reason: "file_not_found" };

  const originalLines = String(fs.readFileSync(filePath, "utf8"))
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  if (!originalLines.length) {
    return { rotated: false, consumed: 0, total_before: 0, total_after: 0, reason: "empty_file" };
  }

  const take = Math.min(consumedCount, originalLines.length);
  if (take >= originalLines.length) {
    return {
      rotated: false,
      consumed: take,
      total_before: originalLines.length,
      total_after: originalLines.length,
      reason: "consumed_all_lines_noop",
    };
  }
  const rotatedLines = originalLines.slice(take).concat(originalLines.slice(0, take));
  fs.writeFileSync(filePath, `${rotatedLines.join("\n")}\n`, "utf8");

  return {
    rotated: true,
    consumed: take,
    total_before: originalLines.length,
    total_after: rotatedLines.length,
  };
};

const writeSummaryArtifacts = (payload) => {
  ensureDir(path.dirname(summaryPrefix));
  const stableJson = `${summaryPrefix}.json`;
  const stableTxt = `${summaryPrefix}.txt`;
  const stampedJson = `${summaryPrefix}-${runId}.json`;
  const stampedTxt = `${summaryPrefix}-${runId}.txt`;

  const txtLines = [
    `ok=${payload.ok}`,
    `run_id=${payload.run_id}`,
    `batch_id=${payload.batch_id || ""}`,
    `fallback_used=${payload.export?.fallback_used === true}`,
    `execution_mode=${payload.apply?.execution_mode || ""}`,
    `apply_applied=${payload.apply?.totals?.applied ?? ""}`,
    `apply_invalid=${payload.apply?.totals?.invalid ?? ""}`,
    `apply_skipped=${payload.apply?.totals?.skipped ?? ""}`,
    `open_status=${payload.open?.summary?.batch?.status || ""}`,
    `open_applied_items=${payload.open?.summary?.batch?.applied_items ?? ""}`,
    `open_invalid_items=${payload.open?.summary?.batch?.invalid_items ?? ""}`,
    `links_rotated=${payload.rotation?.rotated === true}`,
    `links_consumed=${payload.rotation?.consumed ?? 0}`,
    `rotation_reason=${payload.rotation?.reason || ""}`,
    `auto_repair_attempted=${payload.auto_repair?.attempted === true}`,
    `auto_repair_corrected=${payload.auto_repair?.corrected === true}`,
    `auto_repair_batch_id=${payload.auto_repair?.batch_id || ""}`,
    `auto_repair_applied=${payload.auto_repair?.apply?.totals?.applied ?? ""}`,
    `auto_repair_invalid=${payload.auto_repair?.apply?.totals?.invalid ?? ""}`,
  ];

  fs.writeFileSync(stableJson, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
  fs.writeFileSync(stableTxt, `${txtLines.join("\n")}\n`, "utf8");
  fs.writeFileSync(stampedJson, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
  fs.writeFileSync(stampedTxt, `${txtLines.join("\n")}\n`, "utf8");

  return {
    summary_json: stableJson,
    summary_txt: stableTxt,
    summary_json_timestamped: stampedJson,
    summary_txt_timestamped: stampedTxt,
  };
};

const main = async () => {
  ensureDir(outDir);

  if (!fs.existsSync(linksFile)) {
    throw new Error(`links_file_not_found: ${linksFile}`);
  }
  const linksLines = String(fs.readFileSync(linksFile, "utf8"))
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  if (!linksLines.length) {
    throw new Error(`links_file_empty: ${linksFile}`);
  }

  const startedAt = new Date().toISOString();
  const payload = {
    ok: false,
    run_id: runId,
    started_at: startedAt,
    config: {
      env_file: envFile,
      links_file: linksFile,
      auto_repair_links_file: autoRepairLinksFile || linksFile,
      source,
      category,
      out_dir: outDir,
      pending_limit: pendingLimit,
      limit,
      max_items: maxItems,
      allow_partial: allowPartial,
      strict_count: strictCount,
      rotate_links: rotateLinks,
      auto_repair_on_invalid: autoRepairOnInvalid,
      force_correction: forceCorrection,
      require_correction: requireCorrection,
    },
    steps: {
      pending: { ok: false, started_at: null, finished_at: null, duration_ms: 0 },
      export: { ok: false, started_at: null, finished_at: null, duration_ms: 0 },
      apply: { ok: false, started_at: null, finished_at: null, duration_ms: 0 },
      open: { ok: false, started_at: null, finished_at: null, duration_ms: 0 },
      rotate: { ok: false, started_at: null, finished_at: null, duration_ms: 0 },
      auto_repair: { ok: false, started_at: null, finished_at: null, duration_ms: 0 },
    },
  };

  try {
    let stepStarted = Date.now();
    payload.steps.pending.started_at = new Date().toISOString();
    runNodeScript("scripts/pending-affiliate-links-runner.cjs", [
      "--env",
      envFile,
      "--limit",
      String(pendingLimit),
      "--out-dir",
      outDir,
    ]);
    payload.pending = readJson(path.join(outDir, "pending-affiliate-links.json"));
    payload.steps.pending.ok = true;
    payload.steps.pending.finished_at = new Date().toISOString();
    payload.steps.pending.duration_ms = Date.now() - stepStarted;

    stepStarted = Date.now();
    payload.steps.export.started_at = new Date().toISOString();
    runNodeScript("scripts/export-standby-batch-runner.cjs", [
      "--env",
      envFile,
      "--limit",
      String(limit),
      "--source",
      source,
      "--fallback-from-pending",
      "true",
      "--category",
      category,
      "--max-items",
      String(maxItems),
      "--out-prefix",
      exportPrefix,
      "--json",
    ]);
    payload.export = readJson(`${exportPrefix}.json`);
    payload.batch_id = payload.export?.batch_id || null;
    payload.steps.export.ok = true;
    payload.steps.export.finished_at = new Date().toISOString();
    payload.steps.export.duration_ms = Date.now() - stepStarted;

    if (!payload.batch_id) {
      throw new Error("empty_batch_id_after_export");
    }

    const applyArgs = [
      "--env",
      envFile,
      "--batch-id",
      payload.batch_id,
      "--links-file",
      linksFile,
      "--out-prefix",
      applyPrefix,
      "--json",
    ];
    if (allowPartial) applyArgs.push("--allow-partial");
    if (!strictCount) applyArgs.push("--non-strict-count");

    stepStarted = Date.now();
    payload.steps.apply.started_at = new Date().toISOString();
    runNodeScript("scripts/apply-affiliate-batch-runner.cjs", applyArgs);
    payload.apply = readJson(`${applyPrefix}.json`);
    payload.steps.apply.ok = true;
    payload.steps.apply.finished_at = new Date().toISOString();
    payload.steps.apply.duration_ms = Date.now() - stepStarted;

    stepStarted = Date.now();
    payload.steps.open.started_at = new Date().toISOString();
    runNodeScript("scripts/open-affiliate-batch-runner.cjs", [
      "--env",
      envFile,
      "--batch-id",
      payload.batch_id,
      "--out-prefix",
      openPrefix,
    ]);
    payload.open = readJson(`${openPrefix}.json`);
    payload.steps.open.ok = true;
    payload.steps.open.finished_at = new Date().toISOString();
    payload.steps.open.duration_ms = Date.now() - stepStarted;

    stepStarted = Date.now();
    payload.steps.rotate.started_at = new Date().toISOString();
    const consumedCount = Number(payload.apply?.input?.normalized_links_count || payload.apply?.input?.received_links_count || 0);
    payload.rotation = rotateLinks ? rotateLinksFile({ filePath: linksFile, consumedCount }) : { rotated: false, consumed: 0, reason: "disabled" };
    payload.steps.rotate.ok = true;
    payload.steps.rotate.finished_at = new Date().toISOString();
    payload.steps.rotate.duration_ms = Date.now() - stepStarted;

    const invalidCount = Number(payload.apply?.totals?.invalid || 0);
    const duplicateUsedCount = Number(payload.apply?.error_summary?.affiliate_link_already_used || 0);
    const shouldAutoRepair = autoRepairOnInvalid && invalidCount > 0 && (duplicateUsedCount > 0 || forceCorrection);

    if (shouldAutoRepair) {
      stepStarted = Date.now();
      payload.steps.auto_repair.started_at = new Date().toISOString();

      const repairRunId = `${runId}-autorepair1`;
      const repairSource = `${source}__autorepair1`;
      const exportRepairPrefix = path.join(outDir, `affiliate-batch-export-fallback-${repairRunId}`);
      const applyRepairPrefix = path.join(outDir, `affiliate-validation-apply-fallback-${repairRunId}`);
      const openRepairPrefix = path.join(outDir, `affiliate-validation-open-fallback-${repairRunId}`);

      runNodeScript("scripts/export-standby-batch-runner.cjs", [
        "--env",
        envFile,
        "--limit",
        String(limit),
        "--source",
        repairSource,
        "--fallback-from-pending",
        "true",
        "--category",
        category,
        "--max-items",
        String(maxItems),
        "--out-prefix",
        exportRepairPrefix,
        "--json",
      ]);
      const exportRepair = readJson(`${exportRepairPrefix}.json`);
      const repairBatchId = exportRepair?.batch_id || null;
      if (!repairBatchId) {
        throw new Error("auto_repair_empty_batch_id_after_export");
      }

      const repairLinksFile = autoRepairLinksFile || linksFile;
      const applyRepairArgs = [
        "--env",
        envFile,
        "--batch-id",
        repairBatchId,
        "--links-file",
        repairLinksFile,
        "--out-prefix",
        applyRepairPrefix,
        "--json",
      ];
      if (allowPartial) applyRepairArgs.push("--allow-partial");
      if (!strictCount) applyRepairArgs.push("--non-strict-count");

      runNodeScript("scripts/apply-affiliate-batch-runner.cjs", applyRepairArgs);
      const applyRepair = readJson(`${applyRepairPrefix}.json`);

      runNodeScript("scripts/open-affiliate-batch-runner.cjs", [
        "--env",
        envFile,
        "--batch-id",
        repairBatchId,
        "--out-prefix",
        openRepairPrefix,
      ]);
      const openRepair = readJson(`${openRepairPrefix}.json`);

      const repairConsumed = Number(applyRepair?.input?.normalized_links_count || applyRepair?.input?.received_links_count || 0);
      const rotationRepair = rotateLinks
        ? rotateLinksFile({ filePath: repairLinksFile, consumedCount: repairConsumed })
        : { rotated: false, consumed: 0, reason: "disabled" };

      payload.auto_repair = {
        attempted: true,
        trigger: duplicateUsedCount > 0 ? "affiliate_link_already_used" : "force_correction",
        batch_id: repairBatchId,
        corrected: Number(applyRepair?.totals?.invalid || 0) === 0,
        links_file: repairLinksFile,
        export: exportRepair,
        apply: applyRepair,
        open: openRepair,
        rotation: rotationRepair,
        outputs: {
          export_prefix: exportRepairPrefix,
          apply_prefix: applyRepairPrefix,
          open_prefix: openRepairPrefix,
        },
      };

      payload.steps.auto_repair.ok = true;
      payload.steps.auto_repair.finished_at = new Date().toISOString();
      payload.steps.auto_repair.duration_ms = Date.now() - stepStarted;
    } else {
      payload.auto_repair = {
        attempted: false,
        reason: autoRepairOnInvalid ? "trigger_not_met" : "disabled",
      };
    }

    if (requireCorrection && invalidCount > 0) {
      if (!payload.auto_repair?.attempted) {
        throw new Error("correction_required_but_not_attempted");
      }
      if (!payload.auto_repair?.corrected) {
        throw new Error("correction_required_but_failed");
      }
    }

    payload.ok = true;
    payload.finished_at = new Date().toISOString();
    payload.outputs = {
      export_prefix: exportPrefix,
      apply_prefix: applyPrefix,
      open_prefix: openPrefix,
    };
  } catch (error) {
    payload.ok = false;
    payload.error = String(error?.message || error);
    payload.finished_at = new Date().toISOString();
  }

  const summaryFiles = writeSummaryArtifacts(payload);
  const out = {
    ok: payload.ok,
    run_id: payload.run_id,
    batch_id: payload.batch_id || null,
    export_fallback_used: payload.export?.fallback_used === true,
    execution_mode: payload.auto_repair?.corrected ? payload.auto_repair?.apply?.execution_mode || null : payload.apply?.execution_mode || null,
    applied: payload.auto_repair?.corrected ? payload.auto_repair?.apply?.totals?.applied ?? null : payload.apply?.totals?.applied ?? null,
    invalid: payload.auto_repair?.corrected ? payload.auto_repair?.apply?.totals?.invalid ?? null : payload.apply?.totals?.invalid ?? null,
    skipped: payload.auto_repair?.corrected ? payload.auto_repair?.apply?.totals?.skipped ?? null : payload.apply?.totals?.skipped ?? null,
    open_status: payload.auto_repair?.corrected ? payload.auto_repair?.open?.summary?.batch?.status || null : payload.open?.summary?.batch?.status || null,
    auto_repair_attempted: payload.auto_repair?.attempted === true,
    auto_repair_corrected: payload.auto_repair?.corrected === true,
    auto_repair_batch_id: payload.auto_repair?.batch_id || null,
    summary_files: summaryFiles,
    outputs: payload.outputs || null,
    error: payload.error || null,
  };

  if (asJson) {
    console.log(JSON.stringify(out, null, 2));
  } else {
    console.log(JSON.stringify(out, null, 2));
  }

  if (!payload.ok) {
    process.exit(1);
  }
};

main().catch((error) => {
  console.error(error?.stack || error?.message || error);
  process.exit(1);
});
