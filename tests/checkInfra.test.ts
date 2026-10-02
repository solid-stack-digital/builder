import path from "node:path";
import { describe, expect, it } from "vitest"; 
import { getDeclaredYamlFiles } from "../src/core/checkers/getDeclaredYamlFiles.js";
import { checkYamlFiles } from "../src/core/checkers/checkYamlFiles.js";
import { explainComposeMergeFailure } from "../src/core/checkers/explainComposeMergeFailure.js";
import { getBuildJson } from "../src/utils/getBuildJson.js";
import type { BuildJson } from "../src/types/index.js";
import { checkInfra } from "../src/core/checkers/checkInfra.js";

const EXAMPLE_BACKEND_DIR = path.resolve(
  __dirname,
  "../examples/backend"
);


describe("checkInfra and focused checkers", () => {
  it("extracts declared YAML files purely from build.json without guessing directories", () => {
    const buildJson = getBuildJson(EXAMPLE_BACKEND_DIR);
    const declaredFiles = getDeclaredYamlFiles(buildJson, EXAMPLE_BACKEND_DIR);

    expect(declaredFiles.length).toBeGreaterThan(0);
    // All paths must come directly from build.json dependencies and overrides
    const relativePaths = declaredFiles.map((f) => f.relativePath);
    expect(relativePaths).toContain(".docker/mocks/docker-compose.filesystem.yml");
    expect(relativePaths).toContain(".docker/overrides/docker-compose.dev.override.yml");
    expect(relativePaths).toContain(".docker/overrides/docker-compose.prod.override.yml");
    expect(relativePaths).toContain(".docker/overrides/docker-compose.test.override.yml");
    expect(relativePaths).toContain(".docker/overrides/docker-compose.e2e.override.yml");
  });

  it("validates declared YAML files exist and have valid syntax", () => {
    const buildJson = getBuildJson(EXAMPLE_BACKEND_DIR);
    expect(() => checkYamlFiles(buildJson, EXAMPLE_BACKEND_DIR)).not.toThrow();
  });

  it("throws error when a declared YAML file in build.json does not exist", () => {
    const mockBuildJson: BuildJson = {
      name: "test-service",
      dependencies: {
        missingDep: {
          path: "non-existent/file.yml",
          service: "missing",
        },
      },
    };

    expect(() => checkYamlFiles(mockBuildJson, EXAMPLE_BACKEND_DIR)).toThrow(
      /declared in build\.json.*does not exist/
    );
  });

  it("explains compose merge failure looking only at declared files in build.json", () => {
    const buildJson = getBuildJson(EXAMPLE_BACKEND_DIR);
    const explanation = explainComposeMergeFailure(
      buildJson,
      EXAMPLE_BACKEND_DIR,
      "dev",
      [".docker/overrides/docker-compose.dev.override.yml"],
      'service "unknown-svc" has neither an image nor a build context specified'
    );

    expect(explanation).toContain("ROOT CAUSE");
    expect(explanation).toContain("Files declared in build.json");
    expect(explanation).toContain("HOW TO FIX");
  });

  it("successfully passes checkInfra for example backend", () => {
    expect(() => checkInfra(EXAMPLE_BACKEND_DIR)).not.toThrow();
  });
});
