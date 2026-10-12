import { runMeshTestUnit } from "../../src/core/mesh/runners/runMeshTestUnit.js";
import { afterEach, describe, expect, it } from "vitest";
import { meshSchema } from "../../src/core/mesh/meshSchema.js";
import { resolveMeshStage } from "../../src/core/config/resolveMeshStage.js";
import { cleanupFixtures, compileMesh, compileService, dep, env, fixture, http, meshFixture, ownerBundle, write } from "./fixture.js";

afterEach(cleanupFixtures);
const tester = { compose: "t.yml", service: "runner" };
const testerFile = { "t.yml": { services: { runner: { image: "alpine" } } } };
const build = { app: { endpoints: { http: http() } } };
const one = (mesh: Record<string, unknown>, serviceBuild: Record<string, unknown> = build, files: Record<string, string | object> = {}) => meshFixture({ services: { api: { path: "api" } }, ...mesh }, { api: serviceBuild }, { ...testerFile, ...files });
const merged = (mesh: any, stage: "dev" | "prod" | "e2e") => resolveMeshStage(mesh, stage, "mesh.json");

describe("catalog 09: mesh overlays and environment precedence", () => {
  it("MEN-001 permits only services under mesh stage", () => {
    for (const stage of ["dev", "prod", "test", "e2e"]) for (const key of ["tester", "dependencies", "publish"]) expect(meshSchema.safeParse({ services: { api: { path: "api" } }, [stage]: { [key]: {} } }).success).toBe(false);
  });
  it("MEN-002 deep-merges stage service env", () => {
    const mesh: any = { services: { api: { path: "api", env: { A: "base", B: "base" } } }, dev: { services: { api: { env: { B: "dev", C: "dev" } } } } };
    expect(merged(mesh, "dev").services.api?.env).toEqual({ A: "base", B: "dev", C: "dev" });
  });
  it("MEN-003 adds top-level service only in active stage", () => {
    const root = meshFixture({ services: { api: { path: "api" } }, e2e: { services: { fake: { path: "fake" } } }, tester }, { api: build, fake: build }, testerFile);
    expect(compileMesh("prod", root).compose.services.fake).toBeUndefined();
    expect(compileMesh("e2e", root).compose.services.fake).toBeDefined();
  });
  it("MEN-004 replaces service path only in selected stage", () => {
    const root = meshFixture({ services: { api: { path: "api" } }, dev: { services: { api: { path: "replacement" } } } }, { api: { app: { env: { MARK: "base" } } }, replacement: { app: { env: { MARK: "dev" } } } });
    expect(env(compileMesh("dev", root).compose.services.api).MARK).toBe("dev");
    expect(env(compileMesh("prod", root).compose.services.api).MARK).toBe("base");
  });
  it("MEN-005 merges dependency binding map keywise", () => {
    const mesh: any = { services: { consumer: { path: "consumer", dependencies: { backend: "real", cache: "cache" } }, real: { path: "real" }, fake: { path: "fake" }, cache: { path: "cache" } }, e2e: { services: { consumer: { dependencies: { backend: "fake", payments: "fake" } } } } };
    expect(merged(mesh, "e2e").services.consumer?.dependencies).toEqual({ backend: "fake", cache: "cache", payments: "fake" });
  });
  it("MEN-006 replaces one provider binding scalar by stage", () => {
    const mesh: any = { services: { consumer: { path: "consumer", dependencies: { payments: "real" } }, real: { path: "real" }, fake: { path: "fake" } }, e2e: { services: { consumer: { dependencies: { payments: "fake" } } } } };
    expect(merged(mesh, "prod").services.consumer?.dependencies.payments).toBe("real");
    expect(merged(mesh, "e2e").services.consumer?.dependencies.payments).toBe("fake");
  });
  it("MEN-007 unions mesh dependsOn base-first", () => {
    const mesh: any = { services: { api: { path: "api", dependsOn: ["backend"] }, backend: { path: "backend" }, fake: { path: "fake" } }, e2e: { services: { api: { dependsOn: ["backend", "fake"] } } } };
    expect(merged(mesh, "e2e").services.api?.dependsOn).toEqual(["backend", "fake"]);
  });
  it("MEN-008 unions publish base-first", () => {
    const mesh: any = { services: { api: { path: "api", publish: ["app.endpoints.http"] } }, e2e: { services: { api: { publish: ["app.endpoints.http", "app.endpoints.metrics"] } } } };
    expect(merged(mesh, "e2e").services.api?.publish).toEqual(["app.endpoints.http", "app.endpoints.metrics"]);
  });
  it("MEN-009 retains omitted base services", () => {
    const mesh: any = { services: { api: { path: "api" }, frontend: { path: "frontend" }, gateway: { path: "gateway" } }, dev: { services: { api: { env: { X: "1" } } } } };
    expect(Object.keys(merged(mesh, "dev").services)).toEqual(["api", "frontend", "gateway"]);
  });
  it("MEN-010 fails stage-only service reference outside stage", () => {
    const root = meshFixture({ services: { api: { path: "api", env: { URL: "${fake.app.endpoints.http.network_url}" } } }, e2e: { services: { fake: { path: "fake" } } }, tester }, { api: { app: {} }, fake: build }, testerFile);
    expect(() => compileMesh("dev", root)).toThrow(/fake/);
    expect(env(compileMesh("e2e", root).compose.services.api).URL).toBe("http://fake:3000");
  });
  it("MEN-011 resolves stage-added dependsOn target after overlay", () => {
    const root = meshFixture({ services: { api: { path: "api" } }, e2e: { services: { fake: { path: "fake" }, api: { dependsOn: ["fake"] } } }, tester }, { api: build, fake: build }, testerFile);
    expect((compileMesh("e2e", root).compose.services.api?.depends_on as any).fake).toEqual({ condition: "service_healthy" });
  });
  it("MEN-012 resolves same-stage provider binding", () => {
    const root = meshFixture({ services: { consumer: { path: "consumer" } }, e2e: { services: { fake: { path: "fake" }, consumer: { dependencies: { db: "fake" } } } }, tester }, { consumer: { app: {}, dependencies: { db: dep("d.yml") } }, fake: { app: { endpoints: { api: http() } } } }, { ...testerFile, "consumer/d.yml": ownerBundle() });
    const result = compileMesh("e2e", root);
    expect((result.compose.services.consumer?.depends_on as any).fake).toEqual({ condition: "service_healthy" });
    expect(Object.keys(result.compose.services).some(x => x.includes("dep--db--"))).toBe(false);
  });
  it("MEN-013 has no stage removal syntax", () => {
    for (const value of [null, false, { _delete: true }]) expect(meshSchema.safeParse({ services: { api: { path: "api" } }, e2e: { services: { api: value } } }).success).toBe(false);
    expect(merged({ services: { api: { path: "api" } }, e2e: { services: {} } } as any, "e2e").services.api).toBeDefined();
  });
  it("MEN-014 gives build base env precedence over dotenv key", () => {
    const root = one({}, { app: { env: { VALUE: "base" } } }, { "api/.env.dev": "VALUE=dotenv\nONLY_DOTENV=yes\n" });
    const result = compileMesh("dev", root);
    expect(env(result.compose.services.api).VALUE).toBe("base");
    expect(result.compose.services.api?.env_file).toEqual([{ path: "api/.env.dev", required: false }]);
  });
  it("MEN-015 gives build stage env precedence over build base", () => {
    const root = one({}, { app: { env: { VALUE: "base", A: "base" } }, dev: { app: { env: { VALUE: "stage" } } } });
    expect(env(compileMesh("dev", root).compose.services.api)).toMatchObject({ VALUE: "stage", A: "base" });
  });
  it("MEN-016 gives override Compose env precedence over build stage", () => {
    const root = one({}, { app: { env: { VALUE: "base" } }, dev: { app: { env: { VALUE: "stage" } }, "override-compose": "o.yml" } }, { "api/o.yml": { services: { app: { environment: { VALUE: "override" } } } } });
    expect(env(compileMesh("dev", root).compose.services.api).VALUE).toBe("override");
  });
  it("MEN-017 gives mesh base env precedence over service override", () => {
    const root = meshFixture({ services: { api: { path: "api", env: { VALUE: "mesh-base" } } } }, { api: { app: {}, dev: { "override-compose": "o.yml" } } }, { "api/o.yml": { services: { app: { environment: { VALUE: "override" } } } } });
    expect(env(compileMesh("dev", root).compose.services.api).VALUE).toBe("mesh-base");
    expect(env(compileService("dev", `${root}/api`).compose.services.app).VALUE).toBe("override");
  });
  it("MEN-018 gives mesh stage env precedence over mesh base", () => {
    const root = one({ services: { api: { path: "api", env: { VALUE: "mesh-base", A: "base" } } }, dev: { services: { api: { env: { VALUE: "mesh-dev" } } } } });
    expect(env(compileMesh("dev", root).compose.services.api)).toMatchObject({ VALUE: "mesh-dev", A: "base" });
  });
  it("MEN-019 rejects Builder-owned env keys in every user layer", () => {
    for (const key of ["EXEC_MODE", "INFRA_MODE", "PORT"]) {
      const root = one({}, { app: { endpoints: { http: http() }, env: { [key]: "bad" } } });
      expect(() => compileMesh("dev", root)).toThrow(new RegExp(key));
      const meshRoot = one({ services: { api: { path: "api", env: { [key]: "bad" } } } });
      expect(() => compileMesh("dev", meshRoot)).toThrow(new RegExp(key));
    }
  });
  it("MEN-020 resolves all six normal env precedence layers", () => {
    const root = meshFixture({ services: { api: { path: "api", env: { VALUE: "mesh-base", MB: "yes" } } }, dev: { services: { api: { env: { VALUE: "mesh-stage", MS: "yes" } } } } }, { api: { app: { env: { VALUE: "build-base", BB: "yes" } }, dev: { app: { env: { VALUE: "build-stage", BS: "yes" } }, "override-compose": "o.yml" } } }, { "api/.env.dev": "VALUE=dotenv\nDOT=yes\n", "api/o.yml": { services: { app: { environment: { VALUE: "override", OV: "yes" } } } } });
    expect(env(compileMesh("dev", root).compose.services.api)).toMatchObject({ VALUE: "mesh-stage", BB: "yes", BS: "yes", OV: "yes", MB: "yes", MS: "yes" });
  });
  it("MEN-021 does not inject runtime env into Docker build args", () => {
    const root = one({}, { app: { env: { RUNTIME_ONLY: "secretish" } } });
    const service = compileMesh("prod", root).compose.services.api;
    expect(env(service).RUNTIME_ONLY).toBe("secretish"); expect((service?.build as any).args?.RUNTIME_ONLY).toBeUndefined();
  });
  it("MEN-022 uses .env.e2e and not .env.prod", () => {
    const root = one({ tester }, build, { "api/.env.prod": "PROD_FILE=yes\n", "api/.env.e2e": "E2E_FILE=yes\n" });
    expect(compileMesh("e2e", root).compose.services.api?.env_file).toEqual([{ path: "api/.env.e2e", required: false }]);
  });
  it("MEN-023 inherits mesh.prod env into E2E", () => {
    const root = one({ tester, prod: { services: { api: { env: { ONLY_PROD: "yes" } } } }, e2e: { services: { api: { env: { ONLY_E2E: "yes" } } } } });
    const result = compileMesh("e2e", root);
    expect(env(result.compose.services.api)).toMatchObject({ ONLY_E2E: "yes", ONLY_PROD: "yes" });
    expect((result.compose.services.api?.build as any).target).toBe("prod");
  });
  it("MEN-024 applies E2E overlay over base env", () => {
    const root = one({ tester, services: { api: { path: "api", env: { A: "base" } } }, e2e: { services: { api: { env: { A: "e2e", E2E: "yes" } } } } });
    expect(env(compileMesh("e2e", root).compose.services.api)).toMatchObject({ A: "e2e", E2E: "yes" });
  });
  it("MEN-025 runs mesh dev with integrated local dependencies", () => {
    const root = one({}, { app: {}, dependencies: { db: dep("d.yml") }, dev: { app: { env: { STAGE: "dev" } } } }, { "api/d.yml": ownerBundle() });
    const result = compileMesh("dev", root);
    expect(env(result.compose.services.api)).toMatchObject({ EXEC_MODE: "dev", INFRA_MODE: "integrated", STAGE: "dev" });
    expect(Object.keys(result.compose.services).some(x => x.includes("dep--db--"))).toBe(true);
  });
  it("MEN-026 runs mesh prod with integrated dependencies", () => {
    const root = one({}, { app: {}, dependencies: { db: dep("d.yml") }, prod: { app: { env: { STAGE: "prod" } } } }, { "api/d.yml": ownerBundle() });
    const result = compileMesh("prod", root);
    expect(env(result.compose.services.api)).toMatchObject({ EXEC_MODE: "prod", INFRA_MODE: "integrated", STAGE: "prod" });
    expect(Object.keys(result.compose.services).some(x => x.includes("dep--db--"))).toBe(true);
  });
  it("MEN-027 compiles each mesh unit service in isolated test mode", () => {
    const root = one({}, { app: {}, dependencies: { db: dep("d.yml") } }, { "api/d.yml": ownerBundle() });
    const result = compileService("test", `${root}/api`);
    expect((result.compose.services.app?.build as any).target).toBe("test");
    expect(env(result.compose.services.app).INFRA_MODE).toBe("isolated");
    expect(Object.keys(result.compose.services)).toEqual(["app"]);
  });
  it("MEN-028 runs global E2E with prod app image and E2E runtime", () => {
    const root = one({ tester }, { app: {}, dependencies: { db: dep("d.yml") }, e2e: { app: { env: { STAGE: "e2e" } } } }, { "api/d.yml": ownerBundle() });
    const result = compileMesh("e2e", root);
    expect((result.compose.services.api?.build as any).target).toBe("prod");
    expect(env(result.compose.services.api)).toMatchObject({ EXEC_MODE: "prod", INFRA_MODE: "integrated", STAGE: "e2e" });
    expect(result.testerServiceName).toBeDefined();
  });
  it("MEN-029 validates bad E2E effective stage while prod passes", () => {
    const root = one({ tester }, { app: { endpoints: { http: http() } }, e2e: { app: { endpoints: { debug: { port: 4000, primary: true } } } } });
    expect(() => compileMesh("prod", root)).not.toThrow();
    expect(() => compileMesh("e2e", root)).toThrow(/primary/);
  });
  it("MEN-030 keeps mesh env off local dependency implementation", () => {
    const root = one({ services: { api: { path: "api", env: { DB_MODE: "external" } } } }, { app: {}, dependencies: { db: { ...dep("d.yml"), env: { DB_MODE: "local" } } } }, { "api/d.yml": ownerBundle() });
    const result = compileMesh("prod", root);
    expect(env(result.compose.services.api).DB_MODE).toBe("external");
    expect(env(result.compose.services[result.endpoints.dependencies.api?.db?.api?.networkHost!]).DB_MODE).toBe("local");
  });

  it("regression: isolated mesh test-unit rejects cross-service environment references", async () => {
    const root = meshFixture({
      services: {
        frontend: { path: "frontend", env: { FRONTEND_EXTERNAL_URL: "${gateway.app.endpoints.http.public_url}/web" } },
        gateway: { path: "gateway", publish: ["app.endpoints.http"] },
      },
      test: {},
    }, {
      frontend: { app: {} },
      gateway: { app: { endpoints: { http: http(3000, { publicPort: "AUTO" }) } } },
    });
    await expect(runMeshTestUnit({ projectDir: root, dryRun: true }))
      .rejects.toThrow(/Unknown mesh service reference "gateway"/);
  });

  it("regression: test overlay can replace integrated cross-service URL with isolated literal", async () => {
    const root = meshFixture({
      services: {
        frontend: { path: "frontend", env: { FRONTEND_EXTERNAL_URL: "${gateway.app.endpoints.http.public_url}/web" } },
        gateway: { path: "gateway", publish: ["app.endpoints.http"] },
      },
      test: { services: { frontend: { env: { FRONTEND_EXTERNAL_URL: "http://127.0.0.1:3000/web" } } } },
    }, {
      frontend: { app: {} },
      gateway: { app: { endpoints: { http: http(3000, { publicPort: "AUTO" }) } } },
    });
    await expect(runMeshTestUnit({ projectDir: root, dryRun: true })).resolves.toBe(0);
  });
});

it("AUDIT-B02 rejects unknown logical dependency binding in mesh.test", async () => {
  const root = meshFixture(
    {
      services: { consumer: { path: "consumer" }, provider: { path: "provider" } },
      test: { services: { consumer: { dependencies: { "missing-slot": "provider" } } } },
    },
    { consumer: { app: {} }, provider: { app: {} } },
  );
  await expect(runMeshTestUnit({ projectDir: root, dryRun: true }))
    .rejects.toThrow(/missing-slot|Unknown logical dependency slot/i);
});

it("AUDIT-B02 rejects nonexistent provider binding in mesh.test", async () => {
  const root = meshFixture(
    {
      services: { consumer: { path: "consumer" } },
      test: { services: { consumer: { dependencies: { db: "missing-provider" } } } },
    },
    { consumer: { app: {}, dependencies: { db: dep("d.yml") } } },
    { "consumer/d.yml": ownerBundle() },
  );
  await expect(runMeshTestUnit({ projectDir: root, dryRun: true }))
    .rejects.toThrow(/missing-provider|provider/i);
});

it("AUDIT-B03 validates publish declarations in mesh.test", async () => {
  const root = meshFixture(
    {
      services: { api: { path: "api" } },
      test: { services: { api: { publish: ["app.endpoints.missing"] } } },
    },
    { api: { app: { endpoints: { http: http(3000, { publicPort: "AUTO" }) } } } },
  );
  await expect(runMeshTestUnit({ projectDir: root, dryRun: true }))
    .rejects.toThrow(/missing|Published app endpoint does not exist/i);
});

it("AUDIT-B03 reserves effective mesh.test fixed app publications globally", async () => {
  const root = meshFixture(
    {
      services: { a: { path: "a" }, b: { path: "b" } },
      test: { services: { a: { publish: ["app.endpoints.http"] }, b: { publish: ["app.endpoints.http"] } } },
    },
    {
      a: { app: { endpoints: { http: http(3000, { publicPort: 34001 }) } } },
      b: { app: { endpoints: { http: http(3000, { publicPort: 34001 }) } } },
    },
  );
  await expect(runMeshTestUnit({ projectDir: root, dryRun: true }))
    .rejects.toThrow(/34001|collision/i);
});
