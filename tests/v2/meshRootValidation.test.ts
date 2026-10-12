import { describe, expect, it } from "vitest";
import { meshSchema } from "../../src/core/mesh/meshSchema.js";
import { resolveMeshStage } from "../../src/core/config/resolveMeshStage.js";

describe("root mesh service cardinality", () => {
  it("rejects an empty root services map", () => {
    expect(meshSchema.safeParse({ services: {} }).success).toBe(false);
  });

  it("rejects empty root services even when a stage adds a service", () => {
    expect(meshSchema.safeParse({ services: {}, e2e: { services: { fixture: { path: "./fixture" } } } }).success).toBe(false);
  });

  it("allows an empty stage services overlay when root services exist", () => {
    expect(meshSchema.safeParse({ services: { api: { path: "./api" } }, e2e: { services: {} } }).success).toBe(true);
  });

  it("defensively rejects an empty root map passed directly to stage resolution", () => {
    expect(() => resolveMeshStage({ services: {}, e2e: { services: { fixture: { path: "./fixture" } } } } as any, "e2e", "/project/mesh.json"))
      .toThrow(/at least one root service/i);
  });
});
