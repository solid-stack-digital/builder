import { describe, it, expect } from "vitest";
import { formatGreeting } from "../src/utils/formatGreeting.js";

describe("formatGreeting util", () => {
  it("formats greeting without prefix or suffix", () => {
    expect(formatGreeting("Alice")).toBe("Hello, Alice!");
  });

  it("formats greeting with prefix", () => {
    expect(formatGreeting("Bob", { prefix: "✨" })).toBe("✨ Hello, Bob!");
  });

  it("formats greeting with suffix", () => {
    expect(formatGreeting("Charlie", { suffix: "Have fun!" })).toBe(
      "Hello, Charlie! Have fun!",
    );
  });

  it("formats greeting with both prefix and suffix", () => {
    expect(
      formatGreeting("David", { prefix: "🚀", suffix: "All systems go." }),
    ).toBe("🚀 Hello, David! All systems go.");
  });
});
