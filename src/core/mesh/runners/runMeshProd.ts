import pc from "picocolors";
import { parse } from "yaml";
import { checkHostPortCollisions, extractHostPorts } from "../../../utils/checkPortCollision.js";
import { resolveProjectDir } from "../../../utils/paths.js";
import { redactYamlSecrets } from "../../../utils/redactSecrets.js";
import { clearRunState, writeRunState } from "../../../utils/runState.js";
import { runCompose } from "../../runCompose.js";
import { teardownCompose } from "../../teardownCompose.js";
import { checkMesh } from "../checkers/checkMesh.js";
import { compileMeshEnvironment } from "../compileMeshEnvironment.js";
import type { MeshRunOptions } from "../MeshRunOptions.js";

export async function runMeshProd(options: MeshRunOptions = {}): Promise<number> {
  const meshDir = resolveProjectDir(options.projectDir);

  console.log(pc.cyan(`\n🏭 Starting Global PROD Mesh Environment...`));
  if (!options.skipChecks) {
    checkMesh(meshDir, { requireTester: false });
  }

  const { yaml } = compileMeshEnvironment("prod", meshDir);
  const parsed = parse(yaml);
  const projectName = parsed?.name || "mesh-prod";

  if (options.debug) {
    console.log(
      pc.yellow("\nFinal merged Mesh Prod YAML configuration:\n"),
      redactYamlSecrets(yaml)
    );
  }

  if (options.dryRun) {
    console.log(pc.green("Dry run complete. Compose was not started."));
    return 0;
  }

  // Pre-flight host port collision warning
  const hostPorts = extractHostPorts(yaml);
  await checkHostPortCollisions(hostPorts);

  // Stateful tracking
  writeRunState(meshDir, {
    projectName,
    stage: "prod",
    projectDir: meshDir,
  });

  const upArgs = ["up", "--build"];
  if (options.detach) {
    upArgs.push("-d");
  }

  let status = 0;
  try {
    status = await runCompose(upArgs, yaml, meshDir, {
      removeVolumes: false,
    });
  } finally {
    if (!options.detach) {
      await teardownCompose(yaml, meshDir, { removeVolumes: false });
      clearRunState(meshDir);
    }
  }
  return status;
}
