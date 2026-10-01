import path from "node:path";
import pc from "picocolors";
import { runTest } from "../../runners/runTest.js";
import { checkMesh } from "../checkers/checkMesh.js";
import { getMeshJson } from "../getMeshJson.js";
import type { MeshRunOptions } from "../MeshRunOptions.js";
import { runMeshTestE2e } from "./runMeshTestE2e.js";

export function runMeshTest(options: MeshRunOptions = {}): number {
  const meshDir = path.resolve(options.projectDir || process.cwd());

  console.log(pc.bold(pc.blue(`\n========================================`)));
  console.log(pc.bold(pc.blue(`🧪 GLOBAL MESH TEST PIPELINE`)));
  console.log(pc.bold(pc.blue(`========================================\n`)));

  // Initial checks: verify services, build.json, tester dockerfile and compose
  checkMesh(meshDir, { requireTester: true });
  const mesh = getMeshJson(meshDir);

  // --- STAGE 1: Isolated Service Testing (Unit + Local E2E) ---
  console.log(pc.bold(pc.blue(`\n========================================`)));
  console.log(
    pc.bold(
      pc.blue(`🧪 [1/2] STAGE: LOCAL SUBMODULE TEST SUITES (Unit & Isolated E2E)`)
    )
  );
  console.log(pc.bold(pc.blue(`========================================\n`)));

  for (const [serviceName, serviceConfig] of Object.entries(mesh.services)) {
    const serviceDir = path.resolve(meshDir, serviceConfig.path);
    console.log(
      pc.bold(pc.cyan(`\n-> Running full test suite for [${serviceName}] in isolation...`))
    );

    if (options.dryRun) {
      console.log(
        pc.green(`[DRY-RUN] Full isolated tests for ${serviceName} simulated.`)
      );
      continue;
    }

    const serviceStatus = runTest({
      projectDir: serviceDir,
      debug: Boolean(options.debug),
      detach: Boolean(options.detach),
    });

    if (serviceStatus !== 0) {
      console.error(
        pc.red(
          `\n❌ Isolated tests failed for service [${serviceName}] with exit code ${serviceStatus}. Aborting global E2E tests.\n`
        )
      );
      return serviceStatus;
    }

    console.log(
      pc.bold(pc.green(`\n✅ Isolated tests passed for service: [${serviceName}]\n`))
    );
  }

  // --- STAGE 2: Integrated Production Mesh & Global E2E ---
  console.log(pc.bold(pc.blue(`\n========================================`)));
  console.log(
    pc.bold(
      pc.blue(`🚦 [2/2] STAGE: INTEGRATED PRODUCTION MESH & GLOBAL E2E ASSERTIONS`)
    )
  );
  console.log(pc.bold(pc.blue(`========================================\n`)));

  const e2eStatus = runMeshTestE2e(options);
  if (e2eStatus !== 0) {
    return e2eStatus;
  }

  console.log(
    pc.bold(
      pc.green(`🎉 Entire global mesh test pipeline (unit, local e2e, and global e2e) completed successfully!\n`)
    )
  );
  return 0;
}
