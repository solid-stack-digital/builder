import fs from "node:fs";
import path from "node:path";

console.log("🔍 Running pre-publish validation checks...");

const distPath = path.resolve(process.cwd(), "dist");
const requiredFiles = [
  "index.js",
  "index.cjs",
  "index.d.ts",
  "bin.js",
];

if (!fs.existsSync(distPath)) {
  console.error("❌ 'dist' directory not found. Please run 'pnpm build' first.");
  process.exit(1);
}

for (const file of requiredFiles) {
  const filePath = path.join(distPath, file);
  if (!fs.existsSync(filePath)) {
    console.error(`❌ Required build file '${file}' is missing in dist.`);
    process.exit(1);
  }
}

console.log("✅ Pre-publish checks passed! Package is ready for publication.");
