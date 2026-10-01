import { defineConfig } from "vitest/config";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const esbuild = require(
  require.resolve("esbuild", {
    paths: [process.cwd(), require.resolve("tsx")],
  }),
);

export default defineConfig({
  resolve: {
    tsconfigPaths: true,
  },
  plugins: [
    {
      name: "transform-decorators",
      transform(code, id) {
        if ((id.endsWith(".ts") || id.endsWith(".tsx")) && code.includes("@")) {
          const res = esbuild.transformSync(code, {
            loader: id.endsWith(".tsx") ? "tsx" : "ts",
            target: "node18",
            sourcefile: id,
            sourcemap: true,
          });
          return {
            code: res.code,
            map: res.map,
          };
        }
      },
    },
  ],
  test: {
    environment: "node",
    globals: true,
    include: ["src/**/__tests__/**/*.test.{ts,tsx}", "tests/**/*.test.{ts,tsx}"],
    exclude: ["node_modules", "dist"],
    testTimeout: 60000,
  },
});
