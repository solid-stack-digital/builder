import path from "node:path";
import os from "node:os";
import { describe, expect, it } from "vitest";
import { normalizeProjectName, deriveProjectName } from "../src/utils/projectName.js";
import { resolveProjectDir, toComposePath, isBindMount, isPathInside } from "../src/utils/paths.js";
import { extractOverrides } from "../src/utils/extractOverrides.js";
import { redactYamlSecrets } from "../src/utils/redactSecrets.js";
import { checkYamlFiles } from "../src/core/checkers/checkYamlFiles.js";
import { ScriptError } from "../src/errors/ScriptError.js";

describe("Audit-1 fixes unit test suite", () => {
  describe("Project name normalization & stage derivation (H2, M8)", () => {
    it("normalizes names starting with non-alphanumerics", () => {
      expect(normalizeProjectName("@scope/my-pkg")).toBe("scope-my-pkg");
      expect(normalizeProjectName("-leading-hyphen")).toBe("leading-hyphen");
      expect(normalizeProjectName("___under_score___")).toBe("under_score");
      expect(normalizeProjectName("My Awesome App")).toBe("my-awesome-app");
    });

    it("falls back to 'project' when name is empty or only special characters", () => {
      expect(normalizeProjectName("")).toBe("project");
      expect(normalizeProjectName("---")).toBe("project");
      expect(normalizeProjectName("@@@")).toBe("project");
    });

    it("derives stage-scoped names for test and e2e to prevent volume collision", () => {
      expect(deriveProjectName("my-app", "dev")).toBe("my-app");
      expect(deriveProjectName("my-app", "prod")).toBe("my-app");
      expect(deriveProjectName("my-app", "test")).toBe("my-app-test");
      expect(deriveProjectName("my-app", "test-unit")).toBe("my-app-test");
      expect(deriveProjectName("my-app", "e2e")).toBe("my-app-e2e");
      expect(deriveProjectName("my-app", "test-e2e")).toBe("my-app-e2e");
    });
  });

  describe("Paths and bind mount detection (H1, H8, L11)", () => {
    it("correctly identifies host bind mounts vs named volumes", () => {
      expect(isBindMount("./local-dir")).toBe(true);
      expect(isBindMount("../parent-dir")).toBe(true);
      expect(isBindMount("/absolute/path")).toBe(true);
      expect(isBindMount("~/home-path")).toBe(true);
      expect(isBindMount("C:\\windows\\path")).toBe(true);
      expect(isBindMount("D:/windows/path")).toBe(true);

      // Named volumes
      expect(isBindMount("db_data")).toBe(false);
      expect(isBindMount("redis_cache_vol")).toBe(false);
      expect(isBindMount("postgres-storage")).toBe(false);
    });

    it("toComposePath normalizes to POSIX paths with leading ./", () => {
      const base = path.resolve("/app/mesh");
      expect(toComposePath(base, path.resolve("/app/mesh/services/backend"))).toBe(
        "./services/backend"
      );
      expect(toComposePath(base, base)).toBe(".");
    });

    it("isPathInside validates path containment", () => {
      const root = path.resolve("/workspace/project");
      expect(isPathInside(root, "/workspace/project/Dockerfile")).toBe(true);
      expect(isPathInside(root, "/workspace/project/services/sub")).toBe(true);
      expect(isPathInside(root, "/workspace/other")).toBe(false);
      expect(isPathInside(root, "/etc/passwd")).toBe(false);
    });
  });

  describe("extractOverrides validation (M13)", () => {
    it("accepts valid stages (dev, prod, test, e2e)", () => {
      const buildJson = {
        overrides: {
          dev: { path: ".docker/dev.override.yml" },
          prod: { path: ".docker/prod.override.yml" },
        },
      };
      const res = extractOverrides(buildJson, "/fake");
      expect(res.dev).toBeDefined();
      expect(res.prod).toBeDefined();
    });

    it("rejects unknown stage overrides such as 'prd' or 'production'", () => {
      const buildJson = {
        overrides: {
          prd: { path: ".docker/dev.override.yml" },
        },
      };
      expect(() => extractOverrides(buildJson, "/fake")).toThrow(ScriptError);
      expect(() => extractOverrides(buildJson, "/fake")).toThrow(/Unknown stage override/);
    });
  });

  describe("Secret redaction in debug logs (M10)", () => {
    it("redacts sensitive environment variables and tokens", () => {
      const yaml = `
services:
  app:
    environment:
      SECRET_KEY: super_secret_123
      API_TOKEN=xyz987
      DB_PASSWORD: mypassword
      AUTH_TOKEN: authsecret
      PUBLIC_PORT: 3000
`;
      const redacted = redactYamlSecrets(yaml);
      expect(redacted).toContain("SECRET_KEY: ********");
      expect(redacted).toContain("API_TOKEN=********");
      expect(redacted).toContain("DB_PASSWORD: ********");
      expect(redacted).toContain("AUTH_TOKEN: ********");
      expect(redacted).toContain("PUBLIC_PORT: 3000");
    });
  });

  describe("ScriptError causes and exit codes (L14)", () => {
    it("preserves cause and allows custom exitCode", () => {
      const cause = new Error("Disk full");
      const err = new ScriptError("Operation failed", { cause, exitCode: 42 });
      expect(err.message).toBe("Operation failed");
      expect(err.cause).toBe(cause);
      expect(err.exitCode).toBe(42);
    });
  });
});
