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
  });

  describe("CLI mesh commands and handlers", () => {
    it("registers mesh command and its subcommands", () => {
      const cli = createCli();
      const meshCmd = cli.commands.find((c) => c.name() === "mesh");
      expect(meshCmd).toBeDefined();

      const subcommands = meshCmd?.commands.map((c) => c.name());
      expect(subcommands).toContain("up");
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
  });
});
