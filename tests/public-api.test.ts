import { describe, it, expect } from "vitest";
import * as PublicApi from "../src/index.js";

describe("Public API Barrier", () => {
  it("exports expected symbols and tokens", () => {
    expect(PublicApi.GreeterService).toBeDefined();
    expect(PublicApi.GreeterConfigToken).toBeDefined();
    expect(PublicApi.formatGreeting).toBeTypeOf("function");
  });
});
