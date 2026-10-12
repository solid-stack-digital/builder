import { describe, expect, it } from "vitest";
import { resolveBuildStage } from "../../src/core/config/resolveBuildStage.js";
import { resolveMeshStage } from "../../src/core/config/resolveMeshStage.js";
import { ConfigError } from "../../src/errors/ConfigError.js";
describe("V2 stage resolution", () => {
 it("resolves build e2e as base -> prod -> e2e", () => {
  const result = resolveBuildStage({ app: { env: { BASE: "base", VALUE: "base" } }, prod: { app: { env: { PROD: "prod", VALUE: "prod" } } }, e2e: { app: { env: { E2E: "e2e", VALUE: "e2e" } } } }, "e2e", "build.json");
  expect(result.app.env).toMatchObject({ BASE: "base", PROD: "prod", E2E: "e2e", VALUE: "e2e" });
 });
 it("resolves mesh e2e as base -> prod -> e2e", () => {
  const result = resolveMeshStage({ services: { api: { path: "./api", env: { BASE: "base", VALUE: "base" } } }, prod: { services: { api: { env: { PROD: "prod", VALUE: "prod" } }, worker: { path: "./worker" } } }, e2e: { services: { api: { env: { E2E: "e2e", VALUE: "e2e" } } } } } as any, "e2e", "mesh.json");
  expect(result.services.api?.env).toMatchObject({ BASE: "base", PROD: "prod", E2E: "e2e", VALUE: "e2e" });
  expect(result.services).toHaveProperty("worker");
 });
 it("merges build endpoints/env and dependency lifecycle arrays", () => { const result = resolveBuildStage({ app: { env: { A: "1" }, endpoints: { http: { port: 3, primary: true } } }, dependencies: { redis: { compose: "r.yml", endpoints: { redis: { service: "redis", port: 6379, primary: true } } } }, dev: { app: { env: { B: "2" }, endpoints: { http: { scheme: "http" } } }, dependencies: { redis: { dependsOn: [] } } } }, "dev", "build.json"); expect(result.app.env).toEqual({ A: "1", B: "2" }); expect(result.app.endpoints.http).toMatchObject({ port: 3, scheme: "http" }); });
 it("enforces exactly one primary and detects dependency cycles", () => { expect(() => resolveBuildStage({ app: { endpoints: { a: { port: 1 } } } }, "dev", "build.json")).toThrow(ConfigError); const dep = (to: string) => ({ compose: "x", dependsOn: [`dependencies.${to}`], endpoints: { x: { service: "x", port: 1, primary: true } } }); expect(() => resolveBuildStage({ app: {}, dependencies: { a: dep("b"), b: dep("a") } }, "dev", "build.json")).toThrow(/a -> dependencies.b|cycle/i); });
 it("merges mesh overlays and catches cycles", () => { const mesh: any = { services: { api: { path: "api" }, db: { path: "db" } }, prod: { services: { api: { env: { X: "prod" } } } }, e2e: { services: { api: { dependsOn: ["db"] }, db: { dependsOn: ["api"] } } } }; expect(() => resolveMeshStage(mesh, "e2e", "mesh.json")).toThrow(ConfigError); const good = resolveMeshStage({ services: { api: { path: "api" } }, prod: { services: { api: { env: { X: "prod" } } } } }, "e2e", "mesh.json"); expect(good.services.api?.env).toEqual({ X: "prod" }); });
});
