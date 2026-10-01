import path from "node:path";
import { describe, expect, it } from "vitest";
import { createCli } from "../src/cli.js";
import { handleServiceUp } from "../src/commands/service/commands/up/handler.js";
import { handleCheck } from "../src/commands/check/handler.js";

const BACKEND_DIR = path.resolve(
  __dirname,
  "../../agnostic-build-sys/services/backend"
);

describe("CLI parser and command handlers", () => {
  it("initializes CLI with builder name and commands", () => {
    const cli = createCli();
    expect(cli.name()).toBe("builder");
    expect(cli.commands.length).toBeGreaterThan(0);
  });

  it("registers service up and check commands", () => {
    const cli = createCli();
    const serviceCmd = cli.commands.find((c) => c.name() === "service");
    expect(serviceCmd).toBeDefined();
    expect(serviceCmd?.commands.some((c) => c.name() === "up")).toBe(true);

    const checkCmd = cli.commands.find((c) => c.name() === "check");
    expect(checkCmd).toBeDefined();
  });

  it("handles check command", async () => {
    const exitCode = await handleCheck({
      projectDir: BACKEND_DIR,
    });
    expect(exitCode).toBe(0);
  });

  it("rejects unknown stage", async () => {
    await expect(
      handleServiceUp("unknown-stage", {
        projectDir: BACKEND_DIR,
      })
    ).rejects.toThrow("Unknown environment stage");
  });
});
