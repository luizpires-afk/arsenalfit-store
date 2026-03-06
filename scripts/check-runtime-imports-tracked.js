import fs from "fs";
import path from "path";
import { execSync } from "child_process";

const ROOT = process.cwd();
const SRC_DIR = path.join(ROOT, "src");
const EXTENSIONS = [".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs"];

const readAllFiles = (dir) => {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  const result = [];
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (["node_modules", "dist", "coverage"].includes(entry.name)) continue;
      result.push(...readAllFiles(full));
      continue;
    }
    if (EXTENSIONS.includes(path.extname(entry.name))) result.push(full);
  }
  return result;
};

const extractImportSpecifiers = (code) => {
  const specs = [];
  const regexes = [
    /import\s+(?:[^'";]+\s+from\s+)?["']([^"']+)["']/g,
    /export\s+[^'";]+\s+from\s+["']([^"']+)["']/g,
    /import\(\s*["']([^"']+)["']\s*\)/g,
  ];
  for (const re of regexes) {
    let m;
    while ((m = re.exec(code)) !== null) {
      specs.push(m[1]);
    }
  }
  return specs;
};

const resolveCandidatePaths = (importerFile, spec) => {
  if (!(spec.startsWith("@/") || spec.startsWith("./") || spec.startsWith("../"))) return [];

  const basePath = spec.startsWith("@/")
    ? path.join(SRC_DIR, spec.slice(2))
    : path.resolve(path.dirname(importerFile), spec);

  const candidates = [basePath, ...EXTENSIONS.map((ext) => `${basePath}${ext}`), ...EXTENSIONS.map((ext) => path.join(basePath, `index${ext}`))];

  return Array.from(new Set(candidates));
};

const fileExists = (filePath) => {
  try {
    return fs.existsSync(filePath) && fs.statSync(filePath).isFile();
  } catch {
    return false;
  }
};

const isTrackedByGit = (absolutePath) => {
  const rel = path.relative(ROOT, absolutePath).replace(/\\/g, "/");
  try {
    execSync(`git ls-files --error-unmatch ${JSON.stringify(rel)}`, {
      cwd: ROOT,
      stdio: "ignore",
      shell: true,
    });
    return true;
  } catch {
    return false;
  }
};

const main = () => {
  const files = readAllFiles(SRC_DIR);
  const missing = [];
  const untracked = [];

  for (const file of files) {
    const code = fs.readFileSync(file, "utf8");
    const specs = extractImportSpecifiers(code);

    for (const spec of specs) {
      const candidates = resolveCandidatePaths(file, spec);
      if (!candidates.length) continue;

      const resolved = candidates.find(fileExists);
      if (!resolved) {
        missing.push({ importer: path.relative(ROOT, file), spec });
        continue;
      }

      if (!isTrackedByGit(resolved)) {
        untracked.push({ importer: path.relative(ROOT, file), spec, resolved: path.relative(ROOT, resolved) });
      }
    }
  }

  const summary = {
    scanned_files: files.length,
    missing_import_targets: missing.length,
    untracked_import_targets: untracked.length,
  };

  console.log(JSON.stringify(summary, null, 2));

  if (missing.length) {
    console.error("\nMissing import targets:");
    for (const row of missing.slice(0, 100)) {
      console.error(`- ${row.importer} -> ${row.spec}`);
    }
  }

  if (untracked.length) {
    console.error("\nUntracked import targets:");
    for (const row of untracked.slice(0, 100)) {
      console.error(`- ${row.importer} -> ${row.spec} => ${row.resolved}`);
    }
  }

  if (missing.length || untracked.length) {
    process.exit(1);
  }
};

main();
