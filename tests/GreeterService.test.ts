import { describe, it, expect } from "vitest";
import { Container } from "@solid-stack/di";
import { GreeterService } from "../src/core/GreeterService.js";
import { GreeterConfigToken } from "../src/types/tokens.js";

describe("GreeterService (DI Resolution)", () => {
  it("resolves from DI container with provided configuration", () => {
    const container = new Container();
    container.provideValue(GreeterConfigToken, {
      prefix: "👋",
      suffix: "Welcome to Solid Stack!",
    });

    const greeter = container.resolve(GreeterService);
    const result = greeter.greet("Developer");

    expect(result.message).toBe("👋 Hello, Developer! Welcome to Solid Stack!");
    expect(result.timestamp).toBeInstanceOf(Date);
  });

  it("handles empty/default configuration", () => {
    const container = new Container();
    container.provideValue(GreeterConfigToken, {});

    const greeter = container.resolve(GreeterService);
    const result = greeter.greet("World");

    expect(result.message).toBe("Hello, World!");
  });
});
