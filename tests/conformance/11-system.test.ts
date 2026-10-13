import { runStep } from "../../src/core/checkers/runStep.js";
vi.mock("../../src/core/checkers/runStep.js",()=>({runStep:vi.fn()}));
import { afterEach, describe, expect, it, vi } from "vitest";
import { readFileSync, rmSync } from "node:fs";
import path from "node:path";
import { buildJsonSchema } from "../../src/core/buildSchema.js";
import { meshSchema } from "../../src/core/mesh/meshSchema.js";
import { compileMeshComposition } from "../../src/core/mesh/v2/compileMeshComposition.js";
import { checkDockerfileContract } from "../../src/core/checkers/checkDockerfileContract.js";
import { checkMesh } from "../../src/core/mesh/checkers/checkMesh.js";
import { getBuildJson } from "../../src/utils/getBuildJson.js";
import { cleanupFixtures, compileMesh, compileService, dep, env, fixture, http, meshFixture, ownerBundle, write } from "./fixture.js";

afterEach(cleanupFixtures);
const healthy = { image: "alpine", healthcheck: { test: ["CMD", "true"] } };
const tester = { compose: "t.yml", service: "runner", env: {} };
const testerFile = { "t.yml": { services: { runner: { image: "alpine", command: ["sh", "-c", "exit 0"] } } } };
const app = (port = 3000, publicPort: number | "AUTO" | undefined = undefined) => ({ app: { endpoints: { http: http(port, publicPort === undefined ? {} : { publicPort }) } } });
function canonicalService() {
  return fixture({ app: { endpoints: { http: http(3000, { publicPort: "AUTO" }), metrics: { port: 9000 } }, env: { BASE: "yes" } }, dependencies: { firebase: dep("firebase.yml"), redis: dep("redis.yml"), worker: { ...dep("worker.yml"), dependsOn: ["dependencies.redis"] } }, tester: { env: { APP_URL: "${app.endpoints.http.public_url}" } }, dev: { app: { env: { STAGE: "dev" } } }, prod: { app: { env: { STAGE: "prod" } } }, test: { app: { env: { STAGE: "test" } } }, e2e: { app: { env: { STAGE: "e2e" } }, dependencies: { mail: dep("mail.yml") } } }, { "firebase.yml": { services: { owner: healthy, helper: { image: "alpine" } } }, "redis.yml": ownerBundle(), "worker.yml": ownerBundle(), "mail.yml": ownerBundle() });
}
function canonicalMesh() {
  return meshFixture({ services: { backend: { path: "backend" }, frontend: { path: "frontend", dependencies: { backend: "backend" } }, gateway: { path: "gateway", dependsOn: ["frontend"], publish: ["app.endpoints.http"] } }, e2e: { services: { fake: { path: "fake" }, frontend: { dependencies: { backend: "fake" } } } }, tester: { ...tester, env: { URL: "${gateway.app.endpoints.http.public_url}" } } }, { backend: app(8080), frontend: { app: {}, dependencies: { backend: dep("d.yml") } }, gateway: app(3000, "AUTO"), fake: app(9090) }, { ...testerFile, "frontend/d.yml": ownerBundle() });
}

describe("catalog 11: cross-feature orchestration and regression", () => {
  it("SYS-001 compiles canonical rich service in all stages", () => {
    const root = canonicalService();
    for (const stage of ["dev", "prod", "test", "e2e"] as const) {
      const c = compileService(stage, root);
      expect(env(c.compose.services.app).STAGE).toBe(stage);
      expect(c.compose.services.app).toBeDefined();
      expect(Object.keys(c.compose.services).some(x => x.includes("dep--mail--"))).toBe(stage === "e2e");
      expect(Object.keys(c.compose.services).some(x => x.includes("dep--redis--"))).toBe(stage === "prod" || stage === "e2e");
    }
  });
  it("SYS-002 compiles canonical mesh dev, prod and E2E topologies", () => {
    const root = canonicalMesh();
    for (const stage of ["dev", "prod", "e2e"] as const) {
      const c = compileMesh(stage, root);
      expect(c.compose.services.gateway).toBeDefined(); expect(c.compose.services.frontend).toBeDefined();
      expect(env(c.compose.services.frontend).INFRA_MODE).toBe("integrated");
      expect(c.compose.services.fake !== undefined).toBe(stage === "e2e");
    }
  });
  it("SYS-003 namespaces repeated service/resource names across twelve consumers", () => {
    const names = Array.from({ length: 12 }, (_, i) => `service-${i}`);
    const root = meshFixture({ services: Object.fromEntries(names.map(n => [n, { path: n }])) }, Object.fromEntries(names.map(n => [n, { app: {}, dependencies: { db: dep("d.yml", "db") } }])), Object.fromEntries(names.map(n => [`${n}/d.yml`, { services: { db: healthy, helper: { image: "alpine" } }, volumes: { data: {} }, configs: { config: { file: "./config.txt" } } }])));
    for (const name of names) write(root, `${name}/config.txt`, "present");
    const c = compileMesh("prod", root);
    expect(Object.keys(c.compose.services)).toHaveLength(36);
    expect(Object.keys(c.compose.volumes!)).toHaveLength(12);
    expect(Object.keys(c.compose.configs!)).toHaveLength(12);
    expect(new Set(names.map(n => c.endpoints.dependencies[n]?.db?.api?.networkHost)).size).toBe(12);
  });
  it("SYS-004 compiles twenty-node acyclic substitution DAG", () => {
    const names = Array.from({ length: 20 }, (_, i) => `node-${i}`);
    const services = Object.fromEntries(names.map((n, i) => [n, { path: n, ...(i ? { dependencies: { prev: names[i - 1] } } : {}) }]));
    const builds = Object.fromEntries(names.map((n, i) => [n, { ...app(3000 + i), ...(i ? { dependencies: { prev: dep("d.yml") } } : {}) }]));
    const files = Object.fromEntries(names.slice(1).map(n => [`${n}/d.yml`, ownerBundle()]));
    const c = compileMesh("prod", meshFixture({ services }, builds, files));
    expect(Object.keys(c.compose.services)).toHaveLength(20);
    for (let i = 1; i < names.length; i++) expect((c.compose.services[names[i]!]!.depends_on as any)[names[i - 1]!]).toEqual({ condition: "service_healthy" });
  });
  it("SYS-005 detects a cycle added to a mixed mesh graph", () => {
    const root = canonicalMesh();
    write(root, "mesh.json", { services: { backend: { path: "backend", dependsOn: ["gateway"] }, frontend: { path: "frontend", dependencies: { backend: "backend" } }, gateway: { path: "gateway", dependsOn: ["frontend"] } } });
    expect(() => compileMesh("prod", root)).toThrow(/cycle/i);
  });
  it("SYS-006 resolves all eight properties for app and dependency", () => {
    const properties = ["network_host", "network_port", "network_address", "network_url", "public_host", "public_port", "public_address", "public_url"];
    const appEnv = Object.fromEntries(properties.map(p => [`APP_${p}`, `\${app.endpoints.http.${p}}`]));
    const dbEnv = Object.fromEntries(properties.map(p => [`DB_${p}`, `\${dependencies.db.endpoints.api.${p}}`]));
    const root = fixture({ app: { endpoints: { http: http(3000, { publicPort: 31806 }) }, env: { ...appEnv, ...dbEnv } }, dependencies: { db: dep("d.yml", "owner", 6379, { publicPort: 31807 }) } }, { "d.yml": ownerBundle() });
    const values = env(compileService("prod", root).compose.services.app);
    expect(values.APP_network_port).toBe("3000"); expect(values.APP_public_url).toBe("http://127.0.0.1:31806"); expect(values.DB_network_port).toBe("6379"); expect(values.DB_public_url).toBe("http://127.0.0.1:31807");
  });
  it("SYS-007 keeps fixed and AUTO allocation stable under JSON reorder", () => {
    const x = { services: { b: { path: "b", publish: ["app.endpoints.http"] }, a: { path: "a", publish: ["app.endpoints.http"] } } };
    const y = { services: { a: { path: "a", publish: ["app.endpoints.http"] }, b: { path: "b", publish: ["app.endpoints.http"] } } };
    const builds = { a: app(3000, "AUTO"), b: app(4000, 31808) };
    const a = compileMesh("prod", meshFixture(x, builds)), b = compileMesh("prod", meshFixture(y, builds));
    expect(a.endpoints.app.a?.http?.publicPort).toBe(b.endpoints.app.a?.http?.publicPort);
    expect(a.endpoints.app.b?.http?.publicPort).toBe(31808);
  });
  it("SYS-008 compiles equivalent configuration deterministically", () => {
    const root = canonicalMesh(), a = compileMesh("prod", root), b = compileMesh("prod", root);
    expect(a.compose).toEqual(b.compose); expect(a.endpoints).toEqual(b.endpoints);
  });
  it("SYS-009 fails invalid configurations before producing composition", () => {
    const configs = [
      { app: { endpoints: { http: http() }, env: { X: "${app.endpoints.missing.network_host}" } } },
      { app: {}, dependencies: { db: dep("../bad.yml") } },
      { app: {}, dependencies: { db: { ...dep("d.yml"), dependsOn: ["dependencies.db"] } } },
    ];
    for (const config of configs) expect(() => compileService("prod", fixture(config, { "d.yml": ownerBundle() }))).toThrow();
  });
  it("SYS-016 preserves one logical dependency expression across local and provider modes", () => {
    const consumer = { app: { env: { URL: "${dependencies.backend.endpoints.api.network_url}" } }, dependencies: { backend: dep("d.yml", "owner", 3000) } };
    const localRoot = fixture(consumer, { "d.yml": ownerBundle() });
    const meshRoot = meshFixture({ services: { consumer: { path: "consumer", dependencies: { backend: "backend" } }, backend: { path: "backend" } } }, { consumer, backend: { app: { endpoints: { api: http(8080) } } } }, { "consumer/d.yml": ownerBundle() });
    expect(env(compileService("prod", localRoot).compose.services.app).URL).toMatch(/^http:\/\/.*owner:3000$/);
    expect(env(compileMesh("prod", meshRoot).compose.services.consumer).URL).toBe("http://backend:8080");
  });
  it("SYS-017 rejects dependency host-port bypass inside mesh", () => {
    const root = canonicalMesh(); write(root, "frontend/d.yml", { services: { owner: { ...healthy, ports: ["3000:3000"] } } });
    expect(() => compileMesh("prod", root)).toThrow(/ports/);
  });
  it("SYS-018 propagates Dockerfile EXPOSE contract rejection through mesh checks", () => {
    const root = canonicalMesh(), valid = readFileSync(path.resolve("tests/fixtures/v2/service-basic/Dockerfile"), "utf8");
    write(root, "backend/Dockerfile", valid);
    expect(() => checkDockerfileContract(getBuildJson(`${root}/backend`), `${root}/backend`)).not.toThrow();
    write(root, "backend/Dockerfile", `${valid}\nEXPOSE 3000\n`);
    vi.mocked(runStep).mockImplementation((_exe,_args,_root,ctx)=>{if(ctx.stepName === "Dockerfile Contract") throw new Error("Dockerfile contract: EXPOSE forbidden");});
    expect(() => checkMesh(root)).toThrow(/Dockerfile|EXPOSE|contract/i);
    vi.mocked(runStep).mockReset();
  });
  it("SYS-019 uses healthy condition on every Builder lifecycle edge", () => {
    const c = compileMesh("e2e", canonicalMesh());
    for (const [name, service] of Object.entries(c.compose.services)) {
      const edges = service.depends_on as Record<string, { condition: string }> | undefined;
      if (edges && !name.includes("dep--")) for (const edge of Object.values(edges)) expect(edge.condition).toBe("service_healthy");
    }
  });
  it("SYS-020 env references leave mesh lifecycle graph unchanged", () => {
    const root = canonicalMesh(), before = compileMesh("prod", root);
    write(root, "mesh.json", { services: { backend: { path: "backend" }, frontend: { path: "frontend", dependencies: { backend: "backend" }, env: { X: "${backend.app.endpoints.http.network_url}" } }, gateway: { path: "gateway", dependsOn: ["frontend"], publish: ["app.endpoints.http"] } }, tester: { ...tester, env: { URL: "${gateway.app.endpoints.http.public_url}" } } });
    const after = compileMesh("prod", root);
    for (const name of ["backend", "frontend", "gateway"]) expect(after.compose.services[name]?.depends_on).toEqual(before.compose.services[name]?.depends_on);
  });
  it("SYS-021 lifecycle declaration does not invent env URL", () => {
    const root = meshFixture({ services: { a: { path: "a", dependsOn: ["b"] }, b: { path: "b" } } }, { a: { app: {} }, b: app() });
    const c = compileMesh("prod", root);
    expect((c.compose.services.a?.depends_on as any).b).toEqual({ condition: "service_healthy" });
    expect(env(c.compose.services.a)).toEqual({ EXEC_MODE: "prod", INFRA_MODE: "integrated" });
  });
  it("SYS-022 keeps stage sentinels isolated", () => {
    const root = fixture({ app: { env: { BASE: "yes" } }, dev: { app: { env: { DEV: "yes" } } }, prod: { app: { env: { PROD: "yes" } } }, test: { app: { env: { TEST: "yes" } } }, e2e: { app: { env: { E2E: "yes" } } } });
    for (const [stage, key] of [["dev", "DEV"], ["prod", "PROD"], ["test", "TEST"], ["e2e", "E2E"]] as const) {
      const values = env(compileService(stage, root).compose.services.app);
      expect(values.BASE).toBe("yes"); expect(values[key]).toBe("yes");
      const inherited = stage === "e2e" ? ["PROD", "E2E"] : [key];
      for (const other of ["DEV", "PROD", "TEST", "E2E"].filter(x => !inherited.includes(x))) expect(values[other]).toBeUndefined();
    }
  });
  it("SYS-023 rejects all documented legacy root and mesh fields", () => {
    for (const key of ["port", "envOverrides", "overrides", "composeFiles", "services", "policy", "policies", "injects", "sidecars"]) expect(buildJsonSchema.safeParse({ app: {}, [key]: {} }).success).toBe(false);
    for (const key of ["dependencies", "inherit-published", "secrets"]) expect(meshSchema.safeParse({ services: { api: { path: "api" } }, [key]: {} }).success).toBe(false);
  });
  it("SYS-024 reports nested active-stage failure with logical context", () => {
    const root = meshFixture({ services: { api: { path: "api" } }, e2e: { services: { api: { env: { BAD: "${api.app.endpoints.http.public_url}" } } } }, tester }, { api: app() }, testerFile);
    let message = ""; try { compileMesh("e2e", root); } catch (error) { message = String(error); }
    expect(message).toMatch(/api|mesh.json/); expect(message).toMatch(/e2e/); expect(message).toMatch(/public_url|publication/);
  });
  it("SYS-025 needs only logical user references in JSON", () => {
    const root = canonicalMesh(), c = compileMesh("e2e", root);
    expect(c.endpoints.app.gateway?.http?.networkHost).toBe("gateway");
    expect(env(c.compose.services[c.testerServiceName!]).URL).toMatch(/^http:\/\/127\.0\.0\.1:\d+$/);
  });
  it("SYS-026 allows public black-box references and rejects private ones", () => {
    const root = canonicalMesh(); expect(() => compileMesh("e2e", root)).not.toThrow();
    write(root, "mesh.json", { services: { gateway: { path: "gateway", publish: ["app.endpoints.http"] } }, tester: { ...tester, env: { URL: "${gateway.app.endpoints.http.network_url}" } } });
    expect(() => compileMesh("e2e", root)).toThrow(/public endpoint/);
  });
  it("SYS-027 preserves semantic graph after AUTO cache loss", () => {
    const root = canonicalMesh(), a = compileMeshComposition("prod", root);
    rmSync(path.join(root, ".builder"), { recursive: true, force: true });
    const b = compileMeshComposition("prod", root);
    expect(a.compose.services.frontend?.depends_on).toEqual(b.compose.services.frontend?.depends_on);
    expect(a.endpoints.app.gateway?.http?.effectivelyPublished).toBe(b.endpoints.app.gateway?.http?.effectivelyPublished);
  });
  it("SYS-028 points to both owners in large mesh port collision", () => {
    const names = Array.from({ length: 20 }, (_, i) => `service-${i}`);
    const root = meshFixture({ services: Object.fromEntries(names.map(n => [n, { path: n, publish: ["app.endpoints.http"] }])) }, Object.fromEntries(names.map((n, i) => [n, app(3000 + i, i === 2 || i === 18 ? 31828 : 32000 + i)])));
    let message = ""; try { compileMesh("prod", root); } catch (error) { message = String(error); }
    expect(message).toContain("service-2.app.endpoints.http"); expect(message).toContain("service-18.app.endpoints.http");
  });
  it("SYS-029 leaves no orphan resource from many substituted bundles", () => {
    const names = ["a", "b", "c", "d"];
    const root = meshFixture({ services: { provider: { path: "provider" }, ...Object.fromEntries(names.map(n => [n, { path: n, dependencies: { db: "provider" } }])) } }, { provider: { app: { endpoints: { api: http() } } }, ...Object.fromEntries(names.map(n => [n, { app: {}, dependencies: { db: dep("d.yml") } }])) }, Object.fromEntries(names.map(n => [`${n}/d.yml`, { services: { owner: healthy, helper: { image: "alpine" } }, volumes: { data: {} }, configs: { config: { file: "./config" } }, secrets: { secret: { file: "./secret" } }, networks: { private: {} } }])));
    const c = compileMesh("prod", root); expect(Object.keys(c.compose.services)).toHaveLength(5); expect(c.compose.volumes).toBeUndefined(); expect(c.compose.configs).toBeUndefined(); expect(c.compose.secrets).toBeUndefined();
  });
  it("SYS-030 keeps only gateway public while internal apps remain private", () => {
    const c = compileMesh("e2e", canonicalMesh());
    expect(c.compose.services.gateway?.ports).toHaveLength(1);
    expect(c.compose.services.backend?.ports).toBeUndefined(); expect(c.compose.services.frontend?.ports).toBeUndefined();
    expect(env(c.compose.services[c.testerServiceName!]).URL).toMatch(/^http:\/\/127\.0\.0\.1:\d+$/);
  });
});
