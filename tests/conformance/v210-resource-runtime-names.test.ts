import { afterEach, expect, it } from "vitest";
import { cleanupFixtures, compileMesh, compileService, dep, fixture, meshFixture } from "./fixture.js";
import { namespaceDependencyCompose } from "../../src/core/composition/namespaceDependencyCompose.js";
import { namespaceResourceDefinition } from "../../src/core/composition/namespaceResourceDefinition.js";

afterEach(cleanupFixtures);

it.each(["volumes", "networks", "configs", "secrets"] as const)(
  "V210-003 namespaces actual owned %s names",
  (kind) => {
    const refs = kind === "volumes" ? ["shared:/data"] : ["shared"];
    const definition = {
      name: "globally-shared",
      ...(["configs", "secrets"].includes(kind) ? { file: "./data.txt" } : {}),
    };
    const bundle = {
      services: { owner: { image: "alpine", healthcheck: { test: ["CMD", "true"] }, [kind]: refs } },
      [kind]: { shared: definition },
    };
    const root = fixture(
      { app: {}, dependencies: { first: dep("first.yml"), second: dep("second.yml") } },
      { "first.yml": bundle, "second.yml": bundle, "data.txt": "fixture" },
    );
    const result = compileService("prod", root);
    const actual = Object.entries(result.compose[kind] ?? {}).map(
      ([key, value]) => (value as { name?: string })?.name ?? `${result.projectName}_${key}`,
    );
    expect(new Set(actual).size).toBe(actual.length);
    const resourceKeys = Object.keys(result.compose[kind] ?? {}).filter((key) => key.endsWith("--shared"));
    expect(resourceKeys).toHaveLength(2);
    for (const dependencyName of ["first", "second"] as const) {
      const owner = result.endpoints.dependencies[dependencyName]!.api!.networkHost;
      const service = result.compose.services[owner]!;
      const key = resourceKeys.find((candidate) => candidate.includes(`--${dependencyName}--`))!;
      expect(key).toBeDefined();
      expect((result.compose[kind]![key] as { name?: string }).name).toBeUndefined();
      if (kind === "volumes") expect(service.volumes).toContain(`${key}:/data`);
      else if (kind === "networks") expect(service.networks).toHaveProperty(key);
      else expect(service[kind]).toContain(key);
    }
  },
);

it("preserves external resource identities while renaming Compose keys", () => {
  const document = {
    services: { owner: { image: "alpine", volumes: ["shared:/data", "named:/other"] } },
    volumes: { shared: { external: true }, named: { external: true, name: "existing-data" } },
  };
  const before = structuredClone(document);
  const result = namespaceDependencyCompose({ dependencyKey: "db", namespacePrefix: "dep--db", document });
  expect(result.document.volumes).toEqual({
    "dep--db--volume--shared": { external: true, name: "shared" },
    "dep--db--volume--named": { external: true, name: "existing-data" },
  });
  expect(result.document.services["dep--db--owner"]!.volumes)
    .toEqual(["dep--db--volume--shared:/data", "dep--db--volume--named:/other"]);
  expect(document).toEqual(before);
});

it("preserves owned resource options, files, and empty definitions", () => {
  expect(namespaceResourceDefinition("cache", { name: "fixed", driver: "local", driver_opts: { type: "tmpfs" } }))
    .toEqual({ driver: "local", driver_opts: { type: "tmpfs" } });
  expect(namespaceResourceDefinition("private", { name: "fixed", internal: true, ipam: { driver: "default" } }))
    .toEqual({ internal: true, ipam: { driver: "default" } });
  expect(namespaceResourceDefinition("token", { name: "fixed", file: "./token.txt" }))
    .toEqual({ file: "./token.txt" });
  expect(namespaceResourceDefinition("empty", null)).toBeNull();
  expect(namespaceResourceDefinition("empty", {})).toEqual({});
  expect(namespaceResourceDefinition("cache", { external: true, name: "shared-cache" }))
    .toEqual({ external: true, name: "shared-cache" });
});

it("uses distinct project-scoped physical names in independent standalone services", () => {
  const build = { app: {}, dependencies: { db: dep("db.yml") } };
  const bundle = {
    services: { owner: { image: "alpine", healthcheck: { test: ["CMD", "true"] }, volumes: ["data:/data"] } },
    volumes: { data: { name: "global-data", driver: "local" } },
  };
  const first = compileService("prod", fixture(build, { "db.yml": bundle }));
  const second = compileService("prod", fixture(build, { "db.yml": bundle }));
  const [firstKey] = Object.keys(first.compose.volumes!);
  const [secondKey] = Object.keys(second.compose.volumes!);
  expect((first.compose.volumes![firstKey!] as { name?: string }).name).toBeUndefined();
  expect((second.compose.volumes![secondKey!] as { name?: string }).name).toBeUndefined();
  expect(`${first.projectName}_${firstKey}`).not.toBe(`${second.projectName}_${secondKey}`);
});

it("keeps mesh services' owned resources distinct and suppresses substituted bundles", () => {
  const build = { app: {}, dependencies: { db: dep("db.yml") } };
  const bundle = {
    services: { owner: { image: "alpine", healthcheck: { test: ["CMD", "true"] }, volumes: ["data:/data"] } },
    volumes: { data: { name: "global-data" } },
  };
  const root = meshFixture(
    { services: { alpha: { path: "alpha" }, beta: { path: "beta" } } },
    { alpha: build, beta: build },
    { "alpha/db.yml": bundle, "beta/db.yml": bundle },
  );
  const result = compileMesh("prod", root);
  const keys = Object.keys(result.compose.volumes ?? {}).filter((key) => key.endsWith("--data"));
  expect(keys).toHaveLength(2);
  expect(keys[0]).not.toBe(keys[1]);
  for (const key of keys) expect((result.compose.volumes![key] as { name?: string }).name).toBeUndefined();

  const substituted = meshFixture(
    { services: { alpha: { path: "alpha", dependencies: { db: "beta" } }, beta: { path: "beta" } } },
    { alpha: build, beta: build },
    { "alpha/db.yml": bundle, "beta/db.yml": bundle },
  );
  const substitutedKeys = Object.keys(compileMesh("prod", substituted).compose.volumes ?? {});
  expect(substitutedKeys.some((key) => key.includes("svc--alpha--dep--db"))).toBe(false);
  expect(substitutedKeys.some((key) => key.includes("svc--beta--dep--db"))).toBe(true);
});

it("scopes app override resources in both inherited E2E stages", () => {
  const root = fixture(
    { app: {}, prod: { "override-compose": "prod.yml" }, e2e: { "override-compose": "e2e.yml" } },
    {
      "prod.yml": { services: { app: { volumes: ["cache:/cache"] } }, volumes: { cache: { name: "global-data" } } },
      "e2e.yml": { services: { app: { volumes: ["cache:/cache"] } }, volumes: { cache: { name: "global-data" } } },
    },
  );
  const result = compileService("e2e", root);
  const keys = Object.keys(result.compose.volumes ?? {});
  expect(keys).toHaveLength(2);
  for (const key of keys) expect((result.compose.volumes![key] as { name?: string }).name).toBeUndefined();
  expect(result.compose.services.app!.volumes).toContain(`${keys.find((key) => key.includes("--e2e--"))}:/cache`);
});

it("scopes a global tester helper's owned resource", () => {
  const root = meshFixture(
    { services: { api: { path: "api" } }, tester: { compose: "tester.yml", service: "runner" } },
    { api: { app: {} } },
    { "tester.yml": {
      services: { runner: { image: "alpine" }, helper: { image: "alpine", volumes: ["scratch:/data"] } },
      volumes: { scratch: { name: "global-data" } },
    } },
  );
  const result = compileMesh("e2e", root);
  const [key] = Object.keys(result.compose.volumes ?? {});
  expect(key).toContain("mesh-tester");
  expect((result.compose.volumes![key!] as { name?: string }).name).toBeUndefined();
  const helper = Object.keys(result.compose.services).find((name) => name.endsWith("--helper"))!;
  expect(result.compose.services[helper]!.volumes).toContain(`${key}:/data`);
});
