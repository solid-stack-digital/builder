import { describe, expect, it } from "vitest";
import { createApp } from "./index.js";

describe("Example Backend Unit Tests", () => {
  it("initializes express app instance", () => {
    const app = createApp();
    expect(app).toBeDefined();
    expect(typeof app.listen).toBe("function");
  });
});
