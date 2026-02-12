import fs from "node:fs/promises";
import path from "node:path";

const ROOT = process.cwd();

const SCAN_DIRS = [
  "src",
  path.join("netlify", "functions"),
  path.join("supabase", "functions"),
];

const EXTENSIONS = new Set([
  ".ts",
  ".tsx",
  ".js",
  ".jsx",
  ".css",
  ".md",
  ".sql",
]);

const IGNORE_DIRS = new Set([
  "node_modules",
  "dist",
  ".git",
  path.join("supabase", ".temp"),
]);

// Detects common lossy substitutions (accented chars replaced by '?') and other bad artifacts.
const BAD_PATTERNS = [
  { name: "replacement_char", re: /\uFFFD/g },
  { name: "preco", re: /pre\?os?|melhor pre\?o/gi },
  { name: "atualizacao", re: /atualiza\?\?o|atualiza\?\?es/gi },
  { name: "automatica", re: /autom\?tic/gi },
  { name: "confianca", re: /confian\?a/gi },
  { name: "beneficio", re: /benef\?c/gi },
  { name: "seguranca", re: /seguran\?a/gi },
  { name: "endereco", re: /endere\?o/gi },
  { name: "voce", re: /voc\?(?=\W)/gi },
  { name: "nao", re: /n\?o/gi },
  { name: "robo", re: /rob\?(?=\W)/gi },
  { name: "missao", re: /miss\?o/gi },
  { name: "logistica", re: /log\?stica/gi },
  { name: "gratis", re: /gr\?tis/gi },
  { name: "genero", re: /g\?nero/gi },
  { name: "obrigatorio", re: /obrigat\?rio/gi },
  { name: "avaliacao", re: /avalia\?\?o/gi },
  { name: "indicacao", re: /indica\?\?o/gi },
  { name: "analise", re: /an\?lise/gi },
  { name: "ultimas", re: /\?ltim/gi },
];

const isIgnoredDir = (relPath) => {
  const parts = relPath.split(path.sep).filter(Boolean);
  return parts.some((part, index) => {
    if (IGNORE_DIRS.has(part)) return true;
    // Handle nested ignore like "supabase/.temp"
    if (index > 0) {
      const joined = path.join(...parts.slice(0, index + 1));
      return IGNORE_DIRS.has(joined);
    }
    return false;
  });
};

const walk = async (relDir) => {
  const absDir = path.join(ROOT, relDir);
  let entries;
  try {
    entries = await fs.readdir(absDir, { withFileTypes: true });
  } catch {
    return [];
  }

  const results = [];
  for (const entry of entries) {
    const rel = path.join(relDir, entry.name);
    if (isIgnoredDir(rel)) continue;

    if (entry.isDirectory()) {
      results.push(...(await walk(rel)));
      continue;
    }

    if (!entry.isFile()) continue;

    const ext = path.extname(entry.name).toLowerCase();
    if (!EXTENSIONS.has(ext)) continue;
    results.push(rel);
  }
  return results;
};

const findLineCol = (text, index) => {
  const until = text.slice(0, index);
  const lines = until.split(/\r?\n/);
  const line = lines.length;
  const col = lines[lines.length - 1].length + 1;
  return { line, col };
};

const main = async () => {
  const files = [];
  for (const dir of SCAN_DIRS) {
    files.push(...(await walk(dir)));
  }

  const findings = [];

  for (const rel of files) {
    const abs = path.join(ROOT, rel);
    let text;
    try {
      text = await fs.readFile(abs, "utf8");
    } catch {
      continue;
    }

    for (const { name, re } of BAD_PATTERNS) {
      re.lastIndex = 0;
      const match = re.exec(text);
      if (!match) continue;

      const { line, col } = findLineCol(text, match.index);
      const lineText = text.split(/\r?\n/)[line - 1] ?? "";
      findings.push({
        file: rel,
        line,
        col,
        name,
        snippet: lineText.trim().slice(0, 220),
      });
    }
  }

  if (findings.length === 0) {
    console.log("check-mojibake: ok");
    return;
  }

  console.error("check-mojibake: found suspicious text artifacts:");
  for (const finding of findings.slice(0, 80)) {
    console.error(
      `- ${finding.file}:${finding.line}:${finding.col} [${finding.name}] ${finding.snippet}`,
    );
  }

  if (findings.length > 80) {
    console.error(`... and ${findings.length - 80} more`);
  }

  process.exit(1);
};

main().catch((error) => {
  console.error("check-mojibake: failed:", error);
  process.exit(1);
});

