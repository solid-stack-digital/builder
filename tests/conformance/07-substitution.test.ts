import { afterEach, describe, expect, it } from "vitest";
import { meshSchema } from "../../src/core/mesh/meshSchema.js";
import { cleanupFixtures, compileMesh, dep, env, http, meshFixture, ownerBundle, write } from "./fixture.js";

afterEach(cleanupFixtures);
const healthy = { image: "alpine", healthcheck: { test: ["CMD", "true"] } };
const slot = (port = 3000, extra: object = {}) => ({ compose: "d.yml", endpoints: { http: { service: "owner", port, primary: true, scheme: "http", ...extra } } });
const provider = (port = 8080, extra: Record<string, unknown> = {}) => ({ app: { endpoints: { http: http(port, extra) } } });
function pair(value = "${dependencies.backend.endpoints.http.network_url}", providerBuild: Record<string, unknown> = provider(), meshExtra: object = {}, consumerBuild: Record<string, unknown> = {}) {
  return meshFixture({ services: { consumer: { path: "consumer", dependencies: { backend: "backend" } }, backend: { path: "backend" } }, ...meshExtra }, { consumer: { app: { env: { URL: value } }, dependencies: { backend: slot() }, ...consumerBuild }, backend: providerBuild }, { "consumer/d.yml": ownerBundle() });
}
const result = (root: string, stage: "dev" | "prod" | "e2e" = "prod") => compileMesh(stage, root);
const edge = (service: any, target: string) => (service?.depends_on as any)?.[target];
const tester = { compose: "t.yml", service: "runner" };
const testerFile = { "t.yml": { services: { runner: { image: "alpine" } } } };

describe("catalog 07: mesh services and dependency substitution", () => {
  it("MSH-001 composes one independent service under mesh key", () => {
    const root = meshFixture({ services: { identity: { path: "identity" } } }, { identity: { app: { endpoints: { http: http() } }, dependencies: { db: slot() } } }, { "identity/d.yml": ownerBundle() });
    const c = result(root); expect(c.compose.services.identity).toBeDefined(); expect(c.endpoints.app.identity?.http?.networkHost).toBe("identity"); expect(c.endpoints.dependencies.identity?.db?.http).toBeDefined();
  });
  it("MSH-002 uses mesh key rather than build name for identity", () => {
    const root = meshFixture({ services: { identity: { path: "identity", env: { URL: "${identity.app.endpoints.http.network_url}" } } } }, { identity: { name: "users-api", ...provider() } });
    expect(env(result(root).compose.services.identity).URL).toBe("http://identity:8080");
    write(root, "mesh.json", { services: { identity: { path: "identity", env: { URL: "${users-api.app.endpoints.http.network_url}" } } } });
    expect(() => result(root)).toThrow(/users-api/);
  });
  it("MSH-003 applies mesh service env only to app", () => {
    const root = meshFixture({ services: { api: { path: "api", env: { REGION: "mesh" } } } }, { api: { app: {}, dependencies: { db: slot() } } }, { "api/d.yml": ownerBundle() });
    const c = result(root); expect(env(c.compose.services.api).REGION).toBe("mesh"); expect(env(c.compose.services[c.endpoints.dependencies.api?.db?.http?.networkHost!]).REGION).toBeUndefined();
  });
  it("MSH-004 resolves direct top-level reference without lifecycle edge", () => {
    const root = meshFixture({ services: { consumer: { path: "consumer", env: { URL: "${backend.app.endpoints.http.network_url}" } }, backend: { path: "backend" } } }, { consumer: { app: {} }, backend: provider() });
    const c = result(root); expect(env(c.compose.services.consumer).URL).toBe("http://backend:8080"); expect(edge(c.compose.services.consumer, "backend")).toBeUndefined();
  });
  it("MSH-005 substitutes logical slot atomically", () => {
    const c = result(pair()); expect(env(c.compose.services.consumer).URL).toBe("http://backend:8080"); expect(Object.keys(c.compose.services)).toEqual(["backend", "consumer"]); expect(edge(c.compose.services.consumer, "backend")).toEqual({ condition: "service_healthy" });
  });
  it("MSH-006 rejects unknown consumer slot", () => {
    const root = pair(); write(root, "mesh.json", { services: { consumer: { path: "consumer", dependencies: { payments: "backend" } }, backend: { path: "backend" } } });
    expect(() => result(root)).toThrow(/payments/);
  });
  it("MSH-007 rejects unknown provider", () => {
    const root = pair(); write(root, "mesh.json", { services: { consumer: { path: "consumer", dependencies: { backend: "missing" } }, backend: { path: "backend" } } });
    expect(() => result(root)).toThrow(/missing/);
  });
  it("MSH-008 validates only consumed provider properties", () => {
    const root = pair(); write(root, "consumer/build.json", { app: { env: { URL: "${dependencies.backend.endpoints.http.network_url}" } }, dependencies: { backend: { compose: "d.yml", endpoints: { http: { service: "owner", port: 3000, primary: true }, metrics: { service: "owner", port: 9000 } } } } });
    expect(env(result(root).compose.services.consumer).URL).toBe("http://backend:8080");
  });
  it("MSH-009 rejects missing consumed provider endpoint", () => {
    const root = pair("${dependencies.backend.endpoints.metrics.network_host}");
    write(root, "consumer/build.json", { app: { env: { URL: "${dependencies.backend.endpoints.metrics.network_host}" } }, dependencies: { backend: { compose: "d.yml", endpoints: { http: { service: "owner", port: 3000, primary: true }, metrics: { service: "owner", port: 9000 } } } } });
    expect(() => result(root)).toThrow(/metrics/);
  });
  it("MSH-010 accepts provider host property without scheme", () => expect(env(result(pair("${dependencies.backend.endpoints.http.network_host}", { app: { endpoints: { http: { port: 8080, primary: true } } } })).compose.services.consumer).URL).toBe("backend"));
  it("MSH-011 requires provider scheme for URL", () => expect(() => result(pair("${dependencies.backend.endpoints.http.network_url}", { app: { endpoints: { http: { port: 8080, primary: true } } } }))).toThrow(/scheme/i));
  it("MSH-012 requires effective provider publication for public property", () => expect(() => result(pair("${dependencies.backend.endpoints.http.public_port}", provider(8080, { publicPort: "AUTO" })))).toThrow(/publication/i));
  it("MSH-013 uses provider port rather than local port", () => expect(env(result(pair()).compose.services.consumer).URL).toBe("http://backend:8080"));
  it("MSH-014 uses provider scheme rather than local scheme", () => expect(env(result(pair(undefined, provider(8080, { scheme: "https" }))).compose.services.consumer).URL).toBe("https://backend:8080"));
  it("MSH-015 requires exact provider endpoint name", () => {
    const root = pair(); write(root, "backend/build.json", { app: { endpoints: { api: http(8080) } } }); expect(() => result(root)).toThrow(/http/);
  });
  it("MSH-016 ignores unused local endpoint capability", () => {
    const root = pair(); write(root, "consumer/build.json", { app: { env: { URL: "${dependencies.backend.endpoints.http.network_url}" } }, dependencies: { backend: { compose: "d.yml", endpoints: { http: { service: "owner", port: 3000, primary: true }, "legacy-admin": { service: "owner", port: 9000, publicPort: "AUTO" } } } } });
    expect(env(result(root).compose.services.consumer).URL).toBe("http://backend:8080");
  });
  it("MSH-017 removes all local helpers and resources on substitution", () => {
    const root = pair(); write(root, "consumer/d.yml", { services: { owner: healthy, helper: { image: "alpine" }, db: { image: "alpine" } }, volumes: { data: {} }, configs: { conf: { file: "./c" } }, secrets: { secret: { file: "./s" } }, networks: { internal: {} } });
    const c = result(root); expect(Object.keys(c.compose.services)).toEqual(["backend", "consumer"]); expect(c.compose.volumes).toBeUndefined(); expect(c.compose.configs).toBeUndefined(); expect(c.compose.secrets).toBeUndefined();
  });
  it("MSH-018 retains unsubstituted local dependency", () => {
    const root = pair(); write(root, "consumer/build.json", { app: { env: { URL: "${dependencies.backend.endpoints.http.network_url}" } }, dependencies: { backend: slot(), redis: { ...slot(), compose: "redis.yml" } } }); write(root, "consumer/redis.yml", ownerBundle());
    const c = result(root); expect(c.endpoints.dependencies.consumer?.redis?.http).toBeDefined(); expect(edge(c.compose.services.consumer, "backend")).toBeDefined();
  });
  it("MSH-019 scopes equal logical slot names by consumer", () => {
    const root = meshFixture({ services: { a: { path: "a", dependencies: { store: "store-a" } }, b: { path: "b", dependencies: { store: "store-b" } }, "store-a": { path: "store-a" }, "store-b": { path: "store-b" } } }, { a: { app: { env: { URL: "${dependencies.store.endpoints.http.network_host}" } }, dependencies: { store: slot() } }, b: { app: { env: { URL: "${dependencies.store.endpoints.http.network_host}" } }, dependencies: { store: slot() } }, "store-a": provider(), "store-b": provider() }, { "a/d.yml": ownerBundle(), "b/d.yml": ownerBundle() });
    const c = result(root); expect(env(c.compose.services.a).URL).toBe("store-a"); expect(env(c.compose.services.b).URL).toBe("store-b");
  });
  it("MSH-020 permits multiple consumers of one provider", () => {
    const names = ["a", "b", "c"], root = meshFixture({ services: { backend: { path: "backend" }, ...Object.fromEntries(names.map(n => [n, { path: n, dependencies: { backend: "backend" } }])) } }, { backend: provider(), ...Object.fromEntries(names.map(n => [n, { app: {}, dependencies: { backend: slot() } }])) }, Object.fromEntries(names.map(n => [`${n}/d.yml`, ownerBundle()])));
    const c = result(root); expect(Object.keys(c.compose.services)).toHaveLength(4); for (const n of names) expect(edge(c.compose.services[n], "backend")).toEqual({ condition: "service_healthy" });
  });
  it("MSH-021 replaces binding in E2E overlay", () => {
    const root = pair(); write(root, "mesh.json", { services: { consumer: { path: "consumer", dependencies: { backend: "backend" } }, backend: { path: "backend" }, fake: { path: "fake" } }, e2e: { services: { consumer: { dependencies: { backend: "fake" } } } }, tester }); write(root, "fake/build.json", provider(9090)); write(root, "t.yml", testerFile["t.yml"]);
    expect(env(result(root).compose.services.consumer).URL).toBe("http://backend:8080"); expect(env(result(root, "e2e").compose.services.consumer).URL).toBe("http://fake:9090");
  });
  it("MSH-022 adds provider and binding in same stage", () => {
    const root = pair(); write(root, "mesh.json", { services: { consumer: { path: "consumer" }, backend: { path: "backend" } }, e2e: { services: { fake: { path: "fake" }, consumer: { dependencies: { backend: "fake" } } } }, tester }); write(root, "fake/build.json", provider(9090)); write(root, "t.yml", testerFile["t.yml"]);
    expect(env(result(root, "e2e").compose.services.consumer).URL).toBe("http://fake:9090");
  });
  it("MSH-023 rejects base binding to stage-only provider outside stage", () => {
    const root = pair(); write(root, "mesh.json", { services: { consumer: { path: "consumer", dependencies: { backend: "fake" } }, backend: { path: "backend" } }, e2e: { services: { fake: { path: "fake" } } }, tester }); write(root, "fake/build.json", provider()); write(root, "t.yml", testerFile["t.yml"]);
    expect(() => result(root, "dev")).toThrow(/fake/);
  });
  it("MSH-024 replaces service path in active stage", () => {
    const root = meshFixture({ services: { api: { path: "api" } }, e2e: { services: { api: { path: "replacement" } } }, tester }, { api: provider(3000), replacement: provider(8080) }, testerFile);
    expect(result(root).endpoints.app.api?.http?.networkPort).toBe(3000); expect(result(root, "e2e").endpoints.app.api?.http?.networkPort).toBe(8080);
  });
  it("MSH-025 requires path on stage-added service", () => {
    const root = meshFixture({ services: { api: { path: "api" } }, e2e: { services: { fake: { env: { X: "1" } } } }, tester }, { api: provider() }, testerFile);
    expect(() => result(root, "e2e")).toThrow(/fake.path/);
  });
  it("MSH-026 has no service removal syntax", () => {
    expect(meshSchema.safeParse({ services: { api: { path: "api" } }, e2e: { services: { api: null } } }).success).toBe(false);
    const root = meshFixture({ services: { api: { path: "api" } }, e2e: { services: {} }, tester }, { api: provider() }, testerFile);
    expect(result(root, "e2e").compose.services.api).toBeDefined();
  });
  it("MSH-027 adds provider health edge without explicit dependsOn", () => expect(edge(result(pair()).compose.services.consumer, "backend")).toEqual({ condition: "service_healthy" }));
  it("MSH-028 rejects direct substitution cycle", () => {
    const root = meshFixture({ services: { a: { path: "a", dependencies: { other: "b" } }, b: { path: "b", dependencies: { other: "a" } } } }, { a: { app: {}, dependencies: { other: slot() } }, b: { app: {}, dependencies: { other: slot() } } }, { "a/d.yml": ownerBundle(), "b/d.yml": ownerBundle() });
    expect(() => result(root)).toThrow(/cycle/i);
  });
  it("MSH-029 rejects mixed substitution and explicit lifecycle cycle", () => {
    const root = pair(); write(root, "mesh.json", { services: { consumer: { path: "consumer", dependencies: { backend: "backend" } }, backend: { path: "backend", dependsOn: ["other"] }, other: { path: "other", dependsOn: ["consumer"] } } }); write(root, "other/build.json", { app: {} });
    expect(() => result(root)).toThrow(/cycle/i);
  });
  it("MSH-030 resolves valid substitution chain with backend-local infra", () => {
    const root = meshFixture({ services: { gateway: { path: "gateway", dependencies: { frontend: "frontend" } }, frontend: { path: "frontend", dependencies: { backend: "backend" } }, backend: { path: "backend" } } }, { gateway: { app: { env: { URL: "${dependencies.frontend.endpoints.http.network_url}" } }, dependencies: { frontend: slot() } }, frontend: { app: { endpoints: { http: http(4000) }, env: { URL: "${dependencies.backend.endpoints.http.network_url}" } }, dependencies: { backend: slot() } }, backend: { ...provider(), dependencies: { redis: slot() } } }, { "gateway/d.yml": ownerBundle(), "frontend/d.yml": ownerBundle(), "backend/d.yml": ownerBundle() });
    const c = result(root); expect(env(c.compose.services.gateway).URL).toBe("http://frontend:4000"); expect(env(c.compose.services.frontend).URL).toBe("http://backend:8080"); expect(c.endpoints.dependencies.backend?.redis?.http).toBeDefined();
  });
  it("MSH-031 honors explicit dependsOn without logical slot", () => {
    const root = meshFixture({ services: { gateway: { path: "gateway", dependsOn: ["metrics"] }, metrics: { path: "metrics" } } }, { gateway: { app: {} }, metrics: provider() });
    expect(edge(result(root).compose.services.gateway, "metrics")).toEqual({ condition: "service_healthy" });
  });
  it("MSH-032 deduplicates substitution target in dependsOn", () => {
    const root = pair(); write(root, "mesh.json", { services: { consumer: { path: "consumer", dependencies: { backend: "backend" }, dependsOn: ["backend"] }, backend: { path: "backend" } } });
    expect((result(root).compose.services.consumer?.depends_on as any)).toEqual({ backend: { condition: "service_healthy" } });
  });
  it("MSH-033 publishes unsubstituted local dependency", () => {
    const root = meshFixture({ services: { consumer: { path: "consumer", publish: ["dependencies.mail.endpoints.http"] } } }, { consumer: { app: {}, dependencies: { mail: slot(3000, { publicPort: "AUTO" }) } } }, { "consumer/d.yml": ownerBundle() });
    const c = result(root), ep = c.endpoints.dependencies.consumer?.mail?.http;
    expect(c.compose.services[ep?.networkHost!]?.ports).toHaveLength(1); expect(ep?.effectivelyPublished).toBe(true);
  });
  it("MSH-034 rejects publish of substituted dependency through consumer", () => {
    const root = pair(); write(root, "mesh.json", { services: { consumer: { path: "consumer", dependencies: { backend: "backend" }, publish: ["dependencies.backend.endpoints.http"] }, backend: { path: "backend" } } });
    expect(() => result(root)).toThrow(/substituted/);
  });
  it("MSH-035 resolves published provider through logical public reference", () => {
    const root = pair("${dependencies.backend.endpoints.http.public_url}", provider(8080, { publicPort: "AUTO" }));
    write(root, "mesh.json", { services: { consumer: { path: "consumer", dependencies: { backend: "backend" } }, backend: { path: "backend", publish: ["app.endpoints.http"] } } });
    expect(env(result(root).compose.services.consumer).URL).toMatch(/^http:\/\/127\.0\.0\.1:\d+$/);
  });
  it("MSH-036 rejects mesh endpoint mutations", () => {
    for (const key of ["port", "publicPort", "scheme", "endpoints"]) expect(meshSchema.safeParse({ services: { api: { path: "api", [key]: 1 } } }).success).toBe(false);
  });
  it("MSH-037 allows direct app reference without logical slot", () => {
    const root = meshFixture({ services: { consumer: { path: "consumer", env: { URL: "${backend.app.endpoints.http.network_url}" } }, backend: { path: "backend" } } }, { consumer: { app: {} }, backend: provider() });
    const c = result(root); expect(env(c.compose.services.consumer).URL).toBe("http://backend:8080"); expect(edge(c.compose.services.consumer, "backend")).toBeUndefined();
  });
  it("MSH-038 resolves unchanged logical expression through stage provider", () => {
    const root = pair(); write(root, "mesh.json", { services: { consumer: { path: "consumer", dependencies: { backend: "backend" } }, backend: { path: "backend" }, fake: { path: "fake" } }, e2e: { services: { consumer: { dependencies: { backend: "fake" } } } }, tester }); write(root, "fake/build.json", provider(9090)); write(root, "t.yml", testerFile["t.yml"]);
    expect(env(result(root).compose.services.consumer).URL).toBe("http://backend:8080"); expect(env(result(root, "e2e").compose.services.consumer).URL).toBe("http://fake:9090");
  });
  it("MSH-039 ignores extra provider endpoints", () => {
    const root = pair(); write(root, "backend/build.json", { app: { endpoints: { http: http(8080), metrics: { port: 9000 }, admin: { port: 9001 } } } });
    expect(env(result(root).compose.services.consumer).URL).toBe("http://backend:8080");
  });
  it("MSH-040 keeps backend-local infra scoped to backend", () => {
    const root = pair(); write(root, "backend/build.json", { ...provider(), dependencies: { firebase: slot() } }); write(root, "backend/d.yml", ownerBundle());
    const c = result(root); expect(c.endpoints.dependencies.backend?.firebase?.http).toBeDefined(); expect(c.endpoints.dependencies.consumer?.firebase).toBeUndefined();
  });
});
