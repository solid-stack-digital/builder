import { afterEach, describe, expect, it } from "vitest";
import { cleanupFixtures, compileMesh, compileService, dep, env, fixture, http, meshFixture, ownerBundle, write } from "./fixture.js";

afterEach(cleanupFixtures);
const healthy = { image: "alpine", healthcheck: { test: ["CMD", "true"] } };
const module = (compose: string, dependsOn: string[] = []) => ({ ...dep(compose), dependsOn });
function localGraph() { return fixture({ app: {}, dependencies: { redis: module("redis.yml"), worker: module("worker.yml") } }, { "redis.yml": ownerBundle(), "worker.yml": ownerBundle() }); }
function bound(extra: Record<string, unknown> = {}) {
  return meshFixture({ services: { frontend: { path: "frontend", dependencies: { backend: "backend" }, ...extra }, backend: { path: "backend" } } }, { frontend: { app: {}, dependencies: { backend: dep("d.yml") } }, backend: { app: { endpoints: { api: http(8080) } } } }, { "frontend/d.yml": ownerBundle() });
}
const edges = (service: any) => (service?.depends_on ?? {}) as Record<string, { condition: string }>;
const allHealthy = (service: any) => Object.values(edges(service)).every(x => x.condition === "service_healthy");

describe("catalog 05: health and lifecycle", () => {
  it("LIFE-001 rejects owner without healthcheck", () => {
    const root = fixture({ app: {}, dependencies: { db: dep("d.yml") } }, { "d.yml": { services: { owner: { image: "alpine" } } } });
    expect(() => compileService("prod", root)).toThrow(/owner.*healthcheck|healthcheck.*owner/i);
  });
  it("LIFE-002 uses one healthcheck for several endpoints on one owner", () => {
    const root = fixture({ app: {}, dependencies: { db: { compose: "d.yml", endpoints: { a: { service: "owner", port: 1, primary: true }, b: { service: "owner", port: 2 }, c: { service: "owner", port: 3 } } } } }, { "d.yml": ownerBundle() });
    expect(Object.keys(edges(compileService("prod", root).compose.services.app))).toHaveLength(1);
  });
  it("LIFE-003 requires healthcheck from every distinct endpoint owner", () => {
    const root = fixture({ app: {}, dependencies: { db: { compose: "d.yml", endpoints: { a: { service: "a", port: 1, primary: true }, b: { service: "b", port: 2 } } } } }, { "d.yml": { services: { a: healthy, b: { image: "alpine" } } } });
    expect(() => compileService("prod", root)).toThrow(/services.b.healthcheck/);
  });
  it("LIFE-004 does not require helper healthcheck", () => {
    const root = fixture({ app: {}, dependencies: { db: dep("d.yml") } }, { "d.yml": ownerBundle({ migrate: { image: "alpine" } }) });
    const result = compileService("prod", root);
    expect(result.compose.services["dep--db--migrate"]?.healthcheck).toBeUndefined();
    expect(edges(result.compose.services.app)).not.toHaveProperty("dep--db--migrate");
  });
  it("LIFE-005 creates automatic app-to-owner healthy edge", () => {
    const root = fixture({ app: {}, dependencies: { db: dep("d.yml") } }, { "d.yml": ownerBundle() });
    const result = compileService("prod", root), owner = result.endpoints.dependencies.db?.api?.networkHost;
    expect(edges(result.compose.services.app)[owner!]).toEqual({ condition: "service_healthy" });
  });
  it("LIFE-006 waits on all three distinct owners", () => {
    const root = fixture({ app: {}, dependencies: { db: { compose: "d.yml", endpoints: { a: { service: "a", port: 1, primary: true }, b: { service: "b", port: 2 }, c: { service: "c", port: 3 } } } } }, { "d.yml": { services: { a: healthy, b: healthy, c: healthy } } });
    const edgeSet = edges(compileService("prod", root).compose.services.app);
    expect(Object.keys(edgeSet)).toHaveLength(3); expect(Object.values(edgeSet).every(x => x.condition === "service_healthy")).toBe(true);
  });
  it("LIFE-007 waits on owners across three dependencies without env refs", () => {
    const root = fixture({ app: {}, dependencies: { a: dep("a.yml"), b: dep("b.yml"), c: dep("c.yml") } }, { "a.yml": ownerBundle(), "b.yml": ownerBundle(), "c.yml": ownerBundle() });
    expect(Object.keys(edges(compileService("prod", root).compose.services.app))).toHaveLength(3);
  });
  it("LIFE-008 removes dependency services and gates in isolated stages", () => {
    const root = localGraph();
    for (const stage of ["dev", "test"] as const) {
      const result = compileService(stage, root);
      expect(Object.keys(result.compose.services)).toEqual(["app"]);
      expect(Object.keys(edges(result.compose.services.app))).toHaveLength(0);
      expect(env(result.compose.services.app).INFRA_MODE).toBe("isolated");
    }
  });
  it("LIFE-009 requires qualified dependency lifecycle path", () => {
    const root = localGraph(); write(root, "build.json", { app: {}, dependencies: { redis: module("redis.yml"), worker: module("worker.yml", ["redis"]) } });
    expect(() => compileService("prod", root)).toThrow(/dependencies.worker.dependsOn/);
  });
  it("LIFE-010 rejects dependency self-edge", () => {
    const root = localGraph(); write(root, "build.json", { app: {}, dependencies: { redis: module("redis.yml", ["dependencies.redis"]) } });
    expect(() => compileService("prod", root)).toThrow(/itself|self/i);
  });
  it("LIFE-011 rejects unknown dependency target", () => {
    const root = localGraph(); write(root, "build.json", { app: {}, dependencies: { worker: module("worker.yml", ["dependencies.missing"]) } });
    expect(() => compileService("prod", root)).toThrow(/missing/);
  });
  it("LIFE-012 rejects inert dependency target", () => {
    const root = localGraph(); write(root, "build.json", { app: {}, dependencies: { redis: { compose: "redis.yml" }, worker: module("worker.yml", ["dependencies.redis"]) } });
    expect(() => compileService("prod", root)).toThrow(/inert/);
  });
  it("LIFE-013 rejects two-node dependency cycle", () => {
    const root = fixture({ app: {}, dependencies: { a: module("a.yml", ["dependencies.b"]), b: module("b.yml", ["dependencies.a"]) } }, { "a.yml": ownerBundle(), "b.yml": ownerBundle() });
    expect(() => compileService("prod", root)).toThrow(/cycle|a.*b/i);
  });
  it("LIFE-014 rejects long dependency cycle", () => {
    const names = ["a", "b", "c", "d"];
    const dependencies = Object.fromEntries(names.map((name, i) => [name, module(`${name}.yml`, [`dependencies.${names[(i + 1) % 4]}`])]));
    const root = fixture({ app: {}, dependencies }, Object.fromEntries(names.map(name => [`${name}.yml`, ownerBundle()])));
    expect(() => compileService("prod", root)).toThrow(/cycle|a.*b.*c.*d/i);
  });
  it("LIFE-015 expands module edge from every source owner to every target owner", () => {
    const two = { endpoints: { a: { service: "a", port: 1, primary: true }, b: { service: "b", port: 2 } } };
    const root = fixture({ app: {}, dependencies: { db: { compose: "db.yml", ...two }, api: { compose: "api.yml", ...two, dependsOn: ["dependencies.db"] } } }, { "db.yml": { services: { a: healthy, b: healthy } }, "api.yml": { services: { a: healthy, b: healthy } } });
    const result = compileService("prod", root);
    for (const source of Object.values(result.endpoints.dependencies.api!)) {
      const sourceEdges = edges(result.compose.services[source.networkHost]);
      for (const target of Object.values(result.endpoints.dependencies.db!)) expect(sourceEdges[target.networkHost]).toEqual({ condition: "service_healthy" });
    }
  });
  it("LIFE-016 leaves helper lifecycle under source Compose control", () => {
    const root = fixture({ app: {}, dependencies: { db: module("db.yml"), api: module("api.yml", ["dependencies.db"]) } }, { "db.yml": ownerBundle(), "api.yml": ownerBundle({ seed: { image: "alpine" } }) });
    const result = compileService("prod", root);
    expect(Object.keys(edges(result.compose.services["dep--api--seed"]))).toHaveLength(0);
    expect(Object.keys(edges(result.compose.services["dep--api--owner"]))).toHaveLength(1);
  });
  it("LIFE-017 unions stage module lifecycle", () => {
    const root = fixture({ app: {}, dependencies: { redis: module("redis.yml"), mail: module("mail.yml"), worker: module("worker.yml", ["dependencies.redis"]) }, e2e: { dependencies: { worker: { dependsOn: ["dependencies.redis", "dependencies.mail"] } } } }, { "redis.yml": ownerBundle(), "mail.yml": ownerBundle(), "worker.yml": ownerBundle() });
    expect(Object.keys(edges(compileService("prod", root).compose.services["dep--worker--owner"]))).toHaveLength(1);
    const e2eEdges = edges(compileService("e2e", root).compose.services["dep--worker--owner"]);
    expect(Object.keys(e2eEdges)).toHaveLength(2); expect(Object.values(e2eEdges).every(x => x.condition === "service_healthy")).toBe(true);
  });
  it("LIFE-018 does not infer dependency edge from env reference", () => {
    const root = fixture({ app: {}, dependencies: { redis: module("redis.yml"), worker: { ...module("worker.yml"), env: { REDIS_HOST: "${dependencies.redis.endpoints.api.network_host}" } } } }, { "redis.yml": ownerBundle(), "worker.yml": ownerBundle() });
    const result = compileService("prod", root);
    expect(env(result.compose.services["dep--worker--owner"]).REDIS_HOST).toContain("redis");
    expect(Object.keys(edges(result.compose.services["dep--worker--owner"]))).toHaveLength(0);
  });
  it("LIFE-019 applies explicit mesh health edge", () => {
    const root = meshFixture({ services: { gateway: { path: "gateway", dependsOn: ["backend"] }, backend: { path: "backend" } } }, { gateway: { app: {} }, backend: { app: {} } });
    expect(edges(compileMesh("prod", root).compose.services.gateway).backend).toEqual({ condition: "service_healthy" });
  });
  it("LIFE-020 rejects unknown mesh lifecycle target", () => {
    const root = meshFixture({ services: { gateway: { path: "gateway", dependsOn: ["missing-service"] } } }, { gateway: { app: {} } });
    expect(() => compileMesh("prod", root)).toThrow(/missing-service/);
  });
  it("LIFE-021 rejects mesh self-edge", () => {
    const root = meshFixture({ services: { backend: { path: "backend", dependsOn: ["backend"] } } }, { backend: { app: {} } });
    expect(() => compileMesh("prod", root)).toThrow(/itself|self/i);
  });
  it("LIFE-022 rejects mesh three-node cycle", () => {
    const root = meshFixture({ services: { a: { path: "a", dependsOn: ["b"] }, b: { path: "b", dependsOn: ["c"] }, c: { path: "c", dependsOn: ["a"] } } }, { a: { app: {} }, b: { app: {} }, c: { app: {} } });
    expect(() => compileMesh("prod", root)).toThrow(/cycle/i);
  });
  it("LIFE-023 does not infer mesh lifecycle from env URL", () => {
    const root = meshFixture({ services: { gateway: { path: "gateway", env: { URL: "${backend.app.endpoints.http.network_url}" } }, backend: { path: "backend" } } }, { gateway: { app: {} }, backend: { app: { endpoints: { http: http() } } } });
    const result = compileMesh("prod", root);
    expect(env(result.compose.services.gateway).URL).toBe("http://backend:3000");
    expect(Object.keys(edges(result.compose.services.gateway))).toHaveLength(0);
  });
  it("LIFE-024 transfers substitution lifecycle to provider", () => {
    const result = compileMesh("prod", bound());
    expect(edges(result.compose.services.frontend).backend).toEqual({ condition: "service_healthy" });
    expect(Object.keys(result.compose.services)).toEqual(["backend", "frontend"]);
  });
  it("LIFE-025 deduplicates explicit and substitution provider health", () => {
    const result = compileMesh("prod", bound({ dependsOn: ["backend"] }));
    expect(edges(result.compose.services.frontend)).toEqual({ backend: { condition: "service_healthy" } });
  });
  it("LIFE-026 rejects substitution-created cycle", () => {
    const root = bound();
    write(root, "mesh.json", { services: { frontend: { path: "frontend", dependencies: { backend: "backend" } }, backend: { path: "backend", dependsOn: ["frontend"] } } });
    expect(() => compileMesh("prod", root)).toThrow(/cycle/i);
  });
  it("LIFE-027 composes mixed acyclic lifecycle chain", () => {
    const root = meshFixture({ services: { gateway: { path: "gateway", dependsOn: ["frontend"] }, frontend: { path: "frontend", dependencies: { backend: "backend" } }, backend: { path: "backend" } } }, { gateway: { app: {} }, frontend: { app: {}, dependencies: { backend: dep("d.yml") } }, backend: { app: {}, dependencies: { redis: dep("r.yml") } } }, { "frontend/d.yml": ownerBundle(), "backend/r.yml": ownerBundle() });
    const result = compileMesh("prod", root);
    expect(edges(result.compose.services.gateway).frontend).toEqual({ condition: "service_healthy" });
    expect(edges(result.compose.services.frontend).backend).toEqual({ condition: "service_healthy" });
    expect(Object.keys(edges(result.compose.services.backend))).toHaveLength(1);
  });
  it("LIFE-028 gates many consumers on one provider", () => {
    const consumers = ["a", "b", "c"];
    const mesh = { services: { identity: { path: "identity" }, ...Object.fromEntries(consumers.map(name => [name, { path: name, dependencies: { auth: "identity" } }])) } };
    const builds = { identity: { app: { endpoints: { api: http(8080) } } }, ...Object.fromEntries(consumers.map(name => [name, { app: {}, dependencies: { auth: dep("d.yml") } }])) };
    const files = Object.fromEntries(consumers.map(name => [`${name}/d.yml`, ownerBundle()]));
    const result = compileMesh("prod", meshFixture(mesh, builds, files));
    for (const name of consumers) expect(edges(result.compose.services[name]).identity).toEqual({ condition: "service_healthy" });
    expect(Object.keys(result.compose.services)).toHaveLength(4);
  });
  it("LIFE-029 selects dev target for provider in mesh dev", () => {
    const result = compileMesh("dev", bound());
    expect((result.compose.services.backend?.build as any).target).toBe("dev");
    expect(edges(result.compose.services.frontend).backend).toEqual({ condition: "service_healthy" });
  });
  it("LIFE-030 keeps prod app targets in mesh E2E", () => {
    const root = bound(); write(root, "mesh.json", { services: { frontend: { path: "frontend", dependencies: { backend: "backend" } }, backend: { path: "backend" } }, tester: { compose: "t.yml", service: "runner" } }); write(root, "t.yml", { services: { runner: { image: "alpine" } } });
    const result = compileMesh("e2e", root);
    expect((result.compose.services.backend?.build as any).target).toBe("prod");
    expect(env(result.compose.services.backend).EXEC_MODE).toBe("e2e");
    expect(edges(result.compose.services.frontend).backend).toEqual({ condition: "service_healthy" });
    expect(result.testerServiceName).toBeDefined();
  });
});
