import { symlinkSync } from "node:fs";
import { rebaseAppOverridePaths, rebaseComposePaths } from "../../src/core/composition/composePaths.js";
import path from "node:path";
import { checkAllEffectiveServiceStages } from "../../src/core/checkers/checkEffectiveServiceStages.js";
import { checkMeshServices } from "../../src/core/mesh/checkers/checkMeshServices.js";
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
  it("STG-009 rejects replacing an inherited dependency Compose implementation", () => {
    expect(() => resolveBuildStage({ app: {}, dependencies: { db: dep("a.yml", "owner") }, e2e: { dependencies: { db: { compose: "b.yml" } } } } as any, "e2e", "build.json")).toThrow(/e2e\.dependencies\.db\.compose|inherited|replace/i);
  });
  it("allows compose when a stage introduces a new dependency", () => {
    const result=resolveBuildStage({app:{},e2e:{dependencies:{mailpit:{compose:"mailpit.yml",endpoints:{smtp:{service:"mailpit",port:1025,primary:true,scheme:"smtp"}}}}}} as any,"e2e","build.json");
    expect(result.dependencies.mailpit?.compose).toBe("mailpit.yml");
  });
  it("rejects e2e replacement of a dependency introduced by prod", () => {
    const config:any={app:{},prod:{dependencies:{db:{compose:"prod-db.yml",endpoints:{api:{service:"db",port:5432,primary:true}}}}},e2e:{dependencies:{db:{compose:"other.yml"}}}};
    expect(()=>resolveBuildStage(config,"e2e","build.json")).toThrow(/e2e\.dependencies\.db\.compose|inherited|replace/i);
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
  it("STG-018 uses production execution for E2E apps", () => {
    const root = fixture({ app: {}, prod: { app: { env: { MARK: "prod" } } }, e2e: { app: { env: { MARK: "e2e" } } } });
    const result = compileService("e2e", root);
    expect((result.compose.services.app?.build as any).target).toBe("prod");
    expect(env(result.compose.services.app)).toMatchObject({ MARK: "e2e", EXEC_MODE: "prod", INFRA_MODE: "integrated" });
  });
  it("STG-019 uses .env.e2e rather than .env.prod", () => {
    const root = fixture({ app: {} }, { ".env.prod": "MARK=prod\n", ".env.e2e": "MARK=e2e\n" });
    expect(compileService("e2e", root).compose.services.app?.env_file).toEqual([{ path: ".env.e2e", required: false }]);
    expect(compileService("prod", root).compose.services.app?.env_file).toEqual([{ path: ".env.prod", required: false }]);
  });
  it("STG-020 inherits prod.app.env before e2e.app.env", () => {
    const root = fixture({ app: { env: { BASE: "yes" } }, prod: { app: { env: { PROD: "yes" } } }, e2e: { app: { env: { E2E: "yes" } } } });
    expect(env(compileService("e2e", root).compose.services.app)).toMatchObject({ BASE: "yes", PROD: "yes", E2E: "yes" });
  });
  it("STG-021 inherits mesh.prod overlay before E2E", () => {
    const root = meshFixture({ services: { api: { path: "api" } }, prod: { services: { api: { env: { MARK: "prod" } } } }, e2e: { services: { api: { env: { MARK: "e2e" } } } }, tester: { compose: "t.yml", service: "runner" } }, { api: { app: {} } }, { "t.yml": { services: { runner: { image: "alpine" } } } });
    const result = compileMesh("e2e", root);
    expect(env(result.compose.services.api)).toMatchObject({ MARK: "e2e" });
    expect(env(result.compose.services.api).EXEC_MODE).toBe("prod");
    expect((result.compose.services.api?.build as any).target).toBe("prod");
  });
  it("STG-022 accepts override app environment at higher precedence", () => {
    const root = fixture({ app: { env: { A: "base" } }, dev: { "override-compose": "o.yml" } }, { "o.yml": { services: { app: { environment: { A: "override", B: "new" } } } } });
    expect(env(compileService("dev", root).compose.services.app)).toMatchObject({ A: "override", B: "new" });
  });
  it("E2E preserves prod override then e2e JSON then e2e override ordering", () => {
    const root=fixture({app:{env:{VALUE:"base-json"}},prod:{app:{env:{VALUE:"prod-json"}},"override-compose":"prod.yml"},e2e:{app:{env:{VALUE:"e2e-json"}},"override-compose":"e2e.yml"}}, {"prod.yml":{services:{app:{environment:{VALUE:"prod-override",PROD_OVERRIDE:"yes"}}}},"e2e.yml":{services:{app:{environment:{VALUE:"e2e-override",E2E_OVERRIDE:"yes"}}}}});
    const compiled=compileService("e2e",root);
    expect(env(compiled.compose.services.app)).toMatchObject({VALUE:"e2e-override",PROD_OVERRIDE:"yes",E2E_OVERRIDE:"yes"});
  });
  it("E2E JSON env beats prod override when e2e override omits the key", () => {
    const root=fixture({app:{env:{VALUE:"base-json"}},prod:{app:{env:{VALUE:"prod-json"}},"override-compose":"prod.yml"},e2e:{app:{env:{VALUE:"e2e-json"}},"override-compose":"e2e.yml"}}, {"prod.yml":{services:{app:{environment:{VALUE:"prod-override"}}}},"e2e.yml":{services:{app:{environment:{E2E_OVERRIDE:"yes"}}}}});
    expect(env(compileService("e2e",root).compose.services.app).VALUE).toBe("e2e-json");
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

  it("regression: nested build-args-only override preserves standalone Builder context", () => {
    const override = ".docker/overrides/docker-compose.web-build.override.yml";
    const root = fixture(
      { app: {}, prod: { "override-compose": override }, e2e: { "override-compose": override } },
      { [override]: { services: { app: { build: { args: { BASE_PATH: "/web" } } } } } },
    );
    for (const stage of ["prod", "e2e"] as const) {
      const build = compileService(stage, root).compose.services.app?.build as Record<string, unknown>;
      expect(build.context).toBe(".");
      expect(build.target).toBe("prod");
      expect(build.args).toEqual({ BASE_PATH: "/web" });
    }
  });

  it("regression: cross-stage preflight accepts valid nested prod and e2e build-arg overrides", () => {
    const override = ".docker/overrides/docker-compose.web-build.override.yml";
    const root = fixture(
      { app: {}, prod: { "override-compose": override }, e2e: { "override-compose": override } },
      { [override]: { services: { app: { build: { args: { BASE_PATH: "/web" } } } } } },
    );
    expect(() => checkAllEffectiveServiceStages(root)).not.toThrow();
  });

  it("regression: explicit app context equal to Builder context is accepted", () => {
    const override = ".docker/overrides/docker-compose.override.yml";
    const root = fixture(
      { app: {}, prod: { "override-compose": override } },
      { [override]: { services: { app: { build: { context: ".", args: { MODE: "prod" } } } } } },
    );
    const build = compileService("prod", root).compose.services.app?.build as Record<string, unknown>;
    expect(build.context).toBe(".");
    expect(build.target).toBe("prod");
    expect(build.args).toEqual({ MODE: "prod" });
  });

  it("regression: actual application build-context replacement remains forbidden", () => {
    const override = ".docker/overrides/docker-compose.override.yml";
    const root = fixture(
      { app: {}, prod: { "override-compose": override } },
      { [override]: { services: { app: { build: { context: "./other-context", args: { MODE: "prod" } } } } } },
    );
    expect(() => compileService("prod", root)).toThrow(/override cannot change app build context/i);
  });

  it("regression: nested override relative bind source is relative to the service project", () => {
    const override = ".docker/overrides/docker-compose.dev.override.yml";
    const root = fixture(
      { app: {}, dev: { "override-compose": override } },
      { [override]: { services: { app: { volumes: [".:/workspace"] } } } },
    );
    const volumes = compileService("dev", root).compose.services.app?.volumes;
    expect(volumes).toContain(".:/workspace");
    expect(volumes).not.toContain("./.docker/overrides:/workspace");
  });

  it("regression: nested build-args-only override preserves Builder context in mesh prod and e2e", () => {
    const override = ".docker/overrides/docker-compose.web-build.override.yml";
    const mesh = {
      services: { frontend: { path: "services/frontend" } },
      tester: { compose: "e2e.yml", service: "runner" },
    };
    const root = meshFixture(mesh, {
      "services/frontend": { app: {}, prod: { "override-compose": override }, e2e: { "override-compose": override } },
    }, {
      [`services/frontend/${override}`]: { services: { app: { build: { args: { BASE_PATH: "/web" } } } } },
      "e2e.yml": { services: { runner: { image: "alpine" } } },
    });
    for (const stage of ["prod", "e2e"] as const) {
      const build = compileMesh(stage, root).compose.services.frontend?.build as Record<string, unknown>;
      expect(path.resolve(root, String(build.context))).toBe(path.resolve(root, "services/frontend"));
      expect(build.target).toBe("prod");
      expect(build.args).toEqual({ BASE_PATH: "/web" });
    }
    expect(() => checkMeshServices(mesh, root)).not.toThrow();
  });

  it("regression: mesh context validation compares path identity rather than raw spelling", () => {
    const override = ".docker/overrides/docker-compose.override.yml";
    const root = meshFixture(
      { services: { frontend: { path: "services/frontend" } } },
      { "services/frontend": { app: {}, prod: { "override-compose": override } } },
      { [`services/frontend/${override}`]: { services: { app: { build: { context: ".", args: { MODE: "prod" } } } } } },
    );
    const build = compileMesh("prod", root).compose.services.frontend?.build as Record<string, unknown>;
    expect(path.resolve(root, String(build.context))).toBe(path.resolve(root, "services/frontend"));
  });

  it("regression: override build ownership rejects strings, Dockerfiles, and non-string contexts", () => {
    for (const build of [".", "./other", { dockerfile: "OtherDockerfile" }, { context: 42 }]) {
      const root = fixture({ app: {}, prod: { "override-compose": "o.yml" } }, {
        "o.yml": { services: { app: { build } } },
      });
      expect(() => compileService("prod", root)).toThrow(/services.app.build/);
    }
  });

  it("regression: explicit symlink context is compared by filesystem identity", () => {
    const root = fixture({ app: {}, prod: { "override-compose": "o.yml" } }, {
      "o.yml": { services: { app: { build: { context: "./alias", args: { FLAG: "yes" } } } } },
    });
    symlinkSync(root, path.join(root, "alias"), "dir");
    expect(compileService("prod", root).compose.services.app?.build).toMatchObject({
      context: ".", target: "prod", args: { FLAG: "yes" },
    });
  });

  it("regression: preflight still rejects invalid prod and e2e overrides", () => {
    for (const stage of ["prod", "e2e"]) {
      const root = fixture({ app: {}, [stage]: { "override-compose": "o.yml" } }, {
        "o.yml": { services: { app: { build: { target: "anything" } } } },
      });
      expect(() => checkAllEffectiveServiceStages(root)).toThrow(/build.target/);
    }
  });

  it("regression: dependency implicit context and app overlay paths retain distinct semantics", () => {
    const root = fixture();
    const service = path.join(root, "services/frontend");
    const document = {
      services: { app: {
        build: { args: { FLAG: "yes" } },
        env_file: ["./runtime.env", { path: "./optional.env", required: false }],
        volumes: [".:/app", "cache:/cache", { type: "bind", source: "./src", target: "/src" }],
      } },
      configs: { settings: { file: "./settings.json" } },
      secrets: { token: { file: "./token.txt" } },
    };
    const result = rebaseAppOverridePaths(document, service, root);
    expect(result.services.app?.build).toEqual({ args: { FLAG: "yes" } });
    expect(result.services.app?.env_file).toEqual([
      "./services/frontend/runtime.env",
      { path: "./services/frontend/optional.env", required: false },
    ]);
    expect(result.services.app?.volumes).toEqual([
      "./services/frontend:/app", "cache:/cache",
      { type: "bind", source: "./services/frontend/src", target: "/src" },
    ]);
    expect(result.configs?.settings).toEqual({ file: "./services/frontend/settings.json" });
    expect(result.secrets?.token).toEqual({ file: "./services/frontend/token.txt" });
    expect(rebaseAppOverridePaths({
      services: { app: { env_file: "./runtime.env" } },
    }, service, root).services.app?.env_file).toBe("./services/frontend/runtime.env");
    const dependency = rebaseComposePaths(document, path.join(service, ".docker/dependency.yml"), root);
    expect(dependency.services.app?.build).toEqual({
      context: "./services/frontend/.docker", args: { FLAG: "yes" },
    });
    expect(document.services.app.build).toEqual({ args: { FLAG: "yes" } });
  });
});
