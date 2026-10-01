import fs from "node:fs";
import path from "node:path";
import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/index.ts", "src/bin.ts"],
  format: ["esm", "cjs"],
  dts: false,
  clean: true,
  sourcemap: true,
  splitting: false,
  treeshake: true,
  target: "es2022",
  outDir: "dist",
  onSuccess: async () => {
    const srcTemplates = path.resolve("templates");
    const distTemplates = path.resolve("dist/templates");
    if (fs.existsSync(srcTemplates)) {
      fs.cpSync(srcTemplates, distTemplates, { recursive: true });
    }
    const binJs = path.resolve("dist/bin.js");
    if (fs.existsSync(binJs)) {
      fs.chmodSync(binJs, 0o755);
    }
    const binCjs = path.resolve("dist/bin.cjs");
    if (fs.existsSync(binCjs)) {
      fs.chmodSync(binCjs, 0o755);
    }
  },
});
