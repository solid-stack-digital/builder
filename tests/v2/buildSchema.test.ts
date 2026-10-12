import { describe, expect, it } from "vitest";
import { buildJsonSchema } from "../../src/core/buildSchema.js";
describe("V2 build schema", () => {
 it("accepts canonical endpoint configurations and partial stage overlays", () => { expect(buildJsonSchema.safeParse({ app: { endpoints: { http: { port: 3000, primary: true, publicPort: "AUTO", scheme: "ws+unix" } } }, dev: { app: { endpoints: { http: { publicPort: 8080 } } } } }).success).toBe(true); });
 it("requires app and string env values", () => { expect(buildJsonSchema.safeParse({}).success).toBe(false); expect(buildJsonSchema.safeParse({ app: { env: { X: 1 } } }).success).toBe(false); });
 it.each([0, 65536, 1.5, "3000"])("rejects invalid port %s", port => expect(buildJsonSchema.safeParse({ app: { endpoints: { http: { port } } } }).success).toBe(false));
 it("requires dependency endpoint owners and rejects legacy fields", () => { expect(buildJsonSchema.safeParse({ app: {}, dependencies: { db: { compose: "db.yml", endpoints: { db: { port: 5432 } } } } }).success).toBe(false); for (const key of ["port", "envOverrides", "overrides", "composeFiles", "services", "policy", "policies", "injects", "sidecars"]) expect(buildJsonSchema.safeParse({ app: {}, [key]: {} }).success, key).toBe(false); });
 it("rejects dependency legacy fields", () => { for (const key of ["path", "service", "port", "ports"]) expect(buildJsonSchema.safeParse({ app: {}, dependencies: { db: { compose: "db.yml", [key]: "x" } } }).success, key).toBe(false); expect(buildJsonSchema.safeParse({ app: {}, tester: { envOverrides: {} } }).success).toBe(false); });
});
