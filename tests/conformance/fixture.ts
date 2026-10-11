import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { stringify } from "yaml";
import { compileServiceComposition } from "../../src/core/composition/compileServiceComposition.js";
import { compileMeshComposition } from "../../src/core/mesh/v2/compileMeshComposition.js";

const roots: string[] = [];

export const http = (port = 3000, extra: Record<string, unknown> = {}) => ({ port, primary: true, scheme: "http", ...extra });
export const dep = (compose = "dependency.yml", service = "owner", port = 6379, extra: Record<string, unknown> = {}) => ({
  compose,
  endpoints: { api: { service, port, primary: true, scheme: "http", ...extra } },
});
export const ownerBundle = (services: Record<string, unknown> = {}) => ({
  services: { owner: { image: "alpine", healthcheck: { test: ["CMD", "true"] } }, ...services },
});

export function fixture(build: Record<string, unknown> = { app: {} }, files: Record<string, string | object> = {}): string {
  const root = mkdtempSync(path.join(os.tmpdir(), "builder-conformance-"));
  roots.push(root);
  write(root, "build.json", build);
  for (const [name, value] of Object.entries(files)) write(root, name, value);
  return root;
}

export function write(root: string, relative: string, value: string | object): void {
  const file = path.join(root, relative);
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, typeof value === "string" ? value : relative.endsWith(".json") ? JSON.stringify(value, null, 2) : stringify(value));
}

export function meshFixture(mesh: Record<string, unknown>, builds: Record<string, Record<string, unknown>>, files: Record<string, string | object> = {}): string {
  const root = mkdtempSync(path.join(os.tmpdir(), "builder-mesh-conformance-"));
  roots.push(root);
  write(root, "mesh.json", mesh);
  for (const [name, build] of Object.entries(builds)) write(root, `${name}/build.json`, build);
  for (const [name, value] of Object.entries(files)) write(root, name, value);
  return root;
}

export function compileService(stage: "dev" | "prod" | "test" | "e2e", root: string, full = false) {
  return compileServiceComposition(stage, root, { full, validationMode: true });
}

export function compileMesh(stage: "dev" | "prod" | "e2e", root: string) {
  return compileMeshComposition(stage, root, { validationMode: true });
}

export function cleanupFixtures(): void {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
}

export function env(service: { environment?: unknown } | undefined): Record<string, string> {
  return (service?.environment ?? {}) as Record<string, string>;
}
