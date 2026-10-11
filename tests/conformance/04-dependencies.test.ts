import { afterEach, describe, expect, it } from "vitest";
import { namespaceDependencyCompose } from "../../src/core/composition/namespaceDependencyCompose.js";
import { cleanupFixtures, compileMesh, compileService, dep, env, fixture, http, meshFixture, ownerBundle, write } from "./fixture.js";

afterEach(cleanupFixtures);
const healthy = { image: "alpine", healthcheck: { test: ["CMD", "true"] } };
const bundle = (extra: Record<string, unknown> = {}) => ({ services: { owner: healthy, helper: { image: "alpine" } }, ...extra });
const standalone = (config: Record<string, unknown> = dep(), document: object = bundle()) => fixture({ app: {}, dependencies: { db: config } }, { "dependency.yml": document });
const services = (root: string, stage: "dev" | "prod" | "e2e" = "prod", full = false) => compileService(stage, root, full).compose.services;
const owner = (root: string) => compileService("prod", root).endpoints.dependencies.db?.api?.networkHost;
function bound(extra: object = {}) {
  return meshFixture({ services: { consumer: { path: "consumer", dependencies: { db: "provider" } }, provider: { path: "provider" } } }, {
    consumer: { app: { env: { URL: "${dependencies.db.endpoints.api.network_url}" } }, dependencies: { db: dep("dependency.yml", "owner", 6379) } },
    provider: { app: { endpoints: { api: http(8080) } } },
  }, { "consumer/dependency.yml": { services: { owner: healthy, helper: { image: "alpine" } }, ...extra } });
}

describe("catalog 04: atomic dependency Compose and namespacing", () => {
  it("DEP-001 keeps endpoint-less dependency inert with no resources or edges", () => {
    const root = standalone({ compose: "dependency.yml" }, bundle({ volumes: { data: {} } }));
    const result = compileService("prod", root);
    expect(Object.keys(result.compose.services)).toEqual(["app"]);
    expect(result.compose.volumes).toBeUndefined();
    expect(result.compose.services.app?.depends_on).toEqual({});
  });
  it("DEP-002 treats explicit empty endpoints as inert in dev full and prod", () => {
    const root = standalone({ compose: "dependency.yml", endpoints: {} }, bundle({ volumes: { data: {} } }));
    for (const result of [compileService("prod", root), compileService("dev", root, true)]) {
      expect(Object.keys(result.compose.services)).toEqual(["app"]);
      expect(result.compose.volumes).toBeUndefined();
    }
  });
  it("DEP-003 materializes owner and healthy app edge", () => {
    const root = standalone(); const result = compileService("prod", root);
    const host = result.endpoints.dependencies.db?.api?.networkHost;
    expect(result.compose.services[host!]).toBeDefined();
    expect(result.endpoints.dependencies.db?.api?.networkPort).toBe(6379);
    expect((result.compose.services.app?.depends_on as any)[host!]).toEqual({ condition: "service_healthy" });
  });
  it("DEP-004 materializes every companion but gates app only on owner", () => {
    const root = standalone(dep(), { services: { owner: { ...healthy, depends_on: { helper: { condition: "service_started" } } }, helper: { image: "alpine" }, seed: { image: "alpine" } } });
    const result = compileService("prod", root);
    expect(Object.keys(result.compose.services).filter(x => x !== "app")).toHaveLength(3);
    expect(Object.keys(result.compose.services.app?.depends_on as object)).toEqual([result.endpoints.dependencies.db?.api?.networkHost]);
    expect((result.compose.services[owner(root)!]?.depends_on as any)["dep--db--helper"]).toEqual({ condition: "service_started" });
  });
  it("DEP-005 resolves two owners independently and gates on both", () => {
    const root = standalone({ compose: "dependency.yml", endpoints: { api: { service: "owner", port: 3000, primary: true }, metrics: { service: "metrics", port: 9000 } } }, { services: { owner: healthy, metrics: healthy, init: { image: "alpine" } } });
    const result = compileService("prod", root), eps = result.endpoints.dependencies.db!;
    expect(eps.api?.networkHost).not.toBe(eps.metrics?.networkHost);
    expect(Object.keys(result.compose.services.app?.depends_on as object)).toHaveLength(2);
    expect(result.compose.services).toHaveProperty("dep--db--init");
  });
  it("DEP-006 overlays dependency env onto every bundle service only", () => {
    const root = standalone({ ...dep(), env: { GCLOUD_PROJECT: "demo" } }, { services: { owner: { ...healthy, environment: { EXISTING: "yes" } }, helper: { image: "alpine" } } });
    const result = compileService("prod", root);
    expect(env(result.compose.services.app).GCLOUD_PROJECT).toBeUndefined();
    for (const [name, service] of Object.entries(result.compose.services)) if (name !== "app") expect(env(service).GCLOUD_PROJECT).toBe("demo");
    expect(env(result.compose.services[owner(root)!]).EXISTING).toBe("yes");
  });
  it("DEP-007 overlays stage dependency env module-wide", () => {
    const root = fixture({ app: {}, dependencies: { db: { ...dep(), env: { A: "base", B: "base" } } }, e2e: { dependencies: { db: { env: { B: "stage", C: "stage" } } } } }, { "dependency.yml": bundle() });
    const result = compileService("e2e", root);
    for (const [name, service] of Object.entries(result.compose.services)) if (name.startsWith("dep--")) expect(env(service)).toMatchObject({ A: "base", B: "stage", C: "stage" });
  });
  it("DEP-008 accepts image-backed owner and helper", () => {
    const root = standalone(dep(), { services: { owner: { image: "redis:7-alpine", healthcheck: healthy.healthcheck }, helper: { image: "alpine:3" } } });
    const result = compileService("prod", root);
    expect(result.compose.services[owner(root)!]?.image).toBe("redis:7-alpine");
    expect(result.compose.services).toHaveProperty("dep--db--helper");
  });
  it("DEP-009 rebases a dependency build context", () => {
    const root = standalone(dep(), { services: { owner: { build: "./mock-api", healthcheck: healthy.healthcheck } } });
    const result = compileService("prod", root);
    expect(String(result.compose.services[owner(root)!]?.build)).toContain("mock-api");
  });
  it("DEP-010 namespaces volume identity while keeping shared internal mount", () => {
    const document: any = { services: { owner: { ...healthy, volumes: ["data:/data"] }, backup: { image: "alpine", volumes: ["data:/backup"] } }, volumes: { data: {} } };
    const a = namespaceDependencyCompose({ dependencyKey: "a", namespacePrefix: "a", document });
    const b = namespaceDependencyCompose({ dependencyKey: "b", namespacePrefix: "b", document });
    expect(Object.keys(a.document.volumes!)).not.toEqual(Object.keys(b.document.volumes!));
    expect((a.document.services["a--owner"]?.volumes as string[])[0]).toContain("a--volume--data");
    expect((a.document.services["a--backup"]?.volumes as string[])[0]).toContain("a--volume--data");
  });
  it("DEP-011 namespaces config resources and service references", () => {
    const doc: any = { services: { owner: { ...healthy, configs: ["nginx-conf"] } }, configs: { "nginx-conf": { file: "./nginx.conf" } } };
    const a = namespaceDependencyCompose({ dependencyKey: "a", namespacePrefix: "a", document: doc }).document;
    expect(a.configs).toHaveProperty("a--config--nginx-conf");
    expect(a.services["a--owner"]?.configs).toContain("a--config--nginx-conf");
  });
  it("DEP-012 namespaces Compose-owned secrets", () => {
    const doc: any = { services: { owner: { ...healthy, secrets: ["password"] } }, secrets: { password: { file: "./pw" } } };
    const a = namespaceDependencyCompose({ dependencyKey: "a", namespacePrefix: "a", document: doc }).document;
    expect(a.secrets).toHaveProperty("a--secret--password");
    expect(a.services["a--owner"]?.secrets).toContain("a--secret--password");
  });
  it("DEP-013 namespaces internal networks and preserves peer attachment", () => {
    const doc: any = { services: { owner: { ...healthy, networks: ["backplane"] }, worker: { image: "alpine", networks: ["backplane"] } }, networks: { backplane: { internal: true } } };
    const a = namespaceDependencyCompose({ dependencyKey: "a", namespacePrefix: "a", document: doc }).document;
    expect(a.networks).toHaveProperty("a--network--backplane");
    expect(a.services["a--owner"]?.networks).toContain("a--network--backplane");
    expect(a.services["a--worker"]?.networks).toContain("a--network--backplane");
  });
  it("DEP-014 rewrites internal depends_on while preserving condition", () => {
    const root = standalone(dep(), { services: { owner: { ...healthy, depends_on: { helper: { condition: "service_completed_successfully" } } }, helper: { image: "alpine" } } });
    const result = compileService("prod", root);
    expect((result.compose.services[owner(root)!]?.depends_on as any)["dep--db--helper"]).toEqual({ condition: "service_completed_successfully" });
  });
  it("DEP-015 rewrites internal links to local peer", () => {
    const root = standalone(dep(), { services: { owner: { ...healthy, links: ["helper:alias"] }, helper: { image: "alpine" } } });
    expect(services(root)[owner(root)!]?.links).toContain("dep--db--helper:alias");
  });
  it("DEP-016 scopes network_mode service references", () => {
    const root = standalone(dep(), { services: { owner: healthy, sidecar: { image: "alpine", network_mode: "service:owner" } } });
    expect(services(root)["dep--db--sidecar"]?.network_mode).toBe("service:dep--db--owner");
  });
  it("DEP-017 scopes volumes_from references with options", () => {
    const root = standalone(dep(), { services: { owner: healthy, debug: { image: "alpine", volumes_from: ["owner:ro"] } } });
    expect(services(root)["dep--db--debug"]?.volumes_from).toContain("dep--db--owner:ro");
  });
  it("DEP-018 isolates equal raw service names in two dependencies", () => {
    const root = fixture({ app: {}, dependencies: { a: dep("a.yml"), b: dep("b.yml") } }, { "a.yml": bundle(), "b.yml": bundle() });
    const result = compileService("prod", root);
    expect(Object.keys(result.compose.services).filter(x => x.endsWith("--owner"))).toHaveLength(2);
    expect(result.endpoints.dependencies.a?.api?.networkHost).not.toBe(result.endpoints.dependencies.b?.api?.networkHost);
  });
  it("DEP-019 isolates identical local bundles across mesh consumers", () => {
    const root = meshFixture({ services: { a: { path: "a" }, b: { path: "b" } } }, { a: { app: {}, dependencies: { db: dep("d.yml") } }, b: { app: {}, dependencies: { db: dep("d.yml") } } }, { "a/d.yml": bundle({ volumes: { data: {} } }), "b/d.yml": bundle({ volumes: { data: {} } }) });
    const result = compileMesh("prod", root);
    expect(result.endpoints.dependencies.a?.db?.api?.networkHost).not.toBe(result.endpoints.dependencies.b?.db?.api?.networkHost);
    expect(Object.keys(result.compose.volumes!)).toHaveLength(2);
  });
  it("DEP-020 resolves through logical path regardless of generated owner name", () => {
    const root = fixture({ app: { env: { HOST: "${dependencies.db.endpoints.api.network_host}" } }, dependencies: { db: dep() } }, { "dependency.yml": bundle() });
    const result = compileService("prod", root);
    expect(env(result.compose.services.app).HOST).toBe(result.endpoints.dependencies.db?.api?.networkHost);
  });
  it("DEP-021 rejects raw dependency ports", () => {
    const root = standalone(dep(), { services: { owner: { ...healthy, ports: ["6379:6379"] } } });
    expect(() => compileService("prod", root)).toThrow(/services.owner.ports/);
  });
  it("DEP-022 rejects host networking", () => expect(() => compileService("prod", standalone(dep(), { services: { owner: { ...healthy, network_mode: "host" } } }))).toThrow(/network_mode/));
  it("DEP-023 rejects privileged companion", () => expect(() => compileService("prod", standalone(dep(), { services: { owner: healthy, helper: { image: "alpine", privileged: true } } }))).toThrow(/privileged/));
  it("DEP-024 rejects fixed container_name", () => expect(() => compileService("prod", standalone(dep(), { services: { owner: { ...healthy, container_name: "global-owner" } } }))).toThrow(/container_name/));
  it("DEP-025 rejects host root bind without rejecting ordinary bind", () => {
    expect(() => compileService("prod", standalone(dep(), { services: { owner: { ...healthy, volumes: ["/:/host"] } } }))).toThrow(/root bind/);
    expect(() => compileService("prod", standalone(dep(), { services: { owner: { ...healthy, volumes: ["./data:/data"] } } }))).not.toThrow();
  });
  it("DEP-026 rejects missing exact endpoint owner", () => expect(() => compileService("prod", standalone(dep("dependency.yml", "firebase-ui"), { services: { "firebase-emulator": healthy } }))).toThrow(/firebase-ui/));
  it("DEP-027 maps many endpoints to one service and one readiness edge", () => {
    const root = standalone({ compose: "dependency.yml", endpoints: { firestore: { service: "owner", port: 8080, primary: true }, auth: { service: "owner", port: 9099 }, storage: { service: "owner", port: 9199 } } }, { services: { owner: healthy } });
    const result = compileService("prod", root);
    expect(new Set(Object.values(result.endpoints.dependencies.db!).map(x => x.networkHost)).size).toBe(1);
    expect(Object.keys(result.compose.services.app?.depends_on as object)).toHaveLength(1);
  });
  it("DEP-028 makes both owners readiness targets regardless of primary", () => {
    const root = standalone({ compose: "dependency.yml", endpoints: { api: { service: "owner", port: 1, primary: true }, metrics: { service: "metrics", port: 2 } } }, { services: { owner: healthy, metrics: healthy } });
    expect(Object.keys(services(root).app?.depends_on as object)).toHaveLength(2);
  });
  it("DEP-029 requires health only from endpoint owners", () => {
    const root = standalone(dep(), bundle());
    expect(() => compileService("prod", root)).not.toThrow();
    expect(services(root)["dep--db--helper"]?.healthcheck).toBeUndefined();
  });
  it("DEP-030 swaps complete stage dependency implementation", () => {
    const root = fixture({ app: {}, dependencies: { db: dep("a.yml") }, e2e: { dependencies: { db: { compose: "b.yml" } } } }, { "a.yml": { services: { owner: healthy, a: { image: "alpine" } }, volumes: { a: {} } }, "b.yml": { services: { owner: healthy, b: { image: "alpine" } }, volumes: { b: {} } } });
    expect(services(root)).toHaveProperty("dep--db--a");
    const result = compileService("e2e", root);
    expect(result.compose.services).toHaveProperty("dep--db--b");
    expect(result.compose.services).not.toHaveProperty("dep--db--a");
    expect(result.compose.volumes).toHaveProperty("dep--db--volume--b");
  });
  it("DEP-031 suppresses every local service on substitution", () => {
    const root = bound();
    const result = compileMesh("prod", root);
    expect(Object.keys(result.compose.services)).toEqual(["consumer", "provider"]);
    expect(env(result.compose.services.consumer).URL).toBe("http://provider:8080");
    expect((result.compose.services.consumer?.depends_on as any).provider).toEqual({ condition: "service_healthy" });
  });
  it("DEP-032 suppresses local volume on substitution", () => {
    const root = bound({ volumes: { data: {} } });
    expect(compileMesh("prod", root).compose.volumes).toBeUndefined();
  });
  it("DEP-033 suppresses local config, secret and network on substitution", () => {
    const root = bound({ configs: { c: { file: "./c" } }, secrets: { s: { file: "./s" } }, networks: { private: {} } });
    const result = compileMesh("prod", root);
    expect(result.compose.configs).toBeUndefined(); expect(result.compose.secrets).toBeUndefined();
    expect(Object.keys(result.compose.networks!)).toEqual(["mesh"]);
  });
  it("DEP-034 leaves other local dependency intact after one substitution", () => {
    const root = bound();
    write(root, "consumer/build.json", { app: { env: { URL: "${dependencies.db.endpoints.api.network_url}" } }, dependencies: { db: dep("dependency.yml"), cache: dep("cache.yml") } });
    write(root, "consumer/cache.yml", bundle());
    const result = compileMesh("prod", root);
    expect(Object.keys(result.compose.services).some(x => x.includes("dep--cache--owner"))).toBe(true);
    expect(Object.keys(result.compose.services).some(x => x.includes("dep--db--owner"))).toBe(false);
  });
  it("DEP-035 refuses publication of inert dependency", () => {
    const root = meshFixture({ services: { api: { path: "api", publish: ["dependencies.tools.endpoints.ui"] } } }, { api: { app: {}, dependencies: { tools: { compose: "d.yml" } } } }, { "api/d.yml": bundle() });
    expect(() => compileMesh("prod", root)).toThrow(/tools|ui/);
  });
  it("DEP-036 does not materialize inert dependsOn target", () => {
    const root = fixture({ app: {}, dependencies: { seed: { compose: "dependency.yml" }, worker: { ...dep(), dependsOn: ["dependencies.seed"] } } }, { "dependency.yml": bundle() });
    expect(() => compileService("prod", root)).toThrow(/inert/);
  });
  it("DEP-037 activates inert dependency through stage endpoint", () => {
    const root = fixture({ app: {}, dependencies: { db: { compose: "dependency.yml" } }, dev: { dependencies: { db: { endpoints: { api: { service: "owner", port: 6379, primary: true } } } } } }, { "dependency.yml": bundle() });
    expect(Object.keys(services(root))).toEqual(["app"]);
    expect(services(root, "dev", true)).toHaveProperty("dep--db--owner");
  });
  it("DEP-038 changes effective endpoint owner by stage", () => {
    const root = fixture({ app: {}, dependencies: { db: dep("dependency.yml", "owner") }, e2e: { dependencies: { db: { endpoints: { api: { service: "wiremock" } } } } } }, { "dependency.yml": { services: { owner: healthy, wiremock: healthy } } });
    expect(compileService("prod", root).endpoints.dependencies.db?.api?.networkHost).toContain("owner");
    expect(compileService("e2e", root).endpoints.dependencies.db?.api?.networkHost).toContain("wiremock");
  });
  it("DEP-039 publishes only declared endpoint owner port", () => {
    const root = standalone(dep("dependency.yml", "owner", 7000, { publicPort: "AUTO" }), bundle());
    const result = compileService("prod", root);
    expect(result.compose.services[result.endpoints.dependencies.db?.api?.networkHost!]?.ports).toMatchObject([{ target: 7000 }]);
    expect(result.compose.services["dep--db--helper"]?.ports).toBeUndefined();
  });
  it("DEP-040 rejects broken internal reference before cross-wiring", () => {
    const root = fixture({ app: {}, dependencies: { db: dep("a.yml"), other: dep("b.yml", "missing-db") } }, { "a.yml": { services: { owner: { ...healthy, depends_on: ["missing-db"] } } }, "b.yml": { services: { "missing-db": healthy } } });
    expect(() => compileService("prod", root)).toThrow(/services.owner.depends_on.*missing-db/);
  });
  it("rejects every unresolved internal service reference form", () => {
    for (const invalid of [
      { depends_on: { missing: { condition: "service_started" } } },
      { links: ["missing:alias"] },
      { network_mode: "service:missing" },
      { volumes_from: ["missing:ro"] },
    ]) {
      const root = standalone(dep(), { services: { owner: { ...healthy, ...invalid } } });
      expect(() => compileService("prod", root)).toThrow(/missing/);
    }
  });
});
