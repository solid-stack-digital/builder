import path from "node:path";
import { describe, expect, it } from "vitest";
import { parse } from "yaml";
import { compileEnvironment } from "../src/core/compileEnvironment.js";

const EXAMPLE_BACKEND_DIR = path.resolve(__dirname, "../examples/backend");

describe("compileEnvironment integration", () => {
  it("compiles dev environment for example backend", () => {
    const yamlString = compileEnvironment("dev", EXAMPLE_BACKEND_DIR);
    expect(typeof yamlString).toBe("string");

    const parsed = parse(yamlString);
    expect(parsed.name).toBe("example-backend");
    expect(parsed.services).toBeDefined();
    expect(parsed.services.app).toBeDefined();
    expect(parsed.services.app.build.target).toBe("dev");
    expect(parsed.services.app.environment.ENVIRONMENT).toBe("dev");
    expect(parsed.services.app.environment.INFRA_MODE).toBe("isolated");
    expect(parsed.services.app.ports).toBeDefined();
  });

  it("compiles dev environment using relative path", () => {
    const relPath = path.relative(process.cwd(), EXAMPLE_BACKEND_DIR);
    const yamlString = compileEnvironment(
      "dev",
      relPath.startsWith(".") ? relPath : `./${relPath}`
    );
    const parsed = parse(yamlString);
    expect(parsed.name).toBe("example-backend");
    expect(parsed.services.app).toBeDefined();
  });

  it("compiles prod environment with mock dependencies", () => {
    const yamlString = compileEnvironment("prod", EXAMPLE_BACKEND_DIR);
    const parsed = parse(yamlString);

    expect(parsed.name).toBe("example-backend-prod");
    expect(parsed.services.app).toBeDefined();
    expect(parsed.services.app.build.target).toBe("prod");
    expect(parsed.services.app.environment.ENVIRONMENT).toBe("prod");
    expect(parsed.services.app.environment.INFRA_MODE).toBe("integrated");

    // Dependency "filesystem" should be merged and app should depend on it
    expect(parsed.services.filesystem).toBeDefined();
    expect(parsed.services.app.depends_on.filesystem).toEqual({
      condition: "service_healthy",
    });
  });

  it("compiles test environment with scoped stage project name", () => {
    const yamlString = compileEnvironment("test", EXAMPLE_BACKEND_DIR);
    const parsed = parse(yamlString);

    // H2: Stage-scoped project name prevents volume/container collision with dev
    expect(parsed.name).toBe("example-backend-test");
    expect(parsed.services.app).toBeDefined();
    expect(parsed.services.app.build.target).toBe("test");
    expect(parsed.services.app.environment.ENVIRONMENT).toBe("test");
    expect(parsed.services.app.environment.INFRA_MODE).toBe("isolated");
  });

  it("compiles e2e environment with tester service and scoped project name", () => {
    const yamlString = compileEnvironment("e2e", EXAMPLE_BACKEND_DIR);
    const parsed = parse(yamlString);

    // H2: Stage-scoped project name prevents volume/container collision with dev
    expect(parsed.name).toBe("example-backend-e2e");
    expect(parsed.services.app).toBeDefined();
    expect(parsed.services.app.build.target).toBe("prod");
    expect(parsed.services.tester).toBeDefined();
    expect(parsed.services.tester.build.target).toBe("test-e2e");
    expect(parsed.services.tester.depends_on.app).toEqual({
      condition: "service_started",
    });
  });

  it("respects build.json port when configured in standalone mode", async () => {
    const fs = await import("node:fs");
    const os = await import("node:os");
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "builder-test-"));
    try {
      fs.cpSync(EXAMPLE_BACKEND_DIR, tmpDir, { recursive: true });
      const buildJsonPath = path.join(tmpDir, "build.json");
      const buildJson = JSON.parse(fs.readFileSync(buildJsonPath, "utf-8"));
      buildJson.port = 8080;
      fs.writeFileSync(buildJsonPath, JSON.stringify(buildJson, null, 2));

      const yamlString = compileEnvironment("dev", tmpDir);
      const parsed = parse(yamlString);
      const ports = parsed.services.app.ports;
      const hasPort8080 = ports.some((p: any) =>
        typeof p === "string"
          ? p.includes("8080:3000")
          : String(p.published) === "8080" && p.target === 3000
      );
      expect(hasPort8080).toBe(true);
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it("injects templated envOverrides into tester service in e2e mode", async () => {
    const fs = await import("node:fs");
    const os = await import("node:os");
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "builder-e2e-test-"));
    try {
      fs.cpSync(EXAMPLE_BACKEND_DIR, tmpDir, { recursive: true });
      const buildJsonPath = path.join(tmpDir, "build.json");
      const buildJson = JSON.parse(fs.readFileSync(buildJsonPath, "utf-8"));
      buildJson.port = 8080;
      buildJson.tester = {
        envOverrides: {
          APP_URL: "${app.network_url}",
          APP_HOST_URL: "${app.public_url}",
          FS_URL: "${filesystem.network_url}",
        },
      };
      fs.writeFileSync(buildJsonPath, JSON.stringify(buildJson, null, 2));

      const yamlString = compileEnvironment("e2e", tmpDir);
      const parsed = parse(yamlString);
      const testerEnv = parsed.services.tester.environment;

      expect(testerEnv.APP_URL).toBe("http://app:3000");
      expect(testerEnv.APP_HOST_URL).toBe("http://localhost:8080");
      expect(testerEnv.FS_URL).toBe("http://filesystem:3000");
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it("throws clear ScriptError for unresolved template variable in individual tester", async () => {
    const fs = await import("node:fs");
    const os = await import("node:os");
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "builder-e2e-err-"));
    try {
      fs.cpSync(EXAMPLE_BACKEND_DIR, tmpDir, { recursive: true });
      const buildJsonPath = path.join(tmpDir, "build.json");
      const buildJson = JSON.parse(fs.readFileSync(buildJsonPath, "utf-8"));
      buildJson.tester = {
        envOverrides: {
          DB_URL: "${unknown_db.network_url}",
        },
      };
      fs.writeFileSync(buildJsonPath, JSON.stringify(buildJson, null, 2));

      expect(() => compileEnvironment("e2e", tmpDir)).toThrow(
        "[Local E2E Tester] Unresolved template variable: ${unknown_db.network_url}. Check build.json dependencies."
      );
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });
});
