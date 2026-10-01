import { existsSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("Gateway Service Unit Tests", () => {
  it("verifies nginx template configuration exists", () => {
    expect(existsSync("templates/default.conf.template")).toBe(true);
  });
});
