import { defineConfig } from "vitest/config";
export default defineConfig({test:{environment:"node",include:["tests/v3/**/*.test.ts","tests/conformance/v3-*.test.ts"],exclude:["tests/v3/docker/**"],setupFiles:["tests/v3/support/noExternal.setup.ts"],testTimeout:2000,hookTimeout:5000,maxWorkers:4}});
