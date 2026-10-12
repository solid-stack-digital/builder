import { afterEach, describe, expect, it } from "vitest";
import { existsSync, rmSync } from "node:fs";
import net from "node:net";
import path from "node:path";
import { compileMeshComposition } from "../../src/core/mesh/v2/compileMeshComposition.js";
import { cleanupFixtures, compileMesh, compileService, dep, env, fixture, http, meshFixture, ownerBundle, write } from "./fixture.js";

afterEach(cleanupFixtures);
const app = (publicPort: number | "AUTO" | undefined = "AUTO") => ({ app: { endpoints: { http: http(3000, publicPort === undefined ? {} : { publicPort }) } } });
const single = (publish: string[] = [], publicPort: number | "AUTO" | undefined = "AUTO") => meshFixture({ services: { api: { path: "api", publish } } }, { api: app(publicPort) });
const published = (root: string) => compileMesh("prod", root).endpoints.app.api?.http;
const local = (publicPort: number | "AUTO" = "AUTO") => ({ app: {}, dependencies: { db: dep("d.yml", "owner", 6379, { publicPort }) } });
const withLocal = (publish: string[]) => meshFixture({ services: { api: { path: "api", publish } } }, { api: local() }, { "api/d.yml": ownerBundle() });

describe("catalog 08: explicit publication and host ports", () => {
  it("PUB-001 keeps mesh app private by default", () => {
    const root = single(); const result = compileMesh("prod", root);
    expect(result.compose.services.api?.ports).toBeUndefined(); expect(result.endpoints.app.api?.http?.effectivelyPublished).toBe(false);
  });
  it("PUB-002 publishes fixed app endpoint on loopback", () => {
    const result = compileMesh("prod", single(["app.endpoints.http"], 31001));
    expect(result.compose.services.api?.ports).toMatchObject([{ target: 3000, published: 31001, host_ip: "127.0.0.1" }]);
    expect(result.endpoints.app.api?.http?.publicHost).toBe("127.0.0.1");
  });
  it("PUB-003 allocates concrete AUTO app port", () => {
    const result = compileMesh("prod", single(["app.endpoints.http"]));
    expect(result.endpoints.app.api?.http?.publicPort).toEqual(expect.any(Number));
  });
  it("PUB-004 publishes local dependency owner", () => {
    const result = compileMesh("prod", withLocal(["dependencies.db.endpoints.api"]));
    const ep = result.endpoints.dependencies.api?.db?.api;
    expect(result.compose.services[ep?.networkHost!]?.ports).toMatchObject([{ target: 6379, published: ep?.publicPort }]);
  });
  it("PUB-005 refuses publish without publicPort capability", () => {
    const root = meshFixture({ services: { api: { path: "api", publish: ["app.endpoints.http"] } } }, { api: { app: { endpoints: { http: http() } } } });
    expect(() => compileMesh("prod", root)).toThrow(/publicPort/);
  });
  it("PUB-006 refuses unknown app endpoint", () => expect(() => compileMesh("prod", single(["app.endpoints.admin"]))).toThrow(/admin/));
  it("PUB-007 refuses unknown dependency endpoint", () => expect(() => compileMesh("prod", withLocal(["dependencies.db.endpoints.ui"]))).toThrow(/ui/));
  it("PUB-008 rejects malformed publish grammar without repair", () => {
    for (const target of ["http", "services.app.http", "dependencies.db.http", "app.endpoints.http.public_url"]) expect(() => compileMesh("prod", single([target]))).toThrow(/Invalid publish target/);
  });
  it("PUB-009 refuses consumer publication of substituted slot", () => {
    const root = meshFixture({ services: { consumer: { path: "consumer", dependencies: { db: "provider" }, publish: ["dependencies.db.endpoints.api"] }, provider: { path: "provider" } } }, { consumer: local(), provider: { app: { endpoints: { api: http() } } } }, { "consumer/d.yml": ownerBundle() });
    expect(() => compileMesh("prod", root)).toThrow(/substituted/);
  });
  it("PUB-010 publishes provider once for substituted consumer", () => {
    const root = meshFixture({ services: { consumer: { path: "consumer", dependencies: { db: "provider" }, env: { URL: "${consumer.dependencies.db.endpoints.api.public_url}" } }, provider: { path: "provider", publish: ["app.endpoints.api"] } } }, { consumer: local(), provider: { app: { endpoints: { api: http(8080, { publicPort: "AUTO" }) } } } }, { "consumer/d.yml": ownerBundle() });
    const result = compileMesh("prod", root);
    expect(result.compose.services.provider?.ports).toHaveLength(1);
    expect(result.compose.services.consumer?.ports).toBeUndefined();
    expect(env(result.compose.services.consumer).URL).toContain("127.0.0.1");
  });
  it("PUB-011 unions stage publish arrays base-first", () => {
    const root = meshFixture({ services: { api: { path: "api", publish: ["app.endpoints.http"] } }, e2e: { services: { api: { publish: ["app.endpoints.http", "app.endpoints.metrics"] } } }, tester: { compose: "t.yml", service: "runner" } }, { api: { app: { endpoints: { http: http(3000, { publicPort: "AUTO" }), metrics: { port: 9000, publicPort: "AUTO" } } } } }, { "t.yml": { services: { runner: { image: "alpine" } } } });
    expect(compileMesh("prod", root).compose.services.api?.ports).toHaveLength(1);
    expect(compileMesh("e2e", root).compose.services.api?.ports).toHaveLength(2);
  });
  it("PUB-012 ignores inactive stage publication for reservation", () => {
    const root = meshFixture({ services: { a: { path: "a", publish: ["app.endpoints.http"] }, b: { path: "b" } }, e2e: { services: { b: { publish: ["app.endpoints.http"] } } }, tester: { compose: "t.yml", service: "runner" } }, { a: app(32001), b: app(32001) }, { "t.yml": { services: { runner: { image: "alpine" } } } });
    expect(compileMesh("dev", root).compose.services.a?.ports).toHaveLength(1);
    expect(() => compileMesh("e2e", root)).toThrow(/32001/);
  });
  it("PUB-013 detects fixed app-app collision globally", () => {
    const root = meshFixture({ services: { a: { path: "a", publish: ["app.endpoints.http"] }, b: { path: "b", publish: ["app.endpoints.http"] } } }, { a: app(33000), b: app(33000) });
    expect(() => compileMesh("prod", root)).toThrow(/a.app.endpoints.http.*b.app.endpoints.http|b.app.endpoints.http.*a.app.endpoints.http/);
  });
  it("PUB-014 detects app versus local dependency collision", () => {
    const root = meshFixture({ services: { a: { path: "a", publish: ["app.endpoints.http"] }, b: { path: "b", publish: ["dependencies.db.endpoints.api"] } } }, { a: app(33001), b: local(33001) }, { "b/d.yml": ownerBundle() });
    expect(() => compileMesh("prod", root)).toThrow(/a.app.endpoints.http.*b.dependencies.db.endpoints.api|b.dependencies.db.endpoints.api.*a.app.endpoints.http/);
  });
  it("PUB-015 detects local dependency collision across consumers", () => {
    const root = meshFixture({ services: { a: { path: "a", publish: ["dependencies.db.endpoints.api"] }, b: { path: "b", publish: ["dependencies.db.endpoints.api"] } } }, { a: local(33002), b: local(33002) }, { "a/d.yml": ownerBundle(), "b/d.yml": ownerBundle() });
    expect(() => compileMesh("prod", root)).toThrow(/33002/);
  });
  it("PUB-016 only reserves selected endpoint despite equal fixed intent", () => {
    const root = meshFixture({ services: { api: { path: "api", publish: ["app.endpoints.http"] } } }, { api: { app: { endpoints: { http: http(3000, { publicPort: 33003 }), metrics: { port: 9000, publicPort: 33003 } } } } });
    const result = compileMesh("prod", root);
    expect(result.compose.services.api?.ports).toHaveLength(1);
    expect(result.endpoints.app.api?.metrics?.effectivelyPublished).toBe(false);
  });
  it("PUB-017 permits independent standalone fixed declarations but rejects combined mesh", () => {
    for (let i = 0; i < 2; i++) expect(() => compileService("prod", fixture(app(8080)))).not.toThrow();
    const root = meshFixture({ services: { a: { path: "a", publish: ["app.endpoints.http"] }, b: { path: "b", publish: ["app.endpoints.http"] } } }, { a: app(8080), b: app(8080) });
    expect(() => compileMesh("prod", root)).toThrow(/8080/);
  });
  it("PUB-018 reserves fixed port before AUTO regardless of source order", () => {
    const root = meshFixture({ services: { z: { path: "z", publish: ["app.endpoints.http"] }, a: { path: "a", publish: ["app.endpoints.http"] } } }, { z: app(60000), a: app("AUTO") });
    const result = compileMesh("prod", root);
    expect(result.endpoints.app.a?.http?.publicPort).not.toBe(60000);
    expect(result.endpoints.app.z?.http?.publicPort).toBe(60000);
  });
  it("PUB-019 reuses cached AUTO port while available", () => {
    const root = single(["app.endpoints.http"]);
    const first = compileMeshComposition("prod", root).endpoints.app.api?.http?.publicPort;
    const second = compileMeshComposition("prod", root).endpoints.app.api?.http?.publicPort;
    expect(first).toBe(second); expect(existsSync(path.join(root, ".builder", "ports.json")) || existsSync(path.join(root, ".builder"))).toBe(true);
  });
  it("PUB-020 reallocates unavailable cached port", async () => {
    const root = single(["app.endpoints.http"]), first = compileMeshComposition("prod", root).endpoints.app.api?.http?.publicPort!;
    const server = net.createServer(); await new Promise<void>(resolve => server.listen(first, "127.0.0.1", resolve));
    try { const second = compileMeshComposition("prod", root).endpoints.app.api?.http?.publicPort; expect(second).not.toBe(first); expect(second).toBeGreaterThan(0); }
    finally { await new Promise<void>(resolve => server.close(() => resolve())); }
  });
  it("PUB-021 survives deletion of allocation cache", () => {
    const root = single(["app.endpoints.http"]); compileMeshComposition("prod", root);
    rmSync(path.join(root, ".builder"), { recursive: true, force: true });
    expect(compileMeshComposition("prod", root).endpoints.app.api?.http?.publicPort).toBeGreaterThan(0);
  });
  it("PUB-022 allocates AUTO by alphabetical mesh service", () => {
    const root = meshFixture({ services: { zeta: { path: "zeta", publish: ["app.endpoints.http"] }, alpha: { path: "alpha", publish: ["app.endpoints.http"] }, middle: { path: "middle", publish: ["app.endpoints.http"] } } }, { zeta: app(), alpha: app(), middle: app() });
    const eps = compileMesh("prod", root).endpoints.app;
    expect([eps.alpha?.http?.publicPort, eps.middle?.http?.publicPort, eps.zeta?.http?.publicPort]).toEqual([60000, 59999, 59998]);
  });
  it("PUB-023 allocates app endpoints before local dependency endpoints", () => {
    const root = meshFixture({ services: { api: { path: "api", publish: ["dependencies.db.endpoints.api", "app.endpoints.http"] } } }, { api: { app: { endpoints: { http: http(3000, { publicPort: "AUTO" }) } }, dependencies: { db: dep("d.yml", "owner", 6379, { publicPort: "AUTO" }) } } }, { "api/d.yml": ownerBundle() });
    const result = compileMesh("prod", root);
    expect(result.endpoints.app.api?.http?.publicPort).toBe(60000);
    expect(result.endpoints.dependencies.api?.db?.api?.publicPort).toBe(59999);
  });
  it("PUB-024 allocates dependencies alphabetically within service", () => {
    const names = ["z-cache", "a-db", "m-mail"];
    const root = meshFixture({ services: { api: { path: "api", publish: names.map(n => `dependencies.${n}.endpoints.api`) } } }, { api: { app: {}, dependencies: Object.fromEntries(names.map(n => [n, dep(`${n}.yml`, "owner", 1, { publicPort: "AUTO" })])) } }, Object.fromEntries(names.map(n => [`api/${n}.yml`, ownerBundle()])));
    const eps = compileMesh("prod", root).endpoints.dependencies.api;
    expect(names.sort().map(n => eps?.[n]?.api?.publicPort)).toEqual([60000, 59999, 59998]);
  });
  it("PUB-025 allocates endpoints alphabetically within dependency", () => {
    const names = ["z-ui", "a-admin", "m-metrics"];
    const endpoints = Object.fromEntries(names.map((n, i) => [n, { service: "owner", port: i + 1, primary: i === 0, publicPort: "AUTO" }]));
    const root = meshFixture({ services: { api: { path: "api", publish: names.map(n => `dependencies.db.endpoints.${n}`) } } }, { api: { app: {}, dependencies: { db: { compose: "d.yml", endpoints } } } }, { "api/d.yml": ownerBundle() });
    const eps = compileMesh("prod", root).endpoints.dependencies.api?.db;
    expect([...names].sort().map(n => eps?.[n]?.publicPort)).toEqual([60000, 59999, 59998]);
  });
  it("PUB-026 leaves unpublished AUTO endpoint unallocated", () => {
    const ep = published(single()); expect(ep?.publicPort).toBeUndefined(); expect(ep?.effectivelyPublished).toBe(false);
  });
  it("PUB-027 resolves public_url after effective publication", () => {
    const root = meshFixture({ services: { api: { path: "api", publish: ["app.endpoints.http"], env: { URL: "${api.app.endpoints.http.public_url}" } } } }, { api: app() });
    const result = compileMesh("prod", root);
    expect(env(result.compose.services.api).URL).toBe(`http://127.0.0.1:${result.endpoints.app.api?.http?.publicPort}`);
  });
  it("PUB-028 exposes exactly loopback public host", () => {
    const root = meshFixture({ services: { api: { path: "api", publish: ["app.endpoints.http"], env: { HOST: "${api.app.endpoints.http.public_host}", ADDRESS: "${api.app.endpoints.http.public_address}" } } } }, { api: app() });
    expect(env(compileMesh("prod", root).compose.services.api)).toMatchObject({ HOST: "127.0.0.1", ADDRESS: "127.0.0.1:60000" });
  });
  it("PUB-029 activates stage-added publicPort with matching stage publish", () => {
    const root = meshFixture({ services: { api: { path: "api" } }, e2e: { services: { api: { publish: ["app.endpoints.http"] } } }, tester: { compose: "t.yml", service: "runner" } }, { api: { app: { endpoints: { http: http(3000, { publicPort: undefined }) } }, e2e: { app: { endpoints: { http: { publicPort: "AUTO" } } } } } }, { "t.yml": { services: { runner: { image: "alpine" } } } });
    expect(compileMesh("prod", root).compose.services.api?.ports).toBeUndefined();
    expect(compileMesh("e2e", root).endpoints.app.api?.http?.publicPort).toBeGreaterThan(0);
  });
  it("PUB-030 names both nested logical owners in collision diagnostic", () => {
    const root = meshFixture({ services: { gateway: { path: "gateway", publish: ["app.endpoints.http"] }, orders: { path: "orders", publish: ["dependencies.db.endpoints.api"] } } }, { gateway: app(34000), orders: local(34000) }, { "orders/d.yml": ownerBundle() });
    let message = ""; try { compileMesh("prod", root); } catch (e) { message = String(e); }
    expect(message).toContain("gateway.app.endpoints.http"); expect(message).toContain("orders.dependencies.db.endpoints.api"); expect(message).toContain("34000");
  });
});

it("AUDIT-B01 allocates AUTO app then dependencies within each mesh service", () => {
  const root = meshFixture(
    {
      services: {
        a: { path: "a", publish: ["app.endpoints.http", "dependencies.db.endpoints.api"] },
        b: { path: "b", publish: ["app.endpoints.http", "dependencies.db.endpoints.api"] },
      },
    },
    {
      a: { app: { endpoints: { http: http(3000, { publicPort: "AUTO" }) } }, dependencies: { db: dep("d.yml", "owner", 6379, { publicPort: "AUTO" }) } },
      b: { app: { endpoints: { http: http(3000, { publicPort: "AUTO" }) } }, dependencies: { db: dep("d.yml", "owner", 6379, { publicPort: "AUTO" }) } },
    },
    { "a/d.yml": ownerBundle(), "b/d.yml": ownerBundle() },
  );
  const result = compileMesh("prod", root);
  expect(result.endpoints.app.a?.http?.publicPort).toBe(60000);
  expect(result.endpoints.dependencies.a?.db?.api?.publicPort).toBe(59999);
  expect(result.endpoints.app.b?.http?.publicPort).toBe(59998);
  expect(result.endpoints.dependencies.b?.db?.api?.publicPort).toBe(59997);
});
