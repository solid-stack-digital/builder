import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { registerActiveCompose, resetSignalHandlersForTests, setActiveChild, setTearingDown } from "../src/core/composeCleanup.js";
import * as teardownModule from "../src/core/teardownCompose.js";
import * as runComposeModule from "../src/core/runCompose.js";
import { runDev } from "../src/core/runners/runDev.js";
import { runProd } from "../src/core/runners/runProd.js";
import { runTestUnit } from "../src/core/runners/runTestUnit.js";
import { runTestE2e } from "../src/core/runners/runTestE2e.js";
import { runMeshDev } from "../src/core/mesh/runners/runMeshDev.js";
import { runMeshProd } from "../src/core/mesh/runners/runMeshProd.js";
import path from "node:path";

const EXAMPLE_BACKEND_DIR = path.resolve(__dirname, "../examples/backend");
const LARGE_PROJECT_DIR = path.resolve(__dirname, "../examples/largeProject");

describe("Teardown and Cleanup lifecycle verification", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    resetSignalHandlersForTests();
  });

  afterEach(() => {
    resetSignalHandlersForTests();
  });

  describe("Foreground dev & prod runners call teardownCompose with removeVolumes: false", () => {
    it("calls teardownCompose with removeVolumes: false in runDev", async () => {
      const teardownSpy = vi.spyOn(teardownModule, "teardownCompose").mockResolvedValue(undefined);
      const runComposeSpy = vi.spyOn(runComposeModule, "runCompose").mockResolvedValue(130);

      const status = await runDev({
        projectDir: EXAMPLE_BACKEND_DIR,
        debug: false,
        detach: false,
      });

      expect(status).toBe(130);
      expect(runComposeSpy).toHaveBeenCalledTimes(1);
      expect(teardownSpy).toHaveBeenCalledWith(
        expect.any(String),
        expect.any(String),
        { removeVolumes: false }
      );
    });

    it("skips teardownCompose when runDev is detached (-d)", async () => {
      const teardownSpy = vi.spyOn(teardownModule, "teardownCompose").mockResolvedValue(undefined);
      const runComposeSpy = vi.spyOn(runComposeModule, "runCompose").mockResolvedValue(0);

      const status = await runDev({
        projectDir: EXAMPLE_BACKEND_DIR,
        debug: false,
        detach: true,
      });

      expect(status).toBe(0);
      expect(runComposeSpy).toHaveBeenCalledTimes(1);
      expect(teardownSpy).not.toHaveBeenCalled();
    });

    it("calls teardownCompose with removeVolumes: false in runProd", async () => {
      const teardownSpy = vi.spyOn(teardownModule, "teardownCompose").mockResolvedValue(undefined);
      const runComposeSpy = vi.spyOn(runComposeModule, "runCompose").mockResolvedValue(0);

      const status = await runProd({
        projectDir: EXAMPLE_BACKEND_DIR,
        debug: false,
        detach: false,
      });

      expect(status).toBe(0);
      expect(runComposeSpy).toHaveBeenCalledTimes(1);
      expect(teardownSpy).toHaveBeenCalledWith(
        expect.any(String),
        expect.any(String),
        { removeVolumes: false }
      );
    });

    it("calls teardownCompose with removeVolumes: false in runMeshDev", async () => {
      const teardownSpy = vi.spyOn(teardownModule, "teardownCompose").mockResolvedValue(undefined);
      const runComposeSpy = vi.spyOn(runComposeModule, "runCompose").mockResolvedValue(130);

      const status = await runMeshDev({
        projectDir: LARGE_PROJECT_DIR,
        skipChecks: true,
        detach: false,
      });

      expect(status).toBe(130);
      expect(runComposeSpy).toHaveBeenCalledTimes(1);
      expect(teardownSpy).toHaveBeenCalledWith(
        expect.any(String),
        expect.any(String),
        { removeVolumes: false }
      );
    });

    it("skips teardownCompose when runMeshDev is detached", async () => {
      const teardownSpy = vi.spyOn(teardownModule, "teardownCompose").mockResolvedValue(undefined);
      const runComposeSpy = vi.spyOn(runComposeModule, "runCompose").mockResolvedValue(0);

      const status = await runMeshDev({
        projectDir: LARGE_PROJECT_DIR,
        skipChecks: true,
        detach: true,
      });

      expect(status).toBe(0);
      expect(runComposeSpy).toHaveBeenCalledTimes(1);
      expect(teardownSpy).not.toHaveBeenCalled();
    });

    it("calls teardownCompose with removeVolumes: false in runMeshProd", async () => {
      const teardownSpy = vi.spyOn(teardownModule, "teardownCompose").mockResolvedValue(undefined);
      const runComposeSpy = vi.spyOn(runComposeModule, "runCompose").mockResolvedValue(130);

      const status = await runMeshProd({
        projectDir: LARGE_PROJECT_DIR,
        skipChecks: true,
        detach: false,
      });

      expect(status).toBe(130);
      expect(runComposeSpy).toHaveBeenCalledTimes(1);
      expect(teardownSpy).toHaveBeenCalledWith(
        expect.any(String),
        expect.any(String),
        { removeVolumes: false }
      );
    });
  });

  describe("Test runners run stale-project cleanup before up and teardown with -v after", () => {
    it("runs pre-up stale cleanup and post-up teardown with removeVolumes: true in runTestUnit", async () => {
      const teardownSpy = vi.spyOn(teardownModule, "teardownCompose").mockResolvedValue(undefined);
      const runComposeSpy = vi.spyOn(runComposeModule, "runCompose").mockResolvedValue(0);

      const status = await runTestUnit({
        projectDir: EXAMPLE_BACKEND_DIR,
        debug: false,
        detach: false,
        skipBanner: true,
      });

      expect(status).toBe(0);
      expect(runComposeSpy).toHaveBeenCalledTimes(1);
      // Pre-up stale cleanup + post-up teardown = 2 calls
      expect(teardownSpy).toHaveBeenCalledTimes(2);
      expect(teardownSpy).toHaveBeenNthCalledWith(
        1,
        expect.any(String),
        expect.any(String),
        expect.objectContaining({ removeVolumes: true })
      );
      expect(teardownSpy).toHaveBeenNthCalledWith(
        2,
        expect.any(String),
        expect.any(String),
        expect.objectContaining({ removeVolumes: true })
      );
    });

    it("runs pre-up stale cleanup and post-up teardown with removeVolumes: true in runTestE2e", async () => {
      const teardownSpy = vi.spyOn(teardownModule, "teardownCompose").mockResolvedValue(undefined);
      const runComposeSpy = vi.spyOn(runComposeModule, "runCompose").mockResolvedValue(0);

      const status = await runTestE2e({
        projectDir: EXAMPLE_BACKEND_DIR,
        debug: false,
        detach: false,
        skipBanner: true,
      });

      expect(status).toBe(0);
      expect(runComposeSpy).toHaveBeenCalledTimes(1);
      expect(teardownSpy).toHaveBeenCalledTimes(2);
      expect(teardownSpy).toHaveBeenNthCalledWith(
        1,
        expect.any(String),
        expect.any(String),
        expect.objectContaining({ removeVolumes: true })
      );
      expect(teardownSpy).toHaveBeenNthCalledWith(
        2,
        expect.any(String),
        expect.any(String),
        expect.objectContaining({ removeVolumes: true })
      );
    });
  });

  describe("Signal forwarding and teardown protection in composeCleanup", () => {
    it("forwards signal to active child process", () => {
      const mockChild = {
        exitCode: null,
        signalCode: null,
        killed: false,
        kill: vi.fn(),
      } as any;

      setActiveChild(mockChild);
      const unregister = registerActiveCompose("test-yaml", "/tmp/test", { removeVolumes: false });

      // Simulate sending SIGTERM (forwarded directly to child)
      process.emit("SIGTERM" as any);

      expect(mockChild.kill).toHaveBeenCalledWith("SIGTERM");
      setActiveChild(null);
      unregister();
    });

    it("ignores signals when isTearingDown is active", () => {
      const mockChild = {
        exitCode: null,
        signalCode: null,
        killed: false,
        kill: vi.fn(),
      } as any;

      setActiveChild(mockChild);
      setTearingDown(true);

      // Simulate sending SIGINT during teardown
      process.emit("SIGINT" as any);

      expect(mockChild.kill).not.toHaveBeenCalled();

      setTearingDown(false);
      setActiveChild(null);
    });
  });
});
