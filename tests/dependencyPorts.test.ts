import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { parse } from "yaml";
import { buildJsonSchema } from "../src/core/buildSchema.js";
import { compileEnvironment } from "../src/core/compileEnvironment.js";
import { compileMeshEnvironment } from "../src/core/mesh/compileMeshEnvironment.js";
import { extractBuildDeps } from "../src/utils/extractBuildDeps.js";
import { getDependencyPortMappings, normalizePrimaryDependencyPort, parseExplicitPortMapping } from "../src/utils/dependencyPorts.js";

const BACKEND = path.resolve(__dirname, "../examples/backend");
const MESH = path.resolve(__dirname, "../examples/largeProject");

function fixture(source: string, run: (dir: string) => void): void {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "builder-aux-"));
  try {
    fs.cpSync(source, dir, { recursive: true });
    run(dir);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}
function editJson(file: string, edit: (json: any) => void): void {
  const json = JSON.parse(fs.readFileSync(file, "utf8"));
  edit(json);
  fs.writeFileSync(file, JSON.stringify(json, null, 2));
}

describe("dependency host ports", () => {
  it("normalizes primary ports and deduplicates exact mappings", () => {
    expect(normalizePrimaryDependencyPort(4080)).toEqual({ raw: "4080:3000", hostPort: 4080, containerPort: 3000 });
    expect(normalizePrimaryDependencyPort("4080").raw).toBe("4080:3000");
    expect(normalizePrimaryDependencyPort("4080:4000").raw).toBe("4080:4000");
    expect(getDependencyPortMappings({ port: "4080:4000", ports: ["4080:4000", "8080:8080"] }).map((p) => p.raw))
      .toEqual(["4080:4000", "8080:8080"]);
  });

  it.each(["8080", "0:8080", "65536:8080", "8080:0", "8080:65536", "abc:8080", "8080:abc", "127.0.0.1:8080:8080"])(
    "rejects invalid auxiliary mapping %s at schema, extraction, and parser",
    (value) => {
      expect(() => parseExplicitPortMapping(value)).toThrow();
      const config = { dependencies: { mock: { path: "./mock.yml", ports: [value] } } };
      expect(buildJsonSchema.safeParse(config).success).toBe(false);
      expect(() => extractBuildDeps(config)).toThrow(/dependencies\.mock\.ports/);
    }
  );

  it("extracts explicit mappings and rejects numeric auxiliary entries", () => {
    const deps = extractBuildDeps({ dependencies: { mock: { path: "./mock.yml", service: "mock", port: "4080:4000", ports: ["8080:8080"] } } }, "/tmp/project");
    expect(deps[0]).toMatchObject({ name: "mock", serviceName: "mock", path: "/tmp/project/mock.yml", port: "4080:4000", ports: ["8080:8080"] });
    expect(buildJsonSchema.safeParse({ dependencies: { mock: { path: "./mock.yml", ports: [8080] } } }).success).toBe(false);
  });

  it("uses only declared ports in standalone full and prod modes", () => fixture(BACKEND, (dir) => {
    editJson(path.join(dir, "build.json"), (json) => {
      json.dependencies.filesystem.port = "4080:4000";
      json.dependencies.filesystem.ports = ["8080:8080", "9150:9150"];
      json.envOverrides = { DEP_HOST: "filesystem:8080" };
    });
    for (const stage of ["dev", "prod"] as const) {
      const result = parse(compileEnvironment(stage, dir, { full: true }));
      expect(result.services.filesystem.ports).toEqual(["4080:4000", "8080:8080", "9150:9150"]);
      expect(result.services.app.environment.DEP_HOST).toBe("filesystem:8080");
      expect(result.services.app.build.args.DEP_HOST).toBe("filesystem:8080");
    }
    const isolated = parse(compileEnvironment("dev", dir));
    expect(isolated.services.filesystem).toBeUndefined();
    editJson(path.join(dir, "build.json"), (json) => { json.dependencies.filesystem.ports = ["4080:9090"]; });
    expect(() => compileEnvironment("prod", dir)).toThrow(/Port Collision Detected.*4080/);
  }));

  it("emits auxiliary mappings and mesh env precedence in dev and prod", () => fixture(MESH, (dir) => {
    const build = path.join(dir, "services/backend/build.json");
    editJson(build, (json) => {
      json.dependencies.filesystem.port = "4080:4000";
      json.dependencies.filesystem.ports = ["8080:8080", "9150:9150"];
      json.envOverrides = { BACKEND_URL: "${backend.network_url}", SERVICE_VALUE: "from-build-json" };
    });
    editJson(path.join(dir, "mesh.json"), (json) => {
      json.services.backend.envOverrides.SERVICE_VALUE = "from-mesh";
    });
    for (const stage of ["dev", "prod"] as const) {
      const result = parse(compileMeshEnvironment(stage, dir, { validateWithDocker: false }).yaml);
      expect(result.services["backend-filesystem"].ports).toEqual(["4080:4000", "8080:8080", "9150:9150"]);
      expect(result.services["backend-app"].environment).toMatchObject({ BACKEND_URL: "http://backend:3000", SERVICE_VALUE: "from-mesh" });
      expect(result.services["backend-app"].build.args).toMatchObject({ BACKEND_URL: "http://backend:3000", SERVICE_VALUE: "from-mesh" });
    }
  }));

  it("detects dependency collisions with mesh services and other dependencies", () => fixture(MESH, (dir) => {
    const build = path.join(dir, "services/backend/build.json");
    editJson(build, (json) => { json.dependencies.filesystem.ports = ["3000:8080"]; });
    expect(() => compileMeshEnvironment("dev", dir, { validateWithDocker: false })).toThrow(/Port Collision Detected.*3000/);
    editJson(build, (json) => { json.dependencies.filesystem.ports = ["8080:8080"]; });
    editJson(path.join(dir, "services/auth-api/build.json"), (json) => { json.dependencies.filesystem.ports = ["8080:9090"]; });
    expect(() => compileMeshEnvironment("dev", dir, { validateWithDocker: false })).toThrow(/Port Collision Detected.*8080.*auth-api.*backend/s);
  }));

  it("does not claim ports from a replaced local mock", () => fixture(MESH, (dir) => {
    editJson(path.join(dir, "services/backend/build.json"), (json) => {
      json.dependencies["auth-api"].ports = ["3000:8080"];
    });
    const result = parse(compileMeshEnvironment("dev", dir, { validateWithDocker: false }).yaml);
    expect(result.services["backend-auth-api"]).toBeUndefined();
  }));
});
