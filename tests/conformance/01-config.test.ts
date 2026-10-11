import { afterEach, describe, expect, it } from "vitest";
import path from "node:path";
import { buildJsonSchema } from "../../src/core/buildSchema.js";
import { meshSchema } from "../../src/core/mesh/meshSchema.js";
import { resolveBuildStage } from "../../src/core/config/resolveBuildStage.js";
import { resolveMeshStage } from "../../src/core/config/resolveMeshStage.js";
import { cleanupFixtures, compileMesh, compileService, dep, fixture, http, meshFixture, ownerBundle, write } from "./fixture.js";

afterEach(cleanupFixtures);
const validBuild = { app: { endpoints: { http: http() } } };
const validMesh = { services: { api: { path: "api" } } };
const parsed = (value: unknown) => buildJsonSchema.safeParse(value).success;
const meshParsed = (value: unknown) => meshSchema.safeParse(value).success;

describe("catalog 01: schema and fail-fast", () => {
  it("CFG-001 accepts minimal app without inventing endpoint or PORT", () => {
    const result = compileService("dev", fixture({ app: {} }));
    expect(result.effectiveBuild.app.endpoints).toEqual({});
    expect(result.compose.services.app?.environment).not.toHaveProperty("PORT");
  });
  it("CFG-002 rejects every non-object build root", () => {
    for (const value of [null, [], "text", 4, true]) expect(parsed(value), String(value)).toBe(false);
  });
  it("CFG-003 requires app", () => expect(parsed({})).toBe(false));
  it("CFG-004 requires app to be an object", () => {
    for (const value of [null, [], "text", 4, true]) expect(parsed({ app: value }), String(value)).toBe(false);
  });
  it("CFG-005 accepts only string env values in every JSON env location", () => {
    const bad = [null, 1, true, [], {}];
    for (const value of bad) {
      for (const candidate of [
        { app: { env: { X: value } } },
        { app: {}, e2e: { app: { env: { X: value } } } },
        { app: {}, dependencies: { db: { ...dep(), env: { X: value } } } },
        { app: {}, e2e: { dependencies: { db: { env: { X: value } } } } },
        { app: {}, tester: { env: { X: value } } },
      ]) expect(parsed(candidate)).toBe(false);
      expect(meshParsed({ services: { api: { path: "api", env: { X: value } } } })).toBe(false);
      expect(meshParsed({ ...validMesh, tester: { compose: "t.yml", service: "runner", env: { X: value } } })).toBe(false);
    }
  });
  it("CFG-006 validates dependency key grammar exactly", () => {
    for (const key of ["db", "db-2", "a"]) expect(parsed({ app: {}, dependencies: { [key]: dep() } })).toBe(true);
    for (const key of ["", "DB", "db_2", "db.x", "2db", "db x"]) expect(parsed({ app: {}, dependencies: { [key]: dep() } })).toBe(false);
  });
  it("CFG-007 validates app and dependency endpoint keys", () => {
    for (const key of ["", "HTTP", "http_2", "2http", "http.x"]) {
      expect(parsed({ app: { endpoints: { [key]: http() } } })).toBe(false);
      expect(parsed({ app: {}, dependencies: { db: { compose: "d.yml", endpoints: { [key]: { service: "owner", port: 1 } } } } })).toBe(false);
    }
    expect(parsed({ app: { endpoints: { "http-2": http() } } })).toBe(true);
  });
  it("CFG-008 validates mesh service key grammar", () => {
    for (const key of ["", "API", "api_2", "api.x", "2api", "api x"]) expect(meshParsed({ services: { [key]: { path: "api" } } })).toBe(false);
    expect(meshParsed({ services: { "api-2": { path: "api" } } })).toBe(true);
  });
  it("CFG-009 rejects reserved mesh service names", () => {
    for (const key of ["app", "dependencies", "tester", "services", "dev", "prod", "test", "e2e"]) expect(meshParsed({ services: { [key]: { path: "api" } } }), key).toBe(false);
  });
  it("CFG-010 rejects zero and negative endpoint ports", () => {
    for (const port of [0, -1]) {
      expect(parsed({ app: { endpoints: { http: http(port) } } })).toBe(false);
      expect(parsed({ app: {}, dependencies: { db: dep("d.yml", "owner", port) } })).toBe(false);
    }
  });
  it("CFG-011 rejects ports greater than 65535", () => {
    for (const port of [65536, 100000]) expect(parsed({ app: { endpoints: { http: http(port) } } })).toBe(false);
  });
  it("CFG-012 rejects non-integer port types", () => {
    for (const port of ["3000", "AUTO", 1.5, true, null, {}, []]) expect(parsed({ app: { endpoints: { http: { port, primary: true } } } })).toBe(false);
  });
  it("CFG-013 preserves valid publicPort forms", () => {
    for (const publicPort of [undefined, 1, 65535, "AUTO"]) {
      const endpoint = { ...http(3000), ...(publicPort === undefined ? {} : { publicPort }) };
      expect(parsed({ app: { endpoints: { http: endpoint } } })).toBe(true);
      expect(endpoint.port).toBe(3000);
    }
  });
  it("CFG-014 rejects invalid publicPort without coercion", () => {
    for (const publicPort of [0, 65536, "3000", "auto", "RANDOM", 1.2, true, null, {}, []]) expect(parsed({ app: { endpoints: { http: http(3000, { publicPort }) } } })).toBe(false);
  });
  it("CFG-015 enforces lexical scheme grammar without a whitelist", () => {
    for (const scheme of ["http", "HTTP", "grpc", "redis", "foo+bar", "x.y", "x-y"]) expect(parsed({ app: { endpoints: { http: http(3000, { scheme }) } } })).toBe(true);
    for (const scheme of ["", "1http", "_http", "http://", "x/y", "x y"]) expect(parsed({ app: { endpoints: { http: http(3000, { scheme }) } } })).toBe(false);
  });
  it("CFG-016 requires exactly one primary app endpoint", () => {
    for (const endpoints of [{ a: { port: 1 } }, { a: { port: 1, primary: true }, b: { port: 2, primary: true } }]) expect(() => resolveBuildStage({ app: { endpoints } } as any, "dev", "build.json")).toThrow(/primary/i);
  });
  it("CFG-017 requires exactly one primary dependency endpoint", () => {
    for (const endpoints of [{ a: { service: "owner", port: 1 } }, { a: { service: "owner", port: 1, primary: true }, b: { service: "other", port: 2, primary: true } }]) expect(() => resolveBuildStage({ app: {}, dependencies: { db: { compose: "d.yml", endpoints } } } as any, "dev", "build.json")).toThrow(/primary/i);
  });
  it("CFG-018 accepts empty endpoint maps and keeps dependency inert", () => {
    const result = compileService("prod", fixture({ app: { endpoints: {} }, dependencies: { db: { compose: "d.yml", endpoints: {} } } }, { "d.yml": ownerBundle() }));
    expect(Object.keys(result.compose.services)).toEqual(["app"]);
  });
  it("CFG-019 requires explicit dependency endpoint owner", () => {
    expect(parsed({ app: {}, dependencies: { db: { compose: "d.yml", endpoints: { api: { port: 1, primary: true } } } } })).toBe(false);
  });
  it("CFG-020 rejects dependency-level service shortcut", () => expect(parsed({ app: {}, dependencies: { db: { ...dep(), service: "owner" } } })).toBe(false));
  it("CFG-021 requires effective dependency compose", () => expect(() => resolveBuildStage({ app: {}, e2e: { dependencies: { db: { endpoints: { api: { service: "owner", port: 1, primary: true } } } } } } as any, "e2e", "build.json")).toThrow(/dependencies.db.compose/));
  it("CFG-022 defaults to root Dockerfile", () => {
    const result = compileService("prod", fixture({ app: {} }, { Dockerfile: "FROM scratch\n" }));
    expect(result.compose.services.app?.build).toMatchObject({ context: ".", target: "prod" });
  });
  it("CFG-023 keeps Dockerfile paths within project", () => {
    const root = fixture({ dockerfile: "docker/Dockerfile", app: {} }, { "docker/Dockerfile": "FROM scratch\n" });
    expect(compileService("dev", root).compose.services.app?.build).toMatchObject({ dockerfile: "docker/Dockerfile" });
    write(root, "build.json", { dockerfile: "../outside/Dockerfile", app: {} });
    expect(() => compileService("dev", root)).toThrow(/dockerfile|outside/i);
  });
  it("CFG-024 keeps dependency Compose paths within project", () => {
    const root = fixture({ app: {}, dependencies: { db: dep("d.yml") } }, { "d.yml": ownerBundle() });
    expect(() => compileService("prod", root)).not.toThrow();
    write(root, "build.json", { app: {}, dependencies: { db: dep("../outside.yml") } });
    expect(() => compileService("prod", root)).toThrow(/dependencies.db.compose|outside/i);
  });
  it("CFG-025 keeps active override Compose within project", () => {
    const root = fixture({ app: {}, dev: { "override-compose": "over.yml" } }, { "over.yml": { services: { app: { environment: { A: "1" } } } } });
    expect(() => compileService("dev", root)).not.toThrow();
    write(root, "build.json", { app: {}, dev: { "override-compose": "../over.yml" } });
    expect(() => compileService("dev", root)).toThrow(/outside|override-compose/i);
  });
  it("CFG-026 fails on missing declared files", () => {
    const root = fixture({ app: {}, dependencies: { db: dep("missing.yml") } });
    expect(() => compileService("prod", root)).toThrow(/missing.yml/);
    const mesh = meshFixture({ services: { api: { path: "missing" } } }, {});
    expect(() => compileMesh("prod", mesh)).toThrow(/missing/);
  });
  it("CFG-027 reports malformed JSON at its source", () => {
    const root = fixture({ app: {} }); write(root, "build.json", "{\"app\":{},}");
    expect(() => compileService("dev", root)).toThrow(/build.json/);
    const mesh = meshFixture(validMesh, { api: { app: {} } }); write(mesh, "mesh.json", "{\"services\":,}");
    expect(() => compileMesh("dev", mesh)).toThrow(/mesh.json/);
  });
  it("CFG-028 fails on malformed dependency YAML", () => {
    const root = fixture({ app: {}, dependencies: { db: dep("d.yml") } }, { "d.yml": "services:\n  owner: [bad\n" });
    expect(() => compileService("prod", root)).toThrow(/d.yml|yaml/i);
  });
  it("CFG-029 fails on malformed active override YAML", () => {
    const root = fixture({ app: {}, dev: { "override-compose": "o.yml" } }, { "o.yml": "services:\n  app: [bad\n" });
    expect(() => compileService("dev", root)).toThrow(/o.yml|yaml/i);
  });
  it("CFG-030 rejects every removed build root field", () => {
    for (const key of ["port", "envOverrides", "overrides", "composeFiles", "services", "policy", "policies", "injects", "sidecars"]) expect(parsed({ app: {}, [key]: {} }), key).toBe(false);
  });
  it("CFG-031 rejects removed dependency shortcuts", () => {
    for (const key of ["path", "service", "port", "ports"]) expect(parsed({ app: {}, dependencies: { db: { ...dep(), [key]: "legacy" } } }), key).toBe(false);
  });
  it("CFG-032 rejects removed mesh fields", () => {
    expect(meshParsed({ ...validMesh, dependencies: {} })).toBe(false);
    for (const key of ["port", "preservePort", "provideDependency", "replaceMocks", "envOverrides", "healthcheck"]) expect(meshParsed({ services: { api: { path: "api", [key]: "legacy" } } }), key).toBe(false);
  });
  it("CFG-033 rejects removed mesh tester fields", () => {
    for (const key of ["path", "dockerfile", "envOverrides", "policy"]) expect(meshParsed({ ...validMesh, tester: { compose: "t.yml", service: "runner", [key]: "legacy" } }), key).toBe(false);
  });
  it("CFG-034 rejects inherit-published", () => expect(meshParsed({ ...validMesh, "inherit-published": true })).toBe(false));
  it("CFG-035 rejects JSON secrets while accepting Compose-owned secrets", () => {
    expect(parsed({ app: {}, secrets: {} })).toBe(false);
    expect(meshParsed({ ...validMesh, secrets: {} })).toBe(false);
    const root = fixture({ app: {}, dependencies: { db: dep("d.yml") } }, { "d.yml": { ...ownerBundle(), secrets: { password: { file: "./secret.txt" } }, services: { owner: { image: "alpine", healthcheck: { test: ["CMD", "true"] }, secrets: ["password"] } } }, "secret.txt": "secret" });
    expect(compileService("prod", root).compose.secrets).toBeDefined();
  });
  it("CFG-036 forbids app.dependsOn in base and stage", () => {
    expect(parsed({ app: { dependsOn: ["db"] } })).toBe(false);
    expect(parsed({ app: {}, dev: { app: { dependsOn: ["db"] } } })).toBe(false);
  });
  it("CFG-037 rejects misspelled and unknown nested fields", () => {
    expect(parsed({ app: {}, dependecies: {} })).toBe(false);
    expect(parsed({ app: { endpoint: {} } })).toBe(false);
    expect(parsed({ app: { endpoints: { http: { ...http(), schem: "http" } } } })).toBe(false);
    expect(meshParsed({ services: { api: { path: "api", publsh: [] } } })).toBe(false);
  });
  it("CFG-038 requires nonempty effective mesh services", () => {
    for (const services of [undefined, null, "bad", []]) expect(meshParsed({ services })).toBe(false);
    expect(() => resolveMeshStage({ services: {} } as any, "dev", "mesh.json")).toThrow(/service/i);
  });
  it("CFG-039 requires effective path for stage-added service", () => {
    expect(() => resolveMeshStage({ services: { api: { path: "api" } }, e2e: { services: { fake: { env: { X: "1" } } } } } as any, "e2e", "mesh.json")).toThrow(/services.fake.path/);
  });
  it("CFG-040 reports stage, source, logical path and reason", () => {
    const root = meshFixture({ services: { api: { path: "api" } }, e2e: { services: { api: { env: { BAD: "${api.app.endpoints.http.public_url}" } } } }, tester: { compose: "t.yml", service: "runner" } }, { api: validBuild }, { "t.yml": { services: { runner: { image: "alpine" } } } });
    let error = ""; try { compileMesh("e2e", root); } catch (e) { error = String(e); }
    expect(error).toMatch(/mesh.json|api/); expect(error).toMatch(/e2e/); expect(error).toMatch(/public_url|publication/);
  });
  it("CFG-041 refuses an owner without healthcheck", () => {
    const root = fixture({ app: {}, dependencies: { db: dep("d.yml") } }, { "d.yml": { services: { owner: { image: "alpine" } } } });
    expect(() => compileService("prod", root)).toThrow(/health/i);
  });
});
