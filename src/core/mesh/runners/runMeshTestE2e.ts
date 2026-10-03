import pc from "picocolors";
import { parse } from "yaml";
import { ScriptError } from "../../../errors/ScriptError.js";
import { resolveProjectDir } from "../../../utils/paths.js";
import { redactYamlSecrets } from "../../../utils/redactSecrets.js";
import { clearRunState, writeRunState } from "../../../utils/runState.js";
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
    silenceWarnings: options.silenceWarnings,
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

  const parsed = parse(yaml);
  const projectName = parsed?.name || "mesh-e2e";

  // Stale-project cleanup before up (quietly)
  await teardownCompose(yaml, meshDir, { removeVolumes: true, silent: true });

  // Stateful tracking
  writeRunState(meshDir, {
    projectName,
    stage: "test-e2e",
    projectDir: meshDir,
  });

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
    await teardownCompose(yaml, meshDir, { removeVolumes: true });
    clearRunState(meshDir);
  }

  if (status === 0) {
    console.log(pc.bold(pc.green(`\n✅ Global E2E tests passed successfully.\n`)));
  } else {
    console.error(pc.red(`\n❌ Global E2E tests failed with exit code ${status}.\n`));
  }

  return status;
}
