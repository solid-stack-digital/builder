import { afterEach, describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { meshSchema } from "../../src/core/mesh/meshSchema.js";
import { cleanupFixtures, compileMesh, env, http, meshFixture, write } from "./fixture.js";

afterEach(cleanupFixtures);
const app = (publicPort: number | "AUTO" | undefined = "AUTO", scheme: string | undefined = "http") => ({ app: { endpoints: { http: { port: 3000, primary: true, ...(publicPort === undefined ? {} : { publicPort }), ...(scheme === undefined ? {} : { scheme }) } } } });
const runner = { services: { runner: { image: "alpine", command: ["sh", "-c", "exit 0"] }, helper: { image: "alpine" } } };
const t = (env: Record<string, unknown> = {}) => ({ compose: "t.yml", service: "runner", env });
function mesh(tester: Record<string, unknown> | undefined = t(), publish = ["app.endpoints.http"], appBuild: Record<string, unknown> = app(), testerCompose: object | string = runner) {
  return meshFixture({ services: { gateway: { path: "gateway", publish } }, ...(tester ? { tester } : {}) }, { gateway: appBuild }, { "t.yml": testerCompose });
}
const compiled = (root: string) => compileMesh("e2e", root);
const testerService = (root: string) => { const result = compiled(root); return result.compose.services[result.testerServiceName!]; };

describe("catalog 10: global mesh E2E tester", () => {
  it("TST-001 selects finite runner from tester Compose", () => {
    const result = compiled(mesh());
    expect(result.testerServiceName).toBeDefined();
    expect(result.compose.services[result.testerServiceName!]?.command).toEqual(["sh", "-c", "exit 0"]);
  });
  it("TST-002 requires tester.compose", () => expect(meshSchema.safeParse({ services: { gateway: { path: "gateway" } }, tester: { service: "runner" } }).success).toBe(false));
  it("TST-003 requires tester.service", () => expect(meshSchema.safeParse({ services: { gateway: { path: "gateway" } }, tester: { compose: "t.yml" } }).success).toBe(false));
  it("TST-004 refuses missing selected service", () => expect(() => compiled(mesh({ compose: "t.yml", service: "missing" }))).toThrow(/missing|Selected tester/));
  it("TST-005 reports malformed tester YAML before runtime", () => expect(() => compiled(mesh(t(), ["app.endpoints.http"], app(), "services:\n  runner: [bad\n"))).toThrow(/t.yml|yaml/i));
  it("TST-006 injects tester.env only into selected runner", () => {
    const result = compiled(mesh(t({ SYSTEM_URL: "http://example", TOKEN: "secret" })));
    expect(env(result.compose.services[result.testerServiceName!])).toMatchObject({ SYSTEM_URL: "http://example", TOKEN: "secret" });
    expect(Object.values(result.compose.services).filter(x => x !== result.compose.services[result.testerServiceName!]).every(x => env(x).TOKEN === undefined)).toBe(true);
  });
  it("TST-007 forces selected runner onto host networking", () => expect(testerService(mesh())?.network_mode).toBe("host"));
  it("TST-008 rejects tester network_host reference", () => expect(() => compiled(mesh(t({ URL: "${gateway.app.endpoints.http.network_host}" })))).toThrow(/public endpoint|network_host/i));
  it("TST-009 rejects tester network_port reference", () => expect(() => compiled(mesh(t({ URL: "${gateway.app.endpoints.http.network_port}" })))).toThrow(/public endpoint|network_port/i));
  it("TST-010 rejects tester network_address reference", () => expect(() => compiled(mesh(t({ URL: "${gateway.app.endpoints.http.network_address}" })))).toThrow(/public endpoint|network_address/i));
  it("TST-011 rejects tester network_url reference", () => expect(() => compiled(mesh(t({ URL: "${gateway.app.endpoints.http.network_url}" })))).toThrow(/public endpoint|network_url/i));
  it("TST-012 resolves published app public_url for host runner", () => {
    const root = mesh(t({ SYSTEM_URL: "${gateway.app.endpoints.http.public_url}" })), result = compiled(root);
    expect(env(result.compose.services[result.testerServiceName!]).SYSTEM_URL).toBe(`http://127.0.0.1:${result.endpoints.app.gateway?.http?.publicPort}`);
  });
  it("TST-013 refuses unpublished public property", () => expect(() => compiled(mesh(t({ URL: "${gateway.app.endpoints.http.public_port}" }), []))).toThrow(/publication/i));
  it("TST-014 requires scheme for public_url but not public_address", () => {
    const noScheme = { app: { endpoints: { http: { port: 3000, primary: true, publicPort: "AUTO" } } } };
    expect(() => compiled(mesh(t({ URL: "${gateway.app.endpoints.http.public_url}" }), ["app.endpoints.http"], noScheme))).toThrow(/scheme/i);
    expect(env(testerService(mesh(t({ URL: "${gateway.app.endpoints.http.public_address}" }), ["app.endpoints.http"], noScheme))).URL).toMatch(/^127\.0\.0\.1:\d+$/);
  });
  it("TST-015 injects numeric AUTO allocation before tester env", () => {
    const value = env(testerService(mesh(t({ URL: "${gateway.app.endpoints.http.public_url}" })))).URL;
    expect(value).toMatch(/^http:\/\/127\.0\.0\.1:\d+$/); expect(value).not.toContain("AUTO");
  });
  it("TST-016 rejects stage-specific tester overlay", () => {
    for (const stage of ["dev", "prod", "test", "e2e"]) expect(meshSchema.safeParse({ services: { gateway: { path: "gateway" } }, [stage]: { tester: t() } }).success).toBe(false);
  });
  it("TST-017 rejects legacy tester.path", () => expect(meshSchema.safeParse({ services: { gateway: { path: "gateway" } }, tester: { ...t(), path: "old" } }).success).toBe(false));
  it("TST-018 rejects legacy tester.dockerfile", () => expect(meshSchema.safeParse({ services: { gateway: { path: "gateway" } }, tester: { ...t(), dockerfile: "Dockerfile" } }).success).toBe(false));
  it("TST-019 rejects legacy tester policy and envOverrides", () => {
    for (const key of ["policy", "envOverrides"]) expect(meshSchema.safeParse({ services: { gateway: { path: "gateway" } }, tester: { ...t(), [key]: {} } }).success).toBe(false);
  });
  it("TST-020 excludes tester in dev and prod composition", () => {
    const root = mesh();
    for (const stage of ["dev", "prod"] as const) expect(Object.keys(compileMesh(stage, root).compose.services)).toEqual(["gateway"]);
  });
  it("TST-021 gates tester on all effective base apps", () => {
    const root = meshFixture({ services: { a: { path: "a" }, b: { path: "b" }, c: { path: "c" } }, tester: t() }, { a: { app: {} }, b: { app: {} }, c: { app: {} } }, { "t.yml": runner });
    const result = compiled(root), edges = result.compose.services[result.testerServiceName!]?.depends_on as any;
    expect(Object.keys(edges).sort()).toEqual(["a", "b", "c"]);
    expect(Object.values(edges).every((x: any) => x.condition === "service_healthy")).toBe(true);
  });
  it("TST-022 includes stage-added app in tester readiness set", () => {
    const root = meshFixture({ services: { a: { path: "a" } }, e2e: { services: { fake: { path: "fake" } } }, tester: t() }, { a: { app: {} }, fake: { app: {} } }, { "t.yml": runner });
    const result = compiled(root);
    expect(result.compose.services[result.testerServiceName!]?.depends_on).toHaveProperty("fake");
  });
  it("TST-023 uses selected runner's finite exit command", () => {
    const result = compiled(mesh(t(), ["app.endpoints.http"], app(), { services: { runner: { image: "alpine", command: ["sh", "-c", "exit 23"] } } }));
    expect(result.compose.services[result.testerServiceName!]?.command).toEqual(["sh", "-c", "exit 23"]);
  });
  it("TST-024 does not select an unreferenced helper as runner", () => {
    const result = compiled(mesh());
    expect(result.testerServiceName).toContain("runner");
    expect(Object.keys(result.compose.services).some(x => x.includes("helper"))).toBe(false);
  });
  it("TST-025 resolves two published service URLs independently", () => {
    const root = meshFixture({ services: { gateway: { path: "gateway", publish: ["app.endpoints.http"] }, metrics: { path: "metrics", publish: ["app.endpoints.http"] } }, tester: t({ SYSTEM_URL: "${gateway.app.endpoints.http.public_url}", METRICS_URL: "${metrics.app.endpoints.http.public_url}" }) }, { gateway: app(), metrics: app() }, { "t.yml": runner });
    const result = compiled(root), values = env(result.compose.services[result.testerServiceName!]);
    expect(values.SYSTEM_URL).toContain("127.0.0.1"); expect(values.METRICS_URL).toContain("127.0.0.1"); expect(values.SYSTEM_URL).not.toBe(values.METRICS_URL);
  });
  it("TST-026 rejects private dependency network endpoint", () => {
    const root = meshFixture({ services: { gateway: { path: "gateway" } }, tester: t({ URL: "${gateway.dependencies.db.endpoints.api.network_address}" }) }, { gateway: { app: {}, dependencies: { db: { compose: "d.yml", endpoints: { api: { service: "owner", port: 1, primary: true } } } } } }, { "gateway/d.yml": { services: { owner: { image: "alpine", healthcheck: { test: ["CMD", "true"] } } } }, "t.yml": runner });
    expect(() => compiled(root)).toThrow(/public endpoint|network_address/i);
  });
  it("TST-027 preserves tester Compose build implementation", () => {
    const root = mesh(t(), ["app.endpoints.http"], app(), { services: { runner: { build: { context: "./e2e", dockerfile: "Runnerfile" } } } });
    const value = testerService(root)?.build as any;
    expect(value.context).toContain("e2e"); expect(value.dockerfile).toBe("Runnerfile");
  });
  it("TST-028 accepts only string tester.env values", () => {
    for (const value of [1, true, null, [], {}]) expect(meshSchema.safeParse({ services: { gateway: { path: "gateway" } }, tester: t({ RETRIES: value }) }).success).toBe(false);
  });
  it("TST-029 resolves E2E-only published endpoint", () => {
    const root = meshFixture({ services: { gateway: { path: "gateway" } }, e2e: { services: { gateway: { publish: ["app.endpoints.metrics"] } } }, tester: t({ METRICS_URL: "${gateway.app.endpoints.metrics.public_url}" }) }, { gateway: { app: { endpoints: { http: http() } }, e2e: { app: { endpoints: { metrics: { port: 9000, publicPort: "AUTO", scheme: "http" } } } } } }, { "t.yml": runner });
    expect(env(testerService(root)).METRICS_URL).toMatch(/^http:\/\/127\.0\.0\.1:\d+$/);
  });
  it("TST-030 failure does not mutate configuration or topology", () => {
    const root = mesh(t()); const before = readFileSync(path.join(root, "mesh.json"), "utf8");
    const first = compiled(root);
    write(root, "t.yml", { services: { runner: { image: "alpine", command: ["sh", "-c", "exit 23"] } } });
    const second = compiled(root);
    expect(readFileSync(path.join(root, "mesh.json"), "utf8")).toBe(before);
    expect(second.endpoints).toEqual(first.endpoints);
  });
});
