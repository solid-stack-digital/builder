import pc from "picocolors";
import { resolveProjectDir } from "../../../utils/paths.js";
import { redactYamlSecrets } from "../../../utils/redactSecrets.js";
import { runCompose } from "../../runCompose.js";
import { checkMesh } from "../checkers/checkMesh.js";
import { compileMeshEnvironment } from "../compileMeshEnvironment.js";
import type { MeshRunOptions } from "../MeshRunOptions.js";

export function runMeshDev(options: MeshRunOptions = {}): number {
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

  const status = runCompose(upArgs, yaml, meshDir);
  return status;
}
