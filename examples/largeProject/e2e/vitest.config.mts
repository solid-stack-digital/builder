import { defineConfig } from "vitest/config";
import tsconfigPaths from "vite-tsconfig-paths";
import { createRequire } from "module";

const require = createRequire(import.meta.url);
const esbuild = require(
  require.resolve("esbuild", {
    paths: [process.cwd(), require.resolve("tsx")],
  }),
);

export default defineConfig({
  plugins: [
    tsconfigPaths(),
    {
      name: "transform-decorators",
      transform(code, id) {
        if (id.endsWith(".ts") && code.includes("@")) {
          const res = esbuild.transformSync(code, {
            loader: "ts",
            target: "node18",
            sourcefile: id,
            sourcemap: true,
          });
          const transformedCode = res.code.replace(
            /(_\w+ = class \{[\s\S]*?__decorateElement\(_\w+, 0, )"(\w+)"(, _\w+_decorators, _\w+\))/g,
            '$1""$3',
          );
          return {
            code: transformedCode,
            map: res.map,
          };
        }
      },
    },
  ],
  test: {
    environment: "node",
    globals: true,
    setupFiles: ["./vitest.setup.ts"],
    include: ["src/**/*.test.{ts,tsx}"],
    exclude: ["node_modules", "dist"],
    testTimeout: 35000,
    hookTimeout: 35000,
  },
});
