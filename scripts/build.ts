import { execSync } from "node:child_process";

console.log("🚀 Building package with tsup and tsc...");

// 1. Bundle JS with tsup
execSync("pnpm exec tsup", { stdio: "inherit" });

// 2. Generate TypeScript type declarations
execSync(
  "pnpm exec tsc --project tsconfig.build.json --emitDeclarationOnly --outDir dist",
  { stdio: "inherit" },
);

console.log("✅ Build completed successfully!");
