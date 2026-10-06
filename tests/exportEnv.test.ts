import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createCli } from "../src/cli.js";
import { handleExportEnv } from "../src/commands/service/commands/export/handler.js";
import { compileApplicationEnv } from "../src/core/compileApplicationEnv.js";
import { checkComposeAvailability, checkDependencies } from "../src/utils/checkDependencies.js";

vi.mock("../src/core/compileApplicationEnv.js", async importOriginal => ({
  ...await importOriginal<typeof import("../src/core/compileApplicationEnv.js")>(),
  compileApplicationEnv: vi.fn(),
}));
vi.mock("../src/utils/checkDependencies.js", () => ({
  checkComposeAvailability: vi.fn(), checkDependencies: vi.fn(),
}));

describe("service export env", () => {
  let dir: string;
  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), "builder-export-env-"));
    vi.mocked(compileApplicationEnv).mockImplementation(stage => ({ EXEC_MODE: stage, VALUE: "resolved" }));
    vi.spyOn(console, "log").mockImplementation(() => {});
  });
  afterEach(() => {
    vi.restoreAllMocks();
    vi.clearAllMocks();
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it("exports all four stages by default without prompting for new files", async () => {
    const prompt = vi.fn();
    const files = await handleExportEnv(undefined, { projectDir: dir, prompt });
    expect(files.map(file => path.basename(file))).toEqual(["env.dev", "env.prod", "env.test", "env.e2e"]);
    expect(prompt).not.toHaveBeenCalled();
    expect(fs.readFileSync(files[2]!, "utf8")).toContain("EXEC_MODE='test'");
    if (process.platform !== "win32") expect(fs.statSync(files[0]!).mode & 0o777).toBe(0o600);
  });

  it("exports only the requested stage and forwards dev compilation options", async () => {
    await handleExportEnv("dev", { projectDir: dir, full: true, silenceWarnings: true });
    expect(fs.readdirSync(dir)).toEqual(["env.dev"]);
    expect(compileApplicationEnv).toHaveBeenCalledExactlyOnceWith("dev", dir, expect.objectContaining({ full: true, silenceWarnings: true }));
  });

  it("overwrites an existing file only after confirmation", async () => {
    fs.writeFileSync(path.join(dir, "env.dev"), "original");
    const prompt = vi.fn().mockResolvedValue("yes");
    await handleExportEnv("dev", { projectDir: dir, prompt });
    expect(prompt).toHaveBeenCalledTimes(1);
    expect(fs.readFileSync(path.join(dir, "env.dev"), "utf8")).toContain("VALUE='resolved'");
  });

  it("preserves existing files and asks again if the replacement filename also exists", async () => {
    fs.writeFileSync(path.join(dir, "env.dev"), "original");
    fs.writeFileSync(path.join(dir, "alternate.env"), "alternate");
    const prompt = vi.fn().mockResolvedValueOnce("n").mockResolvedValueOnce("alternate.env")
      .mockResolvedValueOnce("n").mockResolvedValueOnce("exports/dev.env");
    const files = await handleExportEnv("dev", { projectDir: dir, prompt });
    expect(files).toEqual([path.join(dir, "exports/dev.env")]);
    expect(fs.readFileSync(path.join(dir, "env.dev"), "utf8")).toBe("original");
    expect(fs.readFileSync(path.join(dir, "alternate.env"), "utf8")).toBe("alternate");
    expect(prompt).toHaveBeenCalledTimes(4);
  });

  it("finishes compilation before writing or prompting", async () => {
    fs.writeFileSync(path.join(dir, "env.dev"), "original");
    vi.mocked(compileApplicationEnv).mockImplementation(stage => {
      if (stage === "e2e") throw new Error("bad config");
      return {};
    });
    const prompt = vi.fn();
    await expect(handleExportEnv(undefined, { projectDir: dir, prompt })).rejects.toThrow("bad config");
    expect(prompt).not.toHaveBeenCalled();
    expect(fs.readdirSync(dir)).toEqual(["env.dev"]);
    expect(fs.readFileSync(path.join(dir, "env.dev"), "utf8")).toBe("original");
  });

  it("rejects unsupported stages without compiling or writing", async () => {
    await expect(handleExportEnv("staging", { projectDir: dir })).rejects.toThrow("Supported stages: dev, prod, test, e2e");
    expect(compileApplicationEnv).not.toHaveBeenCalled();
    expect(fs.readdirSync(dir)).toEqual([]);
  });

  it("requires interactive confirmation in a non-interactive session", async () => {
    fs.writeFileSync(path.join(dir, "env.dev"), "original");
    const descriptor = Object.getOwnPropertyDescriptor(process.stdin, "isTTY");
    Object.defineProperty(process.stdin, "isTTY", { configurable: true, value: false });
    try {
      await expect(handleExportEnv("dev", { projectDir: dir })).rejects.toThrow("interactive terminal");
      expect(fs.readFileSync(path.join(dir, "env.dev"), "utf8")).toBe("original");
    } finally {
      if (descriptor) Object.defineProperty(process.stdin, "isTTY", descriptor);
      else Reflect.deleteProperty(process.stdin, "isTTY");
    }
  });

  it("registers the nested CLI command and requires Compose without a daemon", async () => {
    await createCli().parseAsync(["node", "builder", "service", "export", "env", "test", "-C", dir]);
    expect(fs.readdirSync(dir)).toEqual(["env.test"]);
    expect(checkComposeAvailability).toHaveBeenCalledOnce();
    expect(checkDependencies).not.toHaveBeenCalled();
  });
});
