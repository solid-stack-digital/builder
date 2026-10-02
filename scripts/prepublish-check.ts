import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

console.log("🔍 Running pre-publish validation checks...");

const rootDir = process.cwd();
const distPath = path.resolve(rootDir, "dist");
const binPath = path.join(distPath, "bin.js");

// 1. Verify dist and bin.js exist
if (!fs.existsSync(distPath)) {
  console.error("❌ 'dist' directory not found. Please run 'pnpm build' first.");
  process.exit(1);
}

if (!fs.existsSync(binPath)) {
  console.error("❌ 'dist/bin.js' is missing.");
  process.exit(1);
}

// 2. Verify shebang in bin.js
const binContent = fs.readFileSync(binPath, "utf-8");
if (!binContent.startsWith("#!/usr/bin/env node")) {
  console.error("❌ 'dist/bin.js' is missing shebang '#!/usr/bin/env node'.");
  process.exit(1);
}

// 3. Verify executable permission on bin.js
const stat = fs.statSync(binPath);
const isExecutable = (stat.mode & 0o111) !== 0;
if (!isExecutable) {
  console.error("❌ 'dist/bin.js' is not marked as executable.");
  process.exit(1);
}

// 4. Verify templates in templates/docker
const requiredTemplates = [
  "docker-compose.base.yml",
  "docker-compose.dev.yml",
  "docker-compose.prod.yml",
  "docker-compose.test.yml",
  "docker-compose.e2e.yml",
  "docker-compose.standalone.yml",
];

const templatesDockerDir = path.resolve(rootDir, "templates", "docker");
for (const tmpl of requiredTemplates) {
  const tmplPath = path.join(templatesDockerDir, tmpl);
  if (!fs.existsSync(tmplPath)) {
    console.error(`❌ Required template '${tmpl}' is missing in templates/docker.`);
    process.exit(1);
  }
}

// 5. Inspect npm pack --dry-run
try {
  console.log("📦 Checking npm pack --dry-run...");
  execSync("pnpm pack --dry-run", { stdio: "inherit" });
} catch (err: unknown) {
  console.error("❌ 'pnpm pack --dry-run' failed:", err);
  process.exit(1);
}

console.log("✅ Pre-publish checks passed! Package is ready for publication.");
