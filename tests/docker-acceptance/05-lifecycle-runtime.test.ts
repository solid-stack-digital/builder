import { afterEach, describe, expect, it } from "vitest";
import { compileMeshComposition } from "../../src/core/mesh/v2/compileMeshComposition.js";
import { cleanupFixtures, write } from "../conformance/fixture.js";
import { builder, dependencyBundle, dockerCompose, dockerLog, down, emitCompose, meshCompose, runtimeMesh, runtimeService, serviceCompose } from "./runtimeFixture.js";

afterEach(cleanupFixtures);
const dep = { compose: "d.yml", endpoints: { api: { service: "owner", port: 3000, primary: true } } };
const app = (readyAfter: number) => ({ app: { env: { READY_AFTER_MS: String(readyAfter) }, endpoints: { http: { port: 3000, primary: true, scheme: "http", publicPort: "AUTO" } } } });

describe("catalog 05: real Docker health transitions", () => {
  it("LIFE-031 keeps app process stopped while local owner stays unhealthy", () => {
    const root = runtimeService({ dependencies: { db: dep } }); write(root, "d.yml", dependencyBundle(-1));
    const file = serviceCompose(root);
    try {
      const up = dockerCompose(root, file, ["up", "--build", "-d"], 45000);
      expect(up.status).not.toBe(0);
      expect(dockerLog(root, file, "app")).not.toContain("APP_STARTED");
      expect(dockerLog(root, file, "dep--db--owner")).toContain("DEP_STARTED");
    } finally { down(root, file); }
  }, 60000);
  it("LIFE-032 starts app only after dependency health transition", () => {
    const root = runtimeService({ dependencies: { db: dep } }); write(root, "d.yml", dependencyBundle(1500));
    const file = serviceCompose(root);
    try {
      const up = dockerCompose(root, file, ["up", "--build", "-d"], 45000);
      expect(up.status, `${up.stdout}${up.stderr}`).toBe(0);
      const depLogs = dockerLog(root, file, "dep--db--owner"), appLogs = dockerLog(root, file, "app");
      expect(depLogs).toContain("DEP_READY"); expect(appLogs).toContain("APP_STARTED");
      const depTime = depLogs.match(/(\d{4}-\d\d-\d\dT[^\s]+).*DEP_READY/)?.[1];
      const appTime = appLogs.match(/(\d{4}-\d\d-\d\dT[^\s]+).*APP_STARTED/)?.[1];
      expect(depTime).toBeDefined(); expect(appTime).toBeDefined();
      expect(new Date(appTime!).getTime()).toBeGreaterThanOrEqual(new Date(depTime!).getTime());
    } finally { down(root, file); }
  }, 60000);
  it("LIFE-033 blocks mesh dependent while backend app remains unhealthy", () => {
    const root = runtimeMesh({ services: { backend: { path: "backend" }, gateway: { path: "gateway", dependsOn: ["backend"] } } }, { backend: app(-1), gateway: app(0) });
    const file = meshCompose(root, "prod");
    try {
      const up = dockerCompose(root, file, ["up", "--build", "-d"], 45000);
      expect(up.status).not.toBe(0);
      expect(dockerLog(root, file, "backend")).toContain("APP_STARTED");
      expect(dockerLog(root, file, "gateway")).not.toContain("APP_STARTED");
    } finally { down(root, file); }
  }, 60000);
  it("LIFE-034 starts global tester after all effective apps become healthy", () => {
    const root = runtimeMesh({ services: { a: { path: "a", publish: ["app.endpoints.http"] }, b: { path: "b", publish: ["app.endpoints.http"] } }, tester: { compose: "e2e/t.yml", service: "runner", env: { SYSTEM_URL: "${a.app.endpoints.http.public_url},${b.app.endpoints.http.public_url}" } } }, { a: app(300), b: app(1300) }, { "e2e/t.yml": { services: { runner: { build: { context: ".", dockerfile: "Dockerfile" } } } } });
    const compiled = compileMeshComposition("e2e", root), file = emitCompose(root, compiled.compose);
    try {
      const up = dockerCompose(root, file, ["up", "--build", "--abort-on-container-exit", "--exit-code-from", compiled.testerServiceName!], 60000);
      expect(up.status, `${up.stdout}${up.stderr}`).toBe(0);
      const testerLogs = dockerLog(root, file, compiled.testerServiceName!);
      expect(testerLogs).toContain("E2E_MARK");
      for (const name of ["a", "b"]) expect(dockerLog(root, file, name)).toContain("APP_READY");
    } finally { down(root, file); }
  }, 90000);
  it("LIFE-035 delays service tester until app readiness", () => {
    const root = runtimeService({ e2e: { app: { env: { READY_AFTER_MS: "1800" } } } });
    const run = builder(root, ["service", "up", "test-e2e"]);
    const output = `${run.stdout}${run.stderr}`;
    expect(run.status, output).toBe(0);
    expect(output).toContain("APP_READY"); expect(output).toContain("E2E_MARK");
  }, 60000);
});
