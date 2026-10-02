import path from "node:path";
import { describe, expect, it } from "vitest";
import { createCli } from "../src/cli.js";
import { handleCheck } from "../src/commands/check/handler.js";
import { handleServiceUp } from "../src/commands/service/commands/up/handler.js";

const EXAMPLE_BACKEND_DIR = path.resolve(
  __dirname,
  "../examples/backend"
);

describe("CLI parser and command handlers", () => {
  it("initializes CLI with builder name and commands", () => {
    const cli = createCli();
    expect(cli.name()).toBe("builder");
    expect(cli.commands.length).toBeGreaterThan(0);
  });

  it("registers service up, down, and check commands", () => {
    const cli = createCli();
    const serviceCmd = cli.commands.find((c) => c.name() === "service");
    expect(serviceCmd).toBeDefined();
    expect(serviceCmd?.commands.some((c) => c.name() === "up")).toBe(true);
    expect(serviceCmd?.commands.some((c) => c.name() === "down")).toBe(true);

    const checkCmd = cli.commands.find((c) => c.name() === "check");
    expect(checkCmd).toBeDefined();
  });

  it("handles check command with absolute path", async () => {
    const exitCode = await handleCheck({
      projectDir: EXAMPLE_BACKEND_DIR,
    });
    expect(exitCode).toBe(0);
  });

  it("handles check command with relative path without doubling path", async () => {
    const relPath = path.relative(process.cwd(), EXAMPLE_BACKEND_DIR);
    const exitCode = await handleCheck({
      projectDir: relPath.startsWith(".") ? relPath : `./${relPath}`,
    });
    expect(exitCode).toBe(0);
  });

  it("handles service up with dry-run and skip-checks", async () => {
    const exitCode = await handleServiceUp("dev", {
      projectDir: EXAMPLE_BACKEND_DIR,
      dryRun: true,
      skipChecks: true,
    });
    expect(exitCode).toBe(0);
  });

  it("rejects unknown stage", async () => {
    await expect(
      handleServiceUp("unknown-stage", {
        projectDir: EXAMPLE_BACKEND_DIR,
      })
    ).rejects.toThrow("Unknown environment stage");
  });

  it("handles service down command successfully", async () => {
    const { handleServiceDown } = await import(
      "../src/commands/service/commands/down/handler.js"
    );
    const exitCode = await handleServiceDown("dev", {
      projectDir: EXAMPLE_BACKEND_DIR,
    });
    expect(exitCode).toBe(0);
  });

  it("rejects unknown stage in service down", async () => {
    const { handleServiceDown } = await import(
      "../src/commands/service/commands/down/handler.js"
    );
    await expect(
      handleServiceDown("unknown-stage", {
        projectDir: EXAMPLE_BACKEND_DIR,
      })
    ).rejects.toThrow("Unknown environment stage");
  });
});
