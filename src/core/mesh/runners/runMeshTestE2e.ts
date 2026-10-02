import pc from "picocolors";
import { ScriptError } from "../../../errors/ScriptError.js";
import { resolveProjectDir } from "../../../utils/paths.js";
import { redactYamlSecrets } from "../../../utils/redactSecrets.js";
import { runCompose } from "../../runCompose.js";
import { teardownCompose } from "../../teardownCompose.js";
import { checkMesh } from "../checkers/checkMesh.js";
import { compileMeshEnvironment } from "../compileMeshEnvironment.js";
import type { MeshRunOptions } from "../MeshRunOptions.js";

export async function runMeshTestE2e(options: MeshRunOptions = {}): Promise<number> {
  const meshDir = resolveProjectDir(options.projectDir);

  console.log(pc.bold(pc.blue(`\n========================================`)));
  console.log(pc.bold(pc.blue(`🚦 [MESH] STAGE: GLOBAL INTEGRATED E2E TESTS`)));
  console.log(pc.bold(pc.blue(`========================================\n`)));

  if (!options.skipChecks) {
    checkMesh(meshDir, { requireTester: true });
  }

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
      redactYamlSecrets(yaml)
    );
  }

  if (options.dryRun) {
    console.log(pc.green("[DRY-RUN] Global E2E test simulated. Compose was not started."));
    return 0;
  }

  // Stale-project cleanup before up
  teardownCompose(yaml, meshDir, { removeVolumes: true });

  let status = 0;
  try {
    status = await runCompose(
      [
        "up",
        "--build",
        "--abort-on-container-exit",
        "--exit-code-from",
        testerServiceName,
      ],
      yaml,
      meshDir,
      { removeVolumes: true }
    );
  } finally {
    console.log(pc.cyan("\n🧹 Cleaning up global mesh containers and volumes..."));
    teardownCompose(yaml, meshDir, { removeVolumes: true });
  }

  if (status === 0) {
    console.log(pc.bold(pc.green(`\n✅ Global E2E tests passed successfully.\n`)));
  } else {
    console.error(pc.red(`\n❌ Global E2E tests failed with exit code ${status}.\n`));
  }

  return status;
}
