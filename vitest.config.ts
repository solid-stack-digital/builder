import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    tsconfigPaths: true,
  },
  test: {
    environment: "node",
    globals: true,
    include: ["tests/v3/**/*.test.ts"],
    exclude: ["node_modules", "dist", "tests/v3/docker/**"],
    testTimeout: 2000,
    fileParallelism: true,
    maxWorkers: 4,
  },
});
