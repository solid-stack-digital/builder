import { defineConfig } from "vitest/config";
export default defineConfig({
 resolve: {tsconfigPaths:true},
 test: {environment:"node", globals:true, include:["tests/docker-acceptance/**/*.test.ts"], fileParallelism:false, testTimeout:90000, hookTimeout:360000},
});
