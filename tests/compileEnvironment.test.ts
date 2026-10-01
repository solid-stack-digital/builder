import path from "node:path";
import { describe, expect, it } from "vitest";
import { parse } from "yaml";
import { compileEnvironment } from "../src/core/compileEnvironment.js";

const BACKEND_DIR = path.resolve(
  __dirname,
  "../../agnostic-build-sys/services/backend"
);

describe("compileEnvironment integration", () => {
  it("compiles dev environment", () => {
    const yamlString = compileEnvironment("dev", BACKEND_DIR);
    expect(typeof yamlString).toBe("string");

    const parsed = parse(yamlString);
    expect(parsed.name).toBe("backend");
    expect(parsed.services).toBeDefined();
    expect(parsed.services.app).toBeDefined();
    expect(parsed.services.app.build.target).toBe("dev");
    expect(parsed.services.app.environment.EXEC_MODE).toBe("dev");
    expect(parsed.services.app.environment.INFRA_MODE).toBe("isolated");
    expect(parsed.services.app.ports).toBeDefined();
  });

  it("compiles prod environment with mock dependencies", () => {
    const yamlString = compileEnvironment("prod", BACKEND_DIR);
    const parsed = parse(yamlString);

    expect(parsed.name).toBe("backend");
    expect(parsed.services.app).toBeDefined();
    expect(parsed.services.app.build.target).toBe("prod");
    expect(parsed.services.app.environment.EXEC_MODE).toBe("prod");
    expect(parsed.services.app.environment.INFRA_MODE).toBe("integrated");

    // Dependency "filesystem" should be merged and app should depend on it
    expect(parsed.services.filesystem).toBeDefined();
    expect(parsed.services.app.depends_on.filesystem).toEqual({
      condition: "service_healthy",
    });
  });

  it("compiles test environment", () => {
    const yamlString = compileEnvironment("test", BACKEND_DIR);
    const parsed = parse(yamlString);

    expect(parsed.name).toBe("backend");
    expect(parsed.services.app).toBeDefined();
    expect(parsed.services.app.build.target).toBe("test");
    expect(parsed.services.app.environment.EXEC_MODE).toBe("test");
    expect(parsed.services.app.environment.INFRA_MODE).toBe("isolated");
  });

  it("compiles e2e environment with tester service", () => {
    const yamlString = compileEnvironment("e2e", BACKEND_DIR);
    const parsed = parse(yamlString);

    expect(parsed.name).toBe("backend");
    expect(parsed.services.app).toBeDefined();
    expect(parsed.services.app.build.target).toBe("prod");
    expect(parsed.services.tester).toBeDefined();
    expect(parsed.services.tester.build.target).toBe("test-e2e");
    expect(parsed.services.tester.depends_on.app).toEqual({
      condition: "service_healthy",
    });
  });

  describe("example project (examples/backend)", () => {
    const EXAMPLE_BACKEND_DIR = path.resolve(__dirname, "../examples/backend");

    it("compiles dev environment for example backend", () => {
      const yamlString = compileEnvironment("dev", EXAMPLE_BACKEND_DIR);
      const parsed = parse(yamlString);

      expect(parsed.name).toBe("example-backend");
      expect(parsed.services.app).toBeDefined();
      expect(parsed.services.app.build.target).toBe("dev");
      expect(parsed.services.app.environment.ENVIRONMENT).toBe("dev");
    });

    it("compiles prod environment with mock filesystem for example backend", () => {
      const yamlString = compileEnvironment("prod", EXAMPLE_BACKEND_DIR);
      const parsed = parse(yamlString);

      expect(parsed.name).toBe("example-backend");
      expect(parsed.services.app).toBeDefined();
      expect(parsed.services.app.build.target).toBe("prod");
      expect(parsed.services.filesystem).toBeDefined();
      expect(parsed.services.app.depends_on.filesystem).toEqual({
        condition: "service_healthy",
      });
    });

    it("compiles test environment for example backend", () => {
      const yamlString = compileEnvironment("test", EXAMPLE_BACKEND_DIR);
      const parsed = parse(yamlString);

      expect(parsed.name).toBe("example-backend");
      expect(parsed.services.app).toBeDefined();
      expect(parsed.services.app.build.target).toBe("test");
    });

    it("compiles e2e environment for example backend", () => {
      const yamlString = compileEnvironment("e2e", EXAMPLE_BACKEND_DIR);
      const parsed = parse(yamlString);

      expect(parsed.name).toBe("example-backend");
      expect(parsed.services.app).toBeDefined();
      expect(parsed.services.tester).toBeDefined();
      expect(parsed.services.tester.build.target).toBe("test-e2e");
      expect(parsed.services.tester.depends_on.app).toEqual({
        condition: "service_healthy",
      });
    });
  });
});
