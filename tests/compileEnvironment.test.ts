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
});
