import { runWithCleanup } from "../../runWithCleanup.js";
import { anonymousVolumeServices } from "../../composition/composeVolumes.js";
import pc from "picocolors";
import { parse } from "yaml";
import { checkHostPortCollisions, extractHostPorts } from "../../../utils/checkPortCollision.js";
import { resolveProjectDir } from "../../../utils/paths.js";
import { redactYamlSecrets } from "../../../utils/redactSecrets.js";
import { clearRunState, writeRunState } from "../../../utils/runState.js";
import { runCompose } from "../../runCompose.js";
import { teardownCompose } from "../../teardownCompose.js";
import { compileMeshEnvironment } from "../compileMeshEnvironment.js";
import type { MeshRunOptions } from "../MeshRunOptions.js";

export async function runMeshProd(options: MeshRunOptions = {}): Promise<number> {
  const meshDir = resolveProjectDir(options.projectDir);

  console.log(pc.cyan(`\n🏭 Starting Global PROD Mesh Environment...`));

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
    anonymousVolumeServices: anonymousVolumeServices(parsed?.services ?? {}),
    stage: "prod",
    projectDir: meshDir,
  });

  const upArgs = ["up", "--build"];
  if (options.detach) {
    upArgs.push("-d");
  }

  const status = await runWithCleanup(
    () => runCompose(upArgs, yaml, meshDir, {
      removeVolumes: false,
    }),
    async () => {
      if (!options.detach) {
        await teardownCompose(yaml, meshDir, { removeVolumes: false });
        clearRunState(meshDir);
      }
    },
  );
  return status;
}
