import path from "node:path";
import { describe, expect, it, vi } from "vitest";
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

  it("compiles dev environment with --full flag enabling mock dependencies and integrated infra mode", () => {
    // Normal dev mode: no dependencies merged, isolated infra mode
    const normalDev = parse(compileEnvironment("dev", EXAMPLE_BACKEND_DIR));
    expect(normalDev.services.filesystem).toBeUndefined();
    expect(normalDev.services.app.environment.INFRA_MODE).toBe("isolated");
    expect(normalDev.services.app.depends_on).toBeUndefined();

    // Full dev mode: dependencies merged, depends_on attached, integrated infra mode
    const fullDev = parse(compileEnvironment("dev", EXAMPLE_BACKEND_DIR, { full: true }));
    expect(fullDev.name).toBe("example-backend");
    expect(fullDev.services.app).toBeDefined();
    expect(fullDev.services.app.build.target).toBe("dev");
    expect(fullDev.services.app.environment.ENVIRONMENT).toBe("dev");
    expect(fullDev.services.app.environment.INFRA_MODE).toBe("integrated");
    expect(fullDev.services.filesystem).toBeDefined();
    expect(fullDev.services.app.depends_on.filesystem).toEqual({
      condition: "service_healthy",
    });
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

  it("supports dependency network_url and app network_url templating in tester envOverrides", async () => {
    const fs = await import("node:fs");
    const os = await import("node:os");
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "builder-e2e-user-"));
    try {
      fs.cpSync(EXAMPLE_BACKEND_DIR, tmpDir, { recursive: true });
      const buildJsonPath = path.join(tmpDir, "build.json");
      const buildJson = JSON.parse(fs.readFileSync(buildJsonPath, "utf-8"));
      buildJson.name = "backend";
      buildJson.port = 3000;
      buildJson.dependencies = {
        auth: {
          path: ".docker/mocks/docker-compose.filesystem.yml",
        },
      };
      buildJson.tester = {
        envOverrides: {
          AUTH_URL: "${auth.network_url}",
          API_URL: "${app.network_url}",
        },
      };
      fs.writeFileSync(buildJsonPath, JSON.stringify(buildJson, null, 2));

      const yamlString = compileEnvironment("e2e", tmpDir);
      const parsed = parse(yamlString);
      const testerEnv = parsed.services.tester.environment;

      expect(testerEnv.AUTH_URL).toBe("http://auth:3000");
      expect(testerEnv.API_URL).toBe("http://app:3000");
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it("injects templated envOverrides into app service", async () => {
    const fs = await import("node:fs");
    const os = await import("node:os");
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "builder-app-env-"));
    try {
      fs.cpSync(EXAMPLE_BACKEND_DIR, tmpDir, { recursive: true });
      const buildJsonPath = path.join(tmpDir, "build.json");
      const buildJson = JSON.parse(fs.readFileSync(buildJsonPath, "utf-8"));
      buildJson.port = 8080;
      buildJson.envOverrides = {
        MY_PUBLIC_URL: "${app.public_url}",
        INTERNAL_API: "${app.network_url}",
        FS_URL: "${filesystem.network_url}",
      };
      fs.writeFileSync(buildJsonPath, JSON.stringify(buildJson, null, 2));

      const yamlString = compileEnvironment("dev", tmpDir);
      const parsed = parse(yamlString);
      const appEnv = parsed.services.app.environment;

      expect(appEnv.MY_PUBLIC_URL).toBe("http://localhost:8080");
      expect(appEnv.INTERNAL_API).toBe("http://app:3000");
      expect(appEnv.FS_URL).toBe("http://filesystem:3000");

      const buildArgs = parsed.services.app.build.args;
      expect(buildArgs.MY_PUBLIC_URL).toBe("http://localhost:8080");
      expect(buildArgs.INTERNAL_API).toBe("http://app:3000");
      expect(buildArgs.FS_URL).toBe("http://filesystem:3000");
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
        "[Tester EnvOverrides] Unresolved template variable: ${unknown_db.network_url}. Check build.json dependencies."
      );
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it("compiles e2e environment with tester in network_mode host", () => {
    const yamlString = compileEnvironment("e2e", EXAMPLE_BACKEND_DIR);
    const parsed = parse(yamlString);
    expect(parsed.services.tester.network_mode).toBe("host");
  });

  it("exposes app port in e2e mode when port is defined in build.json", async () => {
    const fs = await import("node:fs");
    const os = await import("node:os");
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "builder-e2e-port-"));
    try {
      fs.cpSync(EXAMPLE_BACKEND_DIR, tmpDir, { recursive: true });
      const buildJsonPath = path.join(tmpDir, "build.json");
      const buildJson = JSON.parse(fs.readFileSync(buildJsonPath, "utf-8"));
      buildJson.port = 8080;
      fs.writeFileSync(buildJsonPath, JSON.stringify(buildJson, null, 2));

      const yamlString = compileEnvironment("e2e", tmpDir);
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

  it("throws clear ScriptError when referencing public_url of service without port in build.json", async () => {
    const fs = await import("node:fs");
    const os = await import("node:os");
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "builder-e2e-nopub-"));
    try {
      fs.cpSync(EXAMPLE_BACKEND_DIR, tmpDir, { recursive: true });
      const buildJsonPath = path.join(tmpDir, "build.json");
      const buildJson = JSON.parse(fs.readFileSync(buildJsonPath, "utf-8"));
      delete buildJson.port;
      buildJson.tester = {
        envOverrides: {
          API_URL: "${app.public_url}",
        },
      };
      fs.writeFileSync(buildJsonPath, JSON.stringify(buildJson, null, 2));

      expect(() => compileEnvironment("e2e", tmpDir)).toThrow(
        '[Tester EnvOverrides] Unresolved template variable: ${app.public_url}. Service "app" does not expose a public port (missing \'port\' explicitly defined in build.json).'
      );
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it("logs warning when .network_url is passed to tester envOverrides and can be silenced", async () => {
    const fs = await import("node:fs");
    const os = await import("node:os");
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "builder-e2e-warn-"));
    try {
      fs.cpSync(EXAMPLE_BACKEND_DIR, tmpDir, { recursive: true });
      const buildJsonPath = path.join(tmpDir, "build.json");
      const buildJson = JSON.parse(fs.readFileSync(buildJsonPath, "utf-8"));
      buildJson.tester = {
        envOverrides: {
          API_URL: "${app.network_url}",
        },
      };
      fs.writeFileSync(buildJsonPath, JSON.stringify(buildJson, null, 2));

      const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

      // Without silenceWarnings
      compileEnvironment("e2e", tmpDir);
      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining("Since the tester runs in 'network_mode: host'")
      );

      warnSpy.mockClear();

      // With silenceWarnings: true
      compileEnvironment("e2e", tmpDir, { silenceWarnings: true });
      expect(warnSpy).not.toHaveBeenCalled();

      warnSpy.mockRestore();
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it("injects dependency port mappings and supports dependency public_url templating", async () => {
    const fs = await import("node:fs");
    const os = await import("node:os");
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "builder-dep-port-"));
    try {
      fs.cpSync(EXAMPLE_BACKEND_DIR, tmpDir, { recursive: true });
      const buildJsonPath = path.join(tmpDir, "build.json");
      const buildJson = JSON.parse(fs.readFileSync(buildJsonPath, "utf-8"));
      buildJson.dependencies = {
        filesystem: {
          path: ".docker/mocks/docker-compose.filesystem.yml",
          service: "mock-filesystem",
          port: "9000:3000",
        },
      };
      buildJson.envOverrides = {
        FS_PUBLIC: "${filesystem.public_url}",
      };
      fs.writeFileSync(buildJsonPath, JSON.stringify(buildJson, null, 2));

      const yamlString = compileEnvironment("prod", tmpDir);
      const parsed = parse(yamlString);

      expect(parsed.services.filesystem.ports).toBeDefined();
      const hasPort9000 = parsed.services.filesystem.ports.some((p: any) =>
        typeof p === "string"
          ? p.includes("9000:3000")
          : String(p.published) === "9000" && p.target === 3000
      );
      expect(hasPort9000).toBe(true);
      expect(parsed.services.app.environment.FS_PUBLIC).toBe("http://localhost:9000");
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it("handles numeric dependency port defaulting to :3000", async () => {
    const fs = await import("node:fs");
    const os = await import("node:os");
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "builder-num-port-"));
    try {
      fs.cpSync(EXAMPLE_BACKEND_DIR, tmpDir, { recursive: true });
      const buildJsonPath = path.join(tmpDir, "build.json");
      const buildJson = JSON.parse(fs.readFileSync(buildJsonPath, "utf-8"));
      buildJson.dependencies = {
        filesystem: {
          path: ".docker/mocks/docker-compose.filesystem.yml",
          service: "mock-filesystem",
          port: 5432,
        },
      };
      fs.writeFileSync(buildJsonPath, JSON.stringify(buildJson, null, 2));

      const yamlString = compileEnvironment("prod", tmpDir);
      const parsed = parse(yamlString);

      expect(parsed.services.filesystem.ports).toBeDefined();
      const hasPort5432 = parsed.services.filesystem.ports.some((p: any) =>
        typeof p === "string"
          ? p.includes("5432:3000")
          : String(p.published) === "5432" && p.target === 3000
      );
      expect(hasPort5432).toBe(true);
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });
});
