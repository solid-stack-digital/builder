import pc from "picocolors";
import { resolveProjectDir } from "../../../utils/paths.js";
import { redactYamlSecrets } from "../../../utils/redactSecrets.js";
import { runCompose } from "../../runCompose.js";
import { teardownCompose } from "../../teardownCompose.js";
import { checkMesh } from "../checkers/checkMesh.js";
import { compileMeshEnvironment } from "../compileMeshEnvironment.js";
import type { MeshRunOptions } from "../MeshRunOptions.js";

export async function runMeshDev(options: MeshRunOptions = {}): Promise<number> {
  const meshDir = resolveProjectDir(options.projectDir);

  console.log(pc.cyan(`\n🚀 Starting Global DEV Mesh Environment...`));
  if (!options.skipChecks) {
    checkMesh(meshDir, { requireTester: false });
  }

  const { yaml } = compileMeshEnvironment("dev", meshDir);

  if (options.debug) {
    console.log(
      pc.yellow("\nFinal merged Mesh Dev YAML configuration:\n"),
      redactYamlSecrets(yaml)
    );
  }

  if (options.dryRun) {
    console.log(pc.green("Dry run complete. Compose was not started."));
    return 0;
  }

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
      teardownCompose(yaml, meshDir, { removeVolumes: false });
    }
  }
  return status;
}
