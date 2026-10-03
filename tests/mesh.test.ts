import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { parse } from "yaml";
import { createCli } from "../src/cli.js";
import { handleMeshCheck } from "../src/commands/mesh/commands/check/handler.js";
import { handleMeshUp } from "../src/commands/mesh/commands/up/handler.js";
import { checkMesh } from "../src/core/mesh/checkers/checkMesh.js";
import { checkMeshJson } from "../src/core/mesh/checkers/checkMeshJson.js";
import { compileMeshEnvironment } from "../src/core/mesh/compileMeshEnvironment.js";
import { getMeshJson } from "../src/core/mesh/getMeshJson.js";
import { NotFoundError } from "../src/errors/NotFoundError.js";
import { ScriptError } from "../src/errors/ScriptError.js";

const LARGE_PROJECT_DIR = path.resolve(__dirname, "../examples/largeProject");

describe("Mesh orchestration and verification", () => {
  describe("getMeshJson & checkMeshJson", () => {
    it("loads and parses valid mesh.json", () => {
      const mesh = getMeshJson(LARGE_PROJECT_DIR);
      expect(mesh).toBeDefined();
      expect(mesh.services).toBeDefined();
      expect(mesh.services["auth-api"]).toBeDefined();
      expect(mesh.services.backend).toBeDefined();
      expect(mesh.tester).toBeDefined();
    });

    it("throws NotFoundError when mesh.json is missing", () => {
      expect(() => getMeshJson("/tmp")).toThrow(NotFoundError);
    });

    it("throws ScriptError when services are empty or invalid", () => {
      expect(() => checkMeshJson({ services: {} } as any)).toThrow(ScriptError);
      expect(() =>
        checkMeshJson({
          services: { invalidService: {} as any },
        } as any)
      ).toThrow(ScriptError);
    });

    it("detects dependency cycles in checkMeshJson (H9)", () => {
      const cyclicMesh = {
        services: {
          svcA: { path: "./services/svcA", provideDependency: { depB: "svcB" } },
          svcB: { path: "./services/svcB", provideDependency: { depA: "svcA" } },
        },
      };
      expect(() => checkMeshJson(cyclicMesh as any)).toThrow(
        /Dependency cycle detected in mesh\.json/
      );
    });

    it("validates provider targets exist in mesh.services (H9)", () => {
      const invalidTarget = {
        services: {
          svcA: { path: "./services/svcA", provideDependency: { depB: "nonexistent" } },
        },
      };
      expect(() => checkMeshJson(invalidTarget as any)).toThrow(
        /nonexistent service "nonexistent"/
      );
    });
  });

  describe("checkMesh checker suite", () => {
    it("passes all checks for examples/largeProject", () => {
      expect(() =>
        checkMesh(LARGE_PROJECT_DIR, { requireTester: true })
      ).not.toThrow();
    });
  });

  describe("compileMeshEnvironment", () => {
    it("compiles DEV mesh environment with hot reload and dependency overrides", () => {
      const { yaml } = compileMeshEnvironment("dev", LARGE_PROJECT_DIR);
      const parsed = parse(yaml);

      expect(parsed.name).toBe("largeproject");
      expect(parsed.services["auth-api-app"]).toBeDefined();
      expect(parsed.services["auth-api-filesystem"]).toBeDefined();
      expect(parsed.services["backend-app"]).toBeDefined();
      expect(parsed.services["backend-filesystem"]).toBeDefined();

      const authApi = parsed.services["auth-api-app"];
      expect(authApi.environment.INFRA_MODE).toBe("integrated");
      expect(authApi.environment.EXEC_MODE).toBe("dev");
      expect(authApi.depends_on["auth-api-filesystem"]).toBeDefined();

      const backend = parsed.services["backend-app"];
      expect(backend.environment.INFRA_MODE).toBe("integrated");
      expect(backend.environment.EXEC_MODE).toBe("dev");
      expect(backend.environment.AUTH_API_URL).toBe("http://auth-api:3000");

      // Dependency override verification: backend depends on auth-api-app and its own mock filesystem
      expect(backend.depends_on["auth-api-app"]).toBeDefined();
      expect(backend.depends_on["backend-filesystem"]).toBeDefined();

      // Dev hot-reloading bind mounts
      const backendVols = backend.volumes.map((v: any) =>
        typeof v === "string" ? v : v.target
      );
      expect(backendVols).toContain("/app/node_modules");

      // Verify networks are isolated
      expect(parsed.networks["auth-api_net"]).toBeDefined();
      expect(parsed.networks.backend_net).toBeDefined();
      expect(parsed.networks.mesh).toBeDefined();
    });

    it("compiles PROD mesh environment with global tester included", () => {
      const { yaml, testerServiceName } = compileMeshEnvironment(
        "prod",
        LARGE_PROJECT_DIR,
        { includeTester: true }
      );
      const parsed = parse(yaml);

      expect(testerServiceName).toBe("global-e2e");
      expect(parsed.services["global-e2e"]).toBeDefined();

      const tester = parsed.services["global-e2e"];
      expect(tester.depends_on["auth-api-app"]).toBeDefined();
      expect(tester.depends_on["backend-app"]).toBeDefined();

      const backend = parsed.services["backend-app"];
      expect(backend.environment.EXEC_MODE).toBe("prod");
      expect(backend.environment.INFRA_MODE).toBe("integrated");
    });

    it("injects PORT env var and sets healthcheck to configured port (H7)", () => {
      const { yaml } = compileMeshEnvironment("dev", LARGE_PROJECT_DIR);
      const parsed = parse(yaml);

      const backend = parsed.services["backend-app"];
      expect(backend.environment.PORT).toBe("3000");
      const hasPort3000 = backend.ports.some((p: any) =>
        typeof p === "string"
          ? p.includes("3000")
          : p.target === 3000 || p.published === "3000"
      );
      expect(hasPort3000).toBe(true);
      expect(backend.healthcheck.test.join(" ")).toContain("3000");
    });

    it("handles port precedence: mesh port overrides build.json port, preservePort uses build.json port, absence exposes no host port", () => {
      const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "mesh-port-test-"));
      try {
        fs.cpSync(LARGE_PROJECT_DIR, tmpDir, { recursive: true });

        // Give auth-api a port in build.json
        const authBuildJsonPath = path.join(tmpDir, "services/auth-api/build.json");
        const authBuildJson = JSON.parse(fs.readFileSync(authBuildJsonPath, "utf-8"));
        authBuildJson.port = 4001;
        fs.writeFileSync(authBuildJsonPath, JSON.stringify(authBuildJson, null, 2));

        // Give backend a port in build.json
        const backendBuildJsonPath = path.join(tmpDir, "services/backend/build.json");
        const backendBuildJson = JSON.parse(fs.readFileSync(backendBuildJsonPath, "utf-8"));
        backendBuildJson.port = 5001;
        fs.writeFileSync(backendBuildJsonPath, JSON.stringify(backendBuildJson, null, 2));

        // Update mesh.json
        // auth-api: preservePort: true -> should use 4001
        // backend: port: 8080, preservePort: true -> mesh port 8080 should override 5001
        const meshJsonPath = path.join(tmpDir, "mesh.json");
        const meshJson = JSON.parse(fs.readFileSync(meshJsonPath, "utf-8"));
        meshJson.services["auth-api"].preservePort = true;
        meshJson.services.backend.port = 8080;
        meshJson.services.backend.preservePort = true;
        fs.writeFileSync(meshJsonPath, JSON.stringify(meshJson, null, 2));

        const { yaml } = compileMeshEnvironment("dev", tmpDir);
        const parsed = parse(yaml);

        const authApp = parsed.services["auth-api-app"];
        expect(authApp.environment.PORT).toBe("3000");
        const hasAuth4001 = authApp.ports.some((p: any) =>
          typeof p === "string"
            ? p.includes("4001:3000")
            : String(p.published) === "4001" && p.target === 3000
        );
        expect(hasAuth4001).toBe(true);

        const backendApp = parsed.services["backend-app"];
        expect(backendApp.environment.PORT).toBe("3000");
        const hasBackend8080 = backendApp.ports.some((p: any) =>
          typeof p === "string"
            ? p.includes("8080:3000")
            : String(p.published) === "8080" && p.target === 3000
        );
        expect(hasBackend8080).toBe(true);
      } finally {
        fs.rmSync(tmpDir, { recursive: true, force: true });
      }
    });

    it("does not expose host ports if port and preservePort are absent", () => {
      const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "mesh-no-port-test-"));
      try {
        fs.cpSync(LARGE_PROJECT_DIR, tmpDir, { recursive: true });

        const meshJsonPath = path.join(tmpDir, "mesh.json");
        const meshJson = JSON.parse(fs.readFileSync(meshJsonPath, "utf-8"));
        delete meshJson.services.backend.port;
        delete meshJson.services.backend.preservePort;
        delete meshJson.services["auth-api"].port;
        delete meshJson.services["auth-api"].preservePort;
        fs.writeFileSync(meshJsonPath, JSON.stringify(meshJson, null, 2));

        const { yaml } = compileMeshEnvironment("dev", tmpDir);
        const parsed = parse(yaml);

        expect(parsed.services["auth-api-app"].ports).toBeUndefined();
        expect(parsed.services["backend-app"].ports).toBeUndefined();
        expect(parsed.services["auth-api-app"].environment.PORT).toBe("3000");
        expect(parsed.services["backend-app"].environment.PORT).toBe("3000");
      } finally {
        fs.rmSync(tmpDir, { recursive: true, force: true });
      }
    });

    it("interpolates URL templates in service envOverrides and tester envOverrides", () => {
      const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "mesh-template-test-"));
      try {
        fs.cpSync(LARGE_PROJECT_DIR, tmpDir, { recursive: true });

        const meshJsonPath = path.join(tmpDir, "mesh.json");
        const meshJson = JSON.parse(fs.readFileSync(meshJsonPath, "utf-8"));
        meshJson.services.backend.port = 8080;
        meshJson.services.backend.envOverrides = {
          AUTH_URL: "${auth-api.network_url}",
        };
        meshJson.tester = meshJson.tester || { path: "./e2e" };
        meshJson.tester.envOverrides = {
          AUTH_URL: "${auth-api.network_url}",
          BACKEND_URL: "${backend.public_url}",
          BACKEND_VIA_GATEWAY_URL: "${backend.public_url}/api",
        };
        fs.writeFileSync(meshJsonPath, JSON.stringify(meshJson, null, 2));

        const { yaml } = compileMeshEnvironment("prod", tmpDir, { includeTester: true });
        const parsed = parse(yaml);

        const backend = parsed.services["backend-app"];
        expect(backend.environment.AUTH_URL).toBe("http://auth-api:3000");

        const tester = parsed.services["global-e2e"];
        expect(tester.environment.AUTH_URL).toBe("http://auth-api:3000");
        expect(tester.environment.BACKEND_URL).toBe("http://localhost:8080");
        expect(tester.environment.BACKEND_VIA_GATEWAY_URL).toBe("http://localhost:8080/api");
      } finally {
        fs.rmSync(tmpDir, { recursive: true, force: true });
      }
    });

    it("throws clear ScriptError for unresolved template with nonexistent service", () => {
      const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "mesh-template-err-test-"));
      try {
        fs.cpSync(LARGE_PROJECT_DIR, tmpDir, { recursive: true });

        const meshJsonPath = path.join(tmpDir, "mesh.json");
        const meshJson = JSON.parse(fs.readFileSync(meshJsonPath, "utf-8"));
        meshJson.services.backend.envOverrides = {
          UNKNOWN_URL: "${unknown-service.network_url}",
        };
        fs.writeFileSync(meshJsonPath, JSON.stringify(meshJson, null, 2));

        expect(() => compileMeshEnvironment("dev", tmpDir)).toThrow(
          'Unresolved template variable: ${unknown-service.network_url}. Service "unknown-service" is not defined in mesh.json.'
        );
      } finally {
        fs.rmSync(tmpDir, { recursive: true, force: true });
      }
    });

    it("throws clear ScriptError when referencing public_url of service that does not expose a public port", () => {
      const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "mesh-template-nopub-test-"));
      try {
        fs.cpSync(LARGE_PROJECT_DIR, tmpDir, { recursive: true });

        const meshJsonPath = path.join(tmpDir, "mesh.json");
        const meshJson = JSON.parse(fs.readFileSync(meshJsonPath, "utf-8"));
        // auth-api has no port or preservePort
        delete meshJson.services["auth-api"].port;
        delete meshJson.services["auth-api"].preservePort;

        meshJson.services.backend.envOverrides = {
          AUTH_PUB_URL: "${auth-api.public_url}",
        };
        fs.writeFileSync(meshJsonPath, JSON.stringify(meshJson, null, 2));

        expect(() => compileMeshEnvironment("dev", tmpDir)).toThrow(
          'Unresolved template variable: ${auth-api.public_url}. Service "auth-api" does not expose a public port (missing \'port\' or \'preservePort\' in mesh.json).'
        );
      } finally {
        fs.rmSync(tmpDir, { recursive: true, force: true });
      }
    });
  });

  describe("CLI mesh commands and handlers", () => {
    it("registers mesh command and its subcommands", () => {
      const cli = createCli();
      const meshCmd = cli.commands.find((c) => c.name() === "mesh");
      expect(meshCmd).toBeDefined();

      const subcommands = meshCmd?.commands.map((c) => c.name());
      expect(subcommands).toContain("up");
      expect(subcommands).toContain("down");
      expect(subcommands).toContain("check");
    });

    it("handles mesh check command successfully", async () => {
      const exitCode = await handleMeshCheck({
        projectDir: LARGE_PROJECT_DIR,
        requireTester: true,
      });
      expect(exitCode).toBe(0);
    });

    it("handles mesh up dev with dry-run", async () => {
      const exitCode = await handleMeshUp("dev", {
        projectDir: LARGE_PROJECT_DIR,
        dryRun: true,
      });
      expect(exitCode).toBe(0);
    });

    it("handles mesh up prod with dry-run", async () => {
      const exitCode = await handleMeshUp("prod", {
        projectDir: LARGE_PROJECT_DIR,
        dryRun: true,
      });
      expect(exitCode).toBe(0);
    });

    it("handles mesh up test-unit with dry-run", async () => {
      const exitCode = await handleMeshUp("test-unit", {
        projectDir: LARGE_PROJECT_DIR,
        dryRun: true,
      });
      expect(exitCode).toBe(0);
    });

    it("handles mesh up test-e2e with dry-run", async () => {
      const exitCode = await handleMeshUp("test-e2e", {
        projectDir: LARGE_PROJECT_DIR,
        dryRun: true,
      });
      expect(exitCode).toBe(0);
    });

    it("handles mesh up test with dry-run", async () => {
      const exitCode = await handleMeshUp("test", {
        projectDir: LARGE_PROJECT_DIR,
        dryRun: true,
      });
      expect(exitCode).toBe(0);
    });

    it("rejects invalid mesh stages", async () => {
      await expect(
        handleMeshUp("invalid-stage", { projectDir: LARGE_PROJECT_DIR })
      ).rejects.toThrow(ScriptError);
    });

    it("handles mesh down command successfully", async () => {
      const { handleMeshDown } = await import(
        "../src/commands/mesh/commands/down/handler.js"
      );
      const exitCode = await handleMeshDown("dev", {
        projectDir: LARGE_PROJECT_DIR,
      });
      expect(exitCode).toBe(0);
    });

    it("rejects invalid mesh stages in mesh down", async () => {
      const { handleMeshDown } = await import(
        "../src/commands/mesh/commands/down/handler.js"
      );
      await expect(
        handleMeshDown("invalid-stage", { projectDir: LARGE_PROJECT_DIR })
      ).rejects.toThrow(ScriptError);
    });
  });
});
