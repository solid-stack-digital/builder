import path from "node:path";
import pc from "picocolors";
import { runCompose } from "../../runCompose.js";
import { checkMesh } from "../checkers/checkMesh.js";
import { compileMeshEnvironment } from "../compileMeshEnvironment.js";
import type { MeshRunOptions } from "../MeshRunOptions.js";

export function runMeshProd(options: MeshRunOptions = {}): number {
  const meshDir = path.resolve(options.projectDir || process.cwd());

  console.log(pc.cyan(`\n🏭 Starting Global PROD Mesh Environment...`));
  checkMesh(meshDir, { requireTester: false });

  const { yaml } = compileMeshEnvironment("prod", meshDir);

  if (options.debug) {
    console.log(
      pc.yellow("\nFinal merged Mesh Prod YAML configuration:\n"),
      yaml
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
