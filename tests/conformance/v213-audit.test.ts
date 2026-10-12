import { afterEach, expect, it, vi } from "vitest";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { cleanupFixtures, compileMesh, compileService, fixture, http, meshFixture } from "./fixture.js";
import { resolveMeshStage } from "../../src/core/config/resolveMeshStage.js";
import { resolveInsideProject } from "../../src/core/config/pathSafety.js";
import { compileApplicationEnv } from "../../src/core/compileApplicationEnv.js";
import { handleExportEnv } from "../../src/commands/service/commands/export/handler.js";

afterEach(cleanupFixtures);

it("V213-001 ignores overwritten base app reference in standalone stage", () => {
  const root = fixture({ app: { env: { URL: "${app.endpoints.missing.network_url}" } }, dev: { app: { env: { URL: "http://local" } } } });
  expect(compileService("dev", root).compose.services.app?.environment).toMatchObject({ URL: "http://local" });
});

it("V213-001 ignores overwritten prod app reference in e2e", () => {
  const root = fixture({ app: {}, prod: { app: { env: { URL: "${app.endpoints.missing.network_url}" } } }, e2e: { app: { env: { URL: "http://e2e" } } } });
  expect(compileService("e2e", root).compose.services.app?.environment).toMatchObject({ URL: "http://e2e" });
});

it("V213-001 ignores build reference replaced by active override Compose env", () => {
  const root = fixture({ app: { env: { URL: "${app.endpoints.missing.network_url}" } }, dev: { "override-compose": "dev.yml" } },
    { "dev.yml": { services: { app: { environment: { URL: "http://override" } } } } });
  expect(compileService("dev", root).compose.services.app?.environment).toMatchObject({ URL: "http://override" });
});

it("V213-001 ignores overwritten base app reference in mesh", () => {
  const root = meshFixture({ services: { api: { path: "api" } } }, { api: { app: { env: { URL: "${app.endpoints.missing.network_url}" } }, dev: { app: { env: { URL: "http://local" } } } } });
  expect(compileMesh("dev", root).compose.services.api?.environment).toMatchObject({ URL: "http://local" });
});

it("V213-001 ignores build reference replaced by mesh service env", () => {
  const root = meshFixture({ services: { api: { path: "api", env: { URL: "http://mesh" } } } },
    { api: { app: { env: { URL: "${app.endpoints.missing.network_url}" } } } });
  expect(compileMesh("dev", root).compose.services.api?.environment).toMatchObject({ URL: "http://mesh" });
});

it("V213-001 control rejects unresolved effective reference", () => {
  const root = fixture({ app: { env: { URL: "${app.endpoints.missing.network_url}" } } });
  expect(() => compileService("dev", root)).toThrow(/missing|endpoint/i);
});

it("V213-001 control merges precedence chain and preserves independent key", () => {
  const root = meshFixture(
    { services: { api: { path: "api", env: { URL: "http://mesh" } } } },
    {
      api: {
        app: { env: { URL: "http://base", KEEP: "preserved" } },
        dev: { "override-compose": "dev.yml", app: { env: { URL: "http://dev" } } },
      },
    },
    { "api/dev.yml": { services: { app: { environment: { URL: "http://override" } } } } },
  );
  expect(compileMesh("dev", root).compose.services.api?.environment).toMatchObject({
    URL: "http://mesh",
    KEEP: "preserved",
  });
});

it("V213-001 control rejects unresolved reference in winning mesh value", () => {
  const root = meshFixture(
    { services: { api: { path: "api", env: { URL: "${services.missing.endpoints.http.network_url}" } } } },
    { api: { app: { env: { URL: "http://base" } } } },
  );
  expect(() => compileMesh("dev", root)).toThrow(/Referenced service does not exist|services\.api\.env/i);
});

it("V213-001 control rejects Builder-owned key even when overwritten", () => {
  const root = fixture({
    app: { env: { EXEC_MODE: "dev" } },
    dev: { app: { env: { EXEC_MODE: "test" } } },
  });
  expect(() => compileService("dev", root)).toThrow(/Builder-owned/i);
});

it("V213-001 control override Compose null entry masks bad lower reference", () => {
  const root = fixture(
    { app: { env: { URL: "${app.endpoints.missing.network_url}" } }, dev: { "override-compose": "dev.yml" } },
    { "dev.yml": { services: { app: { environment: { URL: null } } } } },
  );
  const compiled = compileService("dev", root);
  expect(compiled.compose.services.app?.environment).toHaveProperty("URL", null);
});


it("V213-D02 public mesh examples use paths accepted by Builder", () => {
  const offenders = readdirSync("docs", { recursive: true })
    .filter((file): file is string => typeof file === "string" && file.endsWith(".md"))
    .filter(file => /"path"\s*:\s*"\.\.\//.test(readFileSync(path.join("docs", file), "utf8")));
  expect(offenders).toEqual([]);
});

it("V213-D02 control Builder rejects a project-escaping mesh path", () => {
  expect(() => resolveInsideProject("/tmp/mesh", "../frontend", { sourceFile: "mesh.json", configPath: "services.frontend.path" })).toThrow(/escapes/i);
});

it("V213-D02 control compiles mesh with nested service paths", () => {
  const root = meshFixture(
    { services: { frontend: { path: "./services/frontend" } } },
    { "services/frontend": { app: {} } },
  );
  expect(() => compileMesh("dev", root)).not.toThrow();
});

it("V213-D03 complete public mesh example has an acyclic lifecycle", () => {
  const doc = readFileSync("docs/reference/mesh-json.md", "utf8");
  const block = doc.match(/## Complete example[\s\S]*?```json\n([\s\S]*?)\n```/)?.[1];
  expect(block).toBeDefined();
  const example = JSON.parse(block!);
  expect(() => resolveMeshStage(example, "dev", "docs/reference/mesh-json.md")).not.toThrow();
});

it("V213-D03 control removing the reversed edge makes the example acyclic", () => {
  const doc = readFileSync("docs/reference/mesh-json.md", "utf8");
  const block = doc.match(/## Complete example[\s\S]*?```json\n([\s\S]*?)\n```/)?.[1];
  const example = JSON.parse(block!);
  delete example.services.frontend.dependsOn;
  expect(() => resolveMeshStage(example, "dev", "docs/reference/mesh-json.md")).not.toThrow();
});

it("V213-D03 control resolves across all normal stages", () => {
  const doc = readFileSync("docs/reference/mesh-json.md", "utf8");
  const block = doc.match(/## Complete example[\s\S]*?```json\n([\s\S]*?)\n```/)?.[1];
  const example = JSON.parse(block!);
  for (const stage of ["dev", "prod", "e2e"] as const) {
    expect(() => resolveMeshStage(example, stage, "docs/reference/mesh-json.md")).not.toThrow();
  }
});

it("V213-D05 quickstart export provides the promised resolved host URL", () => {
  const doc = readFileSync("docs/getting-started/service-quickstart.md", "utf8");
  const block = doc.match(/```json\n([\s\S]*?)\n```/)?.[1];
  const root = fixture(JSON.parse(block!));
  const exported = compileApplicationEnv("dev", root);
  expect(Object.values(exported).some(value => /^http:\/\/127\.0\.0\.1:\d+$/.test(value))).toBe(true);
});

it("V213-D05 control explicit app env reference exports the host URL", () => {
  const doc = readFileSync("docs/getting-started/service-quickstart.md", "utf8");
  const block = doc.match(/```json\n([\s\S]*?)\n```/)?.[1];
  const build = JSON.parse(block!);
  build.app.env = { PUBLIC_URL: "${app.endpoints.http.public_url}" };
  const root = fixture(build);
  expect(compileApplicationEnv("dev", root).PUBLIC_URL).toMatch(/^http:\/\/127\.0\.0\.1:\d+$/);
});

it("V213-004 default exported dev dotenv remains usable by service compilation", async () => {
  const root = fixture({ app: { endpoints: { http: http(3000, { publicPort: "AUTO" }) } } });
  const [file] = await handleExportEnv("dev", { projectDir: root });
  expect(file).toMatch(/\.env\.dev\.resolved$/);
  expect(existsSync(path.join(root, ".env.dev"))).toBe(false);
  expect(() => compileService("dev", root)).not.toThrow();
});

it("V213-004 control export contains Builder-owned execution keys", async () => {
  const root = fixture({ app: { endpoints: { http: http(3000, { publicPort: "AUTO" }) } } });
  const [file] = await handleExportEnv("dev", { projectDir: root });
  const content = readFileSync(file!, "utf8");
  expect(content).toContain("EXEC_MODE=");
  expect(content).toContain("INFRA_MODE=");
  expect(content).toContain("PORT=");
});

it("V213-004 control table-driven export across all stages keeps stage inputs usable", async () => {
  for (const stage of ["dev", "prod", "test", "e2e"] as const) {
    const root = fixture({
      app: { endpoints: { http: http(3000, { publicPort: "AUTO" }) } },
      tester: { env: { APP_URL: "${app.endpoints.http.public_url}" } },
    });
    const [file] = await handleExportEnv(stage, { projectDir: root });
    expect(file).toBe(path.join(root, `.env.${stage}.resolved`));
    expect(existsSync(path.join(root, `.env.${stage}`))).toBe(false);
    expect(() => compileService(stage, root)).not.toThrow();
  }
});

it("V213-004 control rejects choosing runtime .env.<stage> as alternate filename", async () => {
  const root = fixture({ app: { endpoints: { http: http(3000, { publicPort: "AUTO" }) } } });
  await handleExportEnv("dev", { projectDir: root });
  const prompt = vi.fn().mockResolvedValueOnce("n").mockResolvedValueOnce(".env.dev");
  await expect(handleExportEnv("dev", { projectDir: root, prompt })).rejects.toThrow(
    /cannot overwrite a runtime \.env\.<stage> input/i,
  );
  expect(existsSync(path.join(root, ".env.dev"))).toBe(false);
});

