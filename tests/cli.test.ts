import path from "node:path";
import { describe, expect, it } from "vitest";
import { createCli } from "../src/cli.js";
import { handleServiceUp } from "../src/commands/serviceUp.js";

const BACKEND_DIR = path.resolve(
  __dirname,
  "../../agnostic-build-sys/services/backend"
);

describe("CLI parser and serviceUp handler", () => {
  it("initializes CLI with builder name and commands", () => {
    const cli = createCli();
    expect(cli.name).toBe("builder");
    expect(cli.commands.length).toBeGreaterThan(0);
  });

  it("handles service up dev in dry-run mode", async () => {
    const exitCode = await handleServiceUp("dev", {
      projectDir: BACKEND_DIR,
      dryRun: true,
      skipCheck: true,
    });
    expect(exitCode).toBe(0);
  });

  it("handles service up prod in dry-run mode", async () => {
    const exitCode = await handleServiceUp("prod", {
      projectDir: BACKEND_DIR,
      dryRun: true,
      skipCheck: true,
    });
    expect(exitCode).toBe(0);
  });

  it("handles service up test in dry-run mode", async () => {
    const exitCode = await handleServiceUp("test", {
      projectDir: BACKEND_DIR,
      dryRun: true,
      skipCheck: true,
    });
    expect(exitCode).toBe(0);
  });

  it("handles service up test-unit in dry-run mode", async () => {
    const exitCode = await handleServiceUp("test-unit", {
      projectDir: BACKEND_DIR,
      dryRun: true,
      skipCheck: true,
    });
    expect(exitCode).toBe(0);
  });

  it("handles service up test-e2e in dry-run mode", async () => {
    const exitCode = await handleServiceUp("test-e2e", {
      projectDir: BACKEND_DIR,
      dryRun: true,
      skipCheck: true,
    });
    expect(exitCode).toBe(0);
  });

  it("rejects unknown stage", async () => {
    await expect(
      handleServiceUp("unknown-stage", {
        projectDir: BACKEND_DIR,
        dryRun: true,
        skipCheck: true,
      })
    ).rejects.toThrow("Unknown environment stage");
  });
});
