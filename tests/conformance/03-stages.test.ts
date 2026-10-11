import { runStep } from "../../src/core/checkers/runStep.js";
import { checkDockerfileContract } from "../../src/core/checkers/checkDockerfileContract.js";
vi.mock("../../src/core/checkers/runStep.js",()=>({runStep:vi.fn()}));
import { afterEach, describe, expect, it, vi } from "vitest";
import { resolveBuildStage } from "../../src/core/config/resolveBuildStage.js";
import { resolveMeshStage } from "../../src/core/config/resolveMeshStage.js";
import { buildJsonSchema } from "../../src/core/buildSchema.js";
import { CONFTEST_IMAGE } from "../../src/core/checkers/constants.js";
import { cleanupFixtures, compileMesh, compileService, dep, env, fixture, http, meshFixture, ownerBundle, write } from "./fixture.js";

afterEach(cleanupFixtures);
const service = () => fixture({ app: { env: { BASE: "yes" }, endpoints: { http: http() } }, dependencies: { db: dep("d.yml") } }, { "d.yml": ownerBundle() });

describe("catalog 03: stages, Dockerfile, and override Compose", () => {
  it("STG-001 deep-merges app env", () => {
    const result = resolveBuildStage({ app: { env: { A: "1", B: "1" } }, dev: { app: { env: { B: "2", C: "2" } } } }, "dev", "build.json");
    expect(result.app.env).toEqual({ A: "1", B: "2", C: "2" });
  });
  it("STG-002 overlays endpoint scalars without losing inherited fields", () => {
    const result = resolveBuildStage({ app: { endpoints: { http: http(3000, { publicPort: "AUTO" }) } }, dev: { app: { endpoints: { http: { publicPort: 3001 } } } } } as any, "dev", "build.json");
    expect(result.app.endpoints.http).toEqual(http(3000, { publicPort: 3001 }));
  });
  it("STG-003 confines added app endpoint to E2E", () => {
    const config: any = { app: { endpoints: { http: http() } }, e2e: { app: { endpoints: { debug: { port: 4000 } } } } };
    expect(resolveBuildStage(config, "e2e", "build.json").app.endpoints).toHaveProperty("debug");
    expect(resolveBuildStage(config, "prod", "build.json").app.endpoints).not.toHaveProperty("debug");
  });
  it("STG-004 validates primary after stage overlay", () => {
    const config: any = { app: { endpoints: { http: http(), debug: { port: 4000 } } }, e2e: { app: { endpoints: { debug: { primary: true } } } } };
    expect(() => resolveBuildStage(config, "prod", "build.json")).not.toThrow();
    expect(() => resolveBuildStage(config, "e2e", "build.json")).toThrow(/primary/);
  });
  it("STG-005 materializes complete E2E-only dependency", () => {
    const root = fixture({ app: {}, e2e: { dependencies: { mail: dep("mail.yml") } } }, { "mail.yml": ownerBundle() });
    expect(Object.keys(compileService("prod", root).compose.services)).toEqual(["app"]);
    expect(Object.keys(compileService("e2e", root).compose.services)).toContain("dep--mail--owner");
  });
  it("STG-006 rejects incomplete stage-added dependency", () => {
    expect(() => resolveBuildStage({ app: {}, e2e: { dependencies: { mail: { endpoints: { api: { service: "owner", port: 1, primary: true } } } } } } as any, "e2e", "build.json")).toThrow(/compose/);
  });
  it("STG-007 requires service and port on new stage endpoint", () => {
    const config: any = { app: {}, dependencies: { db: dep() }, e2e: { dependencies: { db: { endpoints: { new: { scheme: "http", publicPort: "AUTO" } } } } } };
    expect(() => resolveBuildStage(config, "e2e", "build.json")).toThrow(/endpoints.new/);
    config.e2e.dependencies.db.endpoints = { api: { scheme: "https" } };
    expect(resolveBuildStage(config, "e2e", "build.json").dependencies.db?.endpoints.api?.scheme).toBe("https");
  });
  it("STG-008 overlays dependency env on every bundle service", () => {
    const root = fixture({ app: {}, dependencies: { db: { ...dep("d.yml"), env: { A: "1", B: "1" } } }, e2e: { dependencies: { db: { env: { B: "2", C: "2" } } } } }, { "d.yml": ownerBundle({ helper: { image: "alpine" } }) });
    const result = compileService("e2e", root);
    for (const [name, value] of Object.entries(result.compose.services)) if (name !== "app" && name !== "tester") expect(env(value)).toMatchObject({ A: "1", B: "2", C: "2" });
  });
  it("STG-009 replaces dependency Compose as an atomic bundle", () => {
    const root = fixture({ app: {}, dependencies: { db: dep("a.yml", "owner") }, e2e: { dependencies: { db: { compose: "b.yml" } } } }, { "a.yml": ownerBundle({ helperA: { image: "alpine" } }), "b.yml": ownerBundle({ helperB: { image: "alpine" } }) });
    expect(Object.keys(compileService("prod", root).compose.services)).toContain("dep--db--helperA");
    expect(Object.keys(compileService("e2e", root).compose.services)).toContain("dep--db--helperB");
    expect(Object.keys(compileService("e2e", root).compose.services)).not.toContain("dep--db--helperA");
  });
  it("STG-010 union-merges build dependsOn base-first", () => {
    const d = (dependsOn: string[] = []) => ({ ...dep(), dependsOn });
    const config: any = { app: {}, dependencies: { redis: d(), mail: d(), worker: d(["dependencies.redis"]) }, e2e: { dependencies: { worker: { dependsOn: ["dependencies.redis", "dependencies.mail"] } } } };
    expect(resolveBuildStage(config, "e2e", "build.json").dependencies.worker?.dependsOn).toEqual(["dependencies.redis", "dependencies.mail"]);
  });
  it("STG-011 union-merges mesh dependsOn base-first", () => {
    const config: any = { services: { gateway: { path: "gateway", dependsOn: ["backend"] }, backend: { path: "backend" } }, e2e: { services: { gateway: { dependsOn: ["backend", "fake"] }, fake: { path: "fake" } } } };
    expect(resolveMeshStage(config, "e2e", "mesh.json").services.gateway?.dependsOn).toEqual(["backend", "fake"]);
  });
  it("STG-012 union-merges mesh publication base-first", () => {
    const config: any = { services: { api: { path: "api", publish: ["app.endpoints.http"] } }, e2e: { services: { api: { publish: ["app.endpoints.http", "app.endpoints.metrics"] } } } };
    expect(resolveMeshStage(config, "e2e", "mesh.json").services.api?.publish).toEqual(["app.endpoints.http", "app.endpoints.metrics"]);
  });
  it("STG-013 has no generic deletion syntax", () => {
    const base = { app: { endpoints: { http: http() } } };
    expect(buildJsonSchema.safeParse({ ...base, e2e: { app: { endpoints: { http: null } } } }).success).toBe(false);
    expect(resolveBuildStage({ ...base, e2e: { app: {} } } as any, "e2e", "build.json").app.endpoints).toHaveProperty("http");
  });
  it("STG-014 runs standalone dev with isolated infra", () => {
    const result = compileService("dev", service());
    expect((result.compose.services.app?.build as any).target).toBe("dev");
    expect(env(result.compose.services.app)).toMatchObject({ EXEC_MODE: "dev", INFRA_MODE: "isolated" });
    expect(Object.keys(result.compose.services)).toEqual(["app"]);
  });
  it("STG-015 runs dev --full with integrated infra", () => {
    const result = compileService("dev", service(), true);
    expect((result.compose.services.app?.build as any).target).toBe("dev");
    expect(env(result.compose.services.app).INFRA_MODE).toBe("integrated");
    expect(result.compose.services).toHaveProperty("dep--db--owner");
  });
  it("STG-016 runs prod with integrated infra", () => {
    const result = compileService("prod", service());
    expect((result.compose.services.app?.build as any).target).toBe("prod");
    expect(env(result.compose.services.app)).toMatchObject({ EXEC_MODE: "prod", INFRA_MODE: "integrated" });
    expect(result.compose.services).toHaveProperty("dep--db--owner");
  });
  it("STG-017 runs test-unit isolated without E2E tester", () => {
    const result = compileService("test", service());
    expect((result.compose.services.app?.build as any).target).toBe("test");
    expect(env(result.compose.services.app)).toMatchObject({ EXEC_MODE: "test", INFRA_MODE: "isolated" });
    expect(Object.keys(result.compose.services)).toEqual(["app"]);
  });
  it("STG-018 uses prod image target with E2E runtime overlay", () => {
    const root = fixture({ app: {}, prod: { app: { env: { MARK: "prod" } } }, e2e: { app: { env: { MARK: "e2e" } } } });
    const result = compileService("e2e", root);
    expect((result.compose.services.app?.build as any).target).toBe("prod");
    expect(env(result.compose.services.app)).toMatchObject({ MARK: "e2e", EXEC_MODE: "e2e" });
  });
  it("STG-019 uses .env.e2e rather than .env.prod", () => {
    const root = fixture({ app: {} }, { ".env.prod": "MARK=prod\n", ".env.e2e": "MARK=e2e\n" });
    expect(compileService("e2e", root).compose.services.app?.env_file).toEqual([{ path: ".env.e2e", required: false }]);
    expect(compileService("prod", root).compose.services.app?.env_file).toEqual([{ path: ".env.prod", required: false }]);
  });
  it("STG-020 excludes prod.app.env from E2E", () => {
    const root = fixture({ app: { env: { BASE: "yes" } }, prod: { app: { env: { PROD: "yes" } } }, e2e: { app: { env: { E2E: "yes" } } } });
    expect(env(compileService("e2e", root).compose.services.app)).toMatchObject({ BASE: "yes", E2E: "yes" });
    expect(env(compileService("e2e", root).compose.services.app).PROD).toBeUndefined();
  });
  it("STG-021 excludes mesh.prod overlay from E2E", () => {
    const root = meshFixture({ services: { api: { path: "api" } }, prod: { services: { api: { env: { MARK: "prod" } } } }, e2e: { services: { api: { env: { MARK: "e2e" } } } }, tester: { compose: "t.yml", service: "runner" } }, { api: { app: {} } }, { "t.yml": { services: { runner: { image: "alpine" } } } });
    const result = compileMesh("e2e", root);
    expect(env(result.compose.services.api).MARK).toBe("e2e");
    expect((result.compose.services.api?.build as any).target).toBe("prod");
  });
  it("STG-022 accepts override app environment at higher precedence", () => {
    const root = fixture({ app: { env: { A: "base" } }, dev: { "override-compose": "o.yml" } }, { "o.yml": { services: { app: { environment: { A: "override", B: "new" } } } } });
    expect(env(compileService("dev", root).compose.services.app)).toMatchObject({ A: "override", B: "new" });
  });
  it("STG-023 accepts app development volumes in override", () => {
    const root = fixture({ app: {}, dev: { "override-compose": "o.yml" } }, { "o.yml": { services: { app: { volumes: ["./src:/src:ro", "/app/node_modules"] } } } });
    expect(compileService("dev", root).compose.services.app?.volumes).toEqual(["./src:/src:ro", "/app/node_modules"]);
  });
  it("STG-024 uses only explicit override build args", () => {
    const root = fixture({ app: { env: { TOKEN: "runtime" } }, dev: { "override-compose": "o.yml" } }, { "o.yml": { services: { app: { build: { args: { TOKEN: "build" } } } } } });
    const result = compileService("dev", root);
    expect((result.compose.services.app?.build as any).args.TOKEN).toBe("build");
    expect(env(result.compose.services.app).TOKEN).toBe("runtime");
  });
  it("STG-025 rejects arbitrary extra override service", () => {
    const root = fixture({ app: {}, dev: { "override-compose": "o.yml" } }, { "o.yml": { services: { app: {}, helper: { image: "alpine" } } } });
    expect(() => compileService("dev", root)).toThrow(/exactly one service|helper/i);
  });
  it("STG-026 rejects override host ports", () => {
    const root = fixture({ app: {}, dev: { "override-compose": "o.yml" } }, { "o.yml": { services: { app: { ports: ["3000:3000"] } } } });
    expect(() => compileService("dev", root)).toThrow(/ports/);
  });
  it("STG-027 rejects override app depends_on", () => {
    const root = fixture({ app: {}, dev: { "override-compose": "o.yml" } }, { "o.yml": { services: { app: { depends_on: ["helper"] } } } });
    expect(() => compileService("dev", root)).toThrow(/depends_on/);
  });
  it("STG-028 rejects override build target", () => {
    const root = fixture({ app: {}, dev: { "override-compose": "o.yml" } }, { "o.yml": { services: { app: { build: { target: "prod" } } } } });
    expect(() => compileService("dev", root)).toThrow(/target/);
  });
  it("STG-029 rejects override healthcheck removal", () => {
    const root = fixture({ app: {}, dev: { "override-compose": "o.yml" } }, { "o.yml": { services: { app: { healthcheck: { disable: true } } } } });
    expect(() => compileService("dev", root)).toThrow(/healthcheck|disable/);
  });
  it("STG-030 propagates policy rejection for missing target", () => {
    const root = fixture({app:{}});
    vi.mocked(runStep).mockImplementationOnce(() => { throw new Error("Dockerfile contract: missing target"); });
    expect(() => checkDockerfileContract({app:{}}, root)).toThrow("missing target");
    expect(runStep).toHaveBeenLastCalledWith("docker", expect.arrayContaining([CONFTEST_IMAGE, "test", "Dockerfile", "-p", "/builder-policy"]), root, expect.objectContaining({stepName:"Dockerfile Contract"}));
  });
  it("STG-031 propagates policy rejection for foreground dev CMD", () => {
    const root = fixture({app:{}});
    vi.mocked(runStep).mockImplementationOnce(() => { throw new Error("Dockerfile contract: foreground dev CMD"); });
    expect(() => checkDockerfileContract({app:{}}, root)).toThrow("foreground dev CMD");
    expect(runStep).toHaveBeenLastCalledWith("docker", expect.arrayContaining([CONFTEST_IMAGE, "test", "Dockerfile", "-p", "/builder-policy"]), root, expect.objectContaining({stepName:"Dockerfile Contract"}));
  });
  it("STG-032 accepts successful policy validation for finite test targets", () => {
    const root=fixture({app:{}}); expect(()=>checkDockerfileContract({app:{}},root)).not.toThrow();
    expect(runStep).toHaveBeenLastCalledWith("docker", expect.arrayContaining([CONFTEST_IMAGE,"test","Dockerfile"]),root,expect.objectContaining({stepName:"Dockerfile Contract"}));
  });
  it("STG-033 propagates policy rejection for dev and prod healthchecks", () => {
    const root = fixture({app:{}});
    vi.mocked(runStep).mockImplementationOnce(() => { throw new Error("Dockerfile contract: dev and prod healthchecks"); });
    expect(() => checkDockerfileContract({app:{}}, root)).toThrow("dev and prod healthchecks");
    expect(runStep).toHaveBeenLastCalledWith("docker", expect.arrayContaining([CONFTEST_IMAGE, "test", "Dockerfile", "-p", "/builder-policy"]), root, expect.objectContaining({stepName:"Dockerfile Contract"}));
  });
  it("STG-034 propagates policy rejection for EXPOSE", () => {
    const root = fixture({app:{}});
    vi.mocked(runStep).mockImplementationOnce(() => { throw new Error("Dockerfile contract: EXPOSE"); });
    expect(() => checkDockerfileContract({app:{}}, root)).toThrow("EXPOSE");
    expect(runStep).toHaveBeenLastCalledWith("docker", expect.arrayContaining([CONFTEST_IMAGE, "test", "Dockerfile", "-p", "/builder-policy"]), root, expect.objectContaining({stepName:"Dockerfile Contract"}));
  });
  it("STG-035 propagates policy rejection for production artifacts", () => {
    const root = fixture({app:{}});
    vi.mocked(runStep).mockImplementationOnce(() => { throw new Error("Dockerfile contract: production artifacts"); });
    expect(() => checkDockerfileContract({app:{}}, root)).toThrow("production artifacts");
    expect(runStep).toHaveBeenLastCalledWith("docker", expect.arrayContaining([CONFTEST_IMAGE, "test", "Dockerfile", "-p", "/builder-policy"]), root, expect.objectContaining({stepName:"Dockerfile Contract"}));
  });
  it("STG-036 propagates policy rejection for daemonizing runtime command", () => {
    const root = fixture({app:{}});
    vi.mocked(runStep).mockImplementationOnce(() => { throw new Error("Dockerfile contract: daemonizing runtime command"); });
    expect(() => checkDockerfileContract({app:{}}, root)).toThrow("daemonizing runtime command");
    expect(runStep).toHaveBeenLastCalledWith("docker", expect.arrayContaining([CONFTEST_IMAGE, "test", "Dockerfile", "-p", "/builder-policy"]), root, expect.objectContaining({stepName:"Dockerfile Contract"}));
  });
  it("STG-037 injects primary port only", () => {
    const root = fixture({ app: { endpoints: { http: http(4123), metrics: { port: 9000 } } } });
    expect(env(compileService("prod", root).compose.services.app).PORT).toBe("4123");
  });
  it("STG-038 injects no PORT without endpoints", () => expect(env(compileService("prod", fixture({ app: {} })).compose.services.app).PORT).toBeUndefined());
  it("STG-039 validates only the active effective stage", () => {
    const root = fixture({ app: { endpoints: { http: http() } }, e2e: { app: { env: { BAD: "${app.endpoints.missing.network_host}" } } } });
    expect(() => compileService("prod", root)).not.toThrow();
    expect(() => compileService("e2e", root)).toThrow(/missing/);
  });
});
