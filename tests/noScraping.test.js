import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const projectRoot = process.cwd();
const forbiddenDeps = ["cheerio", "jsdom"];

const readIfExists = (filePath) => {
  if (!fs.existsSync(filePath)) return "";
  return fs.readFileSync(filePath, "utf8");
};

const walk = (dir) => {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    if (entry.name === "node_modules" || entry.name === ".git" || entry.name === "dist") continue;
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...walk(fullPath));
    } else {
      files.push(fullPath);
    }
  }
  return files;
};

test("compliance: no cheerio/jsdom dependency or usage", () => {
  const packageJson = readIfExists(path.join(projectRoot, "package.json"));
  const packageLock = readIfExists(path.join(projectRoot, "package-lock.json"));

  for (const dep of forbiddenDeps) {
    assert.equal(
      packageJson.includes(`\"${dep}\"`) || packageLock.includes(`\"${dep}\"`),
      false,
      `Dependência proibida encontrada: ${dep}`
    );
  }

  const codeFiles = walk(projectRoot).filter((file) =>
    /\.(ts|tsx|js|jsx|mjs|cjs)$/.test(file)
  );

  for (const file of codeFiles) {
    if (file.endsWith(path.join("tests", "noScraping.test.js"))) continue;
    const content = readIfExists(file);
    for (const dep of forbiddenDeps) {
      if (content.includes(dep)) {
        assert.fail(`Uso proibido detectado em ${file}: ${dep}`);
      }
    }
  }
});
