import { describe, expect, it } from "vitest";
import { app } from "./index.js";

describe("Filesystem Service Unit Tests", () => {
  it("initializes express application properly", () => {
    expect(app).toBeDefined();
  });
});
