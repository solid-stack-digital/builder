import { afterEach, describe, expect, it } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { compileServiceComposition } from "../../src/core/composition/compileServiceComposition.js";
import { compileMeshComposition } from "../../src/core/mesh/v2/compileMeshComposition.js";
import { ConfigError } from "../../src/errors/ConfigError.js";

const roots: string[] = [];
afterEach(() => { for (const root of roots.splice(0)) fs.rmSync(root, { recursive: true, force: true }); });
function root(prefix: string): string { const dir = fs.mkdtempSync(path.join(os.tmpdir(), prefix)); roots.push(dir); fs.copyFileSync(path.resolve("tests/fixtures/v2/service-basic/Dockerfile"), path.join(dir, "Dockerfile")); return dir; }
function write(dir: string, file: string, value: unknown): void { const target = path.join(dir, file); fs.mkdirSync(path.dirname(target), { recursive: true }); if (path.basename(file) === "build.json" && !fs.existsSync(path.join(path.dirname(target), "Dockerfile"))) fs.copyFileSync(path.resolve("tests/fixtures/v2/service-basic/Dockerfile"), path.join(path.dirname(target), "Dockerfile")); fs.writeFileSync(target, typeof value === "string" ? value : JSON.stringify(value)); }
function errorContext(run: () => unknown): ConfigError["context"] { try { run(); } catch (error) { if (error instanceof ConfigError) return error.context; throw error; } throw new Error("Expected ConfigError"); }

describe("reference diagnostic context", () => {
  it("identifies the build file and env key for invalid service syntax", () => {
    const dir = root("ref-diagnostic-service-"); write(dir, "build.json", { app: { env: { URL: "${not.valid}" } } });
    const context = errorContext(() => compileServiceComposition("dev", dir));
    expect(context).toMatchObject({ sourceFile: path.join(dir, "build.json"), configPath: "app.env.URL", stage: "dev", composition: "service", referencedObject: "not.valid" });
  });

  it("identifies mesh-owned env source and key for invalid syntax", () => {
    const dir = root("ref-diagnostic-mesh-"); write(dir, "mesh.json", { services: { gateway: { path: "gateway", env: { URL: "${not.valid}" } } } }); write(dir, "gateway/build.json", { app: {} });
    const context = errorContext(() => compileMeshComposition("dev", dir));
    expect(context).toMatchObject({ sourceFile: path.join(dir, "mesh.json"), configPath: "services.gateway.env.URL", stage: "dev", composition: "mesh", referencedObject: "not.valid" });
  });

  it("identifies the source reference when an endpoint has no scheme", () => {
    const dir = root("ref-diagnostic-scheme-"); write(dir, "build.json", { app: { env: { URL: "${app.endpoints.http.network_url}" }, endpoints: { http: { port: 3000, primary: true } } } });
    const context = errorContext(() => compileServiceComposition("dev", dir));
    expect(context).toMatchObject({ sourceFile: path.join(dir, "build.json"), configPath: "app.env.URL", stage: "dev", composition: "service", referencedObject: "app.endpoints.http.network_url" });
  });

  it("identifies the tester field for an unpublished public endpoint", () => {
    const dir = root("ref-diagnostic-public-"); write(dir, "build.json", { app: { endpoints: { http: { port: 3000, primary: true, scheme: "http" } } }, tester: { env: { URL: "${app.endpoints.http.public_url}" } } });
    const context = errorContext(() => compileServiceComposition("e2e", dir));
    expect(context).toMatchObject({ sourceFile: path.join(dir, "build.json"), configPath: "tester.env.URL", stage: "e2e", composition: "service", referencedObject: "app.endpoints.http.public_url" });
  });

  it("reports the active stage when a stage-only endpoint is unavailable", () => {
    const dir = root("ref-diagnostic-stage-"); write(dir, "build.json", { app: { env: { PORT_REF: "${app.endpoints.preview.network_port}" } }, e2e: { app: { endpoints: { preview: { port: 8080, primary: true } } } } });
    const context = errorContext(() => compileServiceComposition("dev", dir));
    expect(context).toMatchObject({ sourceFile: path.join(dir, "build.json"), configPath: "app.env.PORT_REF", stage: "dev", composition: "service", referencedObject: "app.endpoints.preview.network_port" });
  });
});
