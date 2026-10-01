import path from "node:path";
import pc from "picocolors";
import { ScriptError } from "../../../errors/ScriptError.js";
import { runCompose } from "../../runCompose.js";
import { teardownCompose } from "../../teardownCompose.js";
import { checkMesh } from "../checkers/checkMesh.js";
import { compileMeshEnvironment } from "../compileMeshEnvironment.js";
import type { MeshRunOptions } from "../MeshRunOptions.js";

export function runMeshTestE2e(options: MeshRunOptions = {}): number {
  const meshDir = path.resolve(options.projectDir || process.cwd());

  console.log(pc.bold(pc.blue(`\n========================================`)));
  console.log(pc.bold(pc.blue(`🚦 [MESH] STAGE: GLOBAL INTEGRATED E2E TESTS`)));
  console.log(pc.bold(pc.blue(`========================================\n`)));

  checkMesh(meshDir, { requireTester: true });

  const { yaml, testerServiceName } = compileMeshEnvironment("prod", meshDir, {
    includeTester: true,
  });

  if (!testerServiceName) {
    throw new ScriptError(
      "No tester service could be identified in the tester docker compose configuration."
    );
  }

  if (options.debug) {
    console.log(
      pc.yellow("\nFinal merged Mesh E2E YAML configuration:\n"),
      yaml
    );
  }

  if (options.dryRun) {
    console.log(pc.green("[DRY-RUN] Global E2E test simulated. Compose was not started."));
    return 0;
  }

  let status = 0;
  try {
    status = runCompose(
      [
        "up",
        "--build",
        "--abort-on-container-exit",
        "--exit-code-from",
        testerServiceName,
      ],
      yaml,
      meshDir
    );
  } finally {
    console.log(pc.cyan("\n🧹 Cleaning up global mesh containers and volumes..."));
    teardownCompose(yaml, meshDir);
  }

  if (status === 0) {
    console.log(pc.bold(pc.green(`\n✅ Global E2E tests passed successfully.\n`)));
  } else {
    console.error(pc.red(`\n❌ Global E2E tests failed with exit code ${status}.\n`));
  }

  return status;
}
