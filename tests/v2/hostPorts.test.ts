import { afterEach, describe, expect, it } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import os from "node:os"; import path from "node:path";
import { allocateHostPorts } from "../../src/core/config/hostPorts.js";
import { PortConflictError } from "../../src/errors/PortConflictError.js";
const dirs: string[] = []; afterEach(() => { for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true }); });
describe("V2 host port allocation", () => {
 it("reserves fixed ports before allocating AUTO and detects fixed conflicts", () => { const d = mkdtempSync(path.join(os.tmpdir(), "ports-")); dirs.push(d); const ports = allocateHostPorts(d, "dev", [{ logicalPath: "auto", requested: "AUTO" }, { logicalPath: "fixed", requested: 20000 }]); expect(ports.get("auto")).toBe(20001); expect(() => allocateHostPorts(d, "dev", [{ logicalPath: "a", requested: 3 }, { logicalPath: "b", requested: 3 }])).toThrow(PortConflictError); });
 it("carries both logical owners and composition context for fixed conflicts", () => { try { allocateHostPorts("/tmp", "e2e", [{ logicalPath: "api.app.endpoints.http", requested: 5000 }, { logicalPath: "web.app.endpoints.http", requested: 5000 }], true, { sourceFile: "/mesh/mesh.json", composition: "mesh" }); throw new Error("expected conflict"); } catch (error) { expect(error).toBeInstanceOf(PortConflictError); expect((error as PortConflictError).context).toMatchObject({ sourceFile: "/mesh/mesh.json", configPath: "web.app.endpoints.http", stage: "e2e", composition: "mesh", referencedObject: "api.app.endpoints.http", value: 5000 }); } });
 it("reuses its deterministic cache", () => { const d = mkdtempSync(path.join(os.tmpdir(), "ports-")); dirs.push(d); const intent = [{ logicalPath: "api.http", requested: "AUTO" as const }]; const first = allocateHostPorts(d, "dev", intent).get("api.http"); expect(allocateHostPorts(d, "dev", intent).get("api.http")).toBe(first); });
});
