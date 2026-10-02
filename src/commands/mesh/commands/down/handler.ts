import pc from "picocolors";
import { compileMeshEnvironment } from "../../../../core/mesh/compileMeshEnvironment.js";
import type { MeshDownOptions } from "../../../../core/mesh/MeshRunOptions.js";
import { teardownCompose } from "../../../../core/teardownCompose.js";
import { ScriptError } from "../../../../errors/ScriptError.js";
import { resolveProjectDir } from "../../../../utils/paths.js";
import { redactYamlSecrets } from "../../../../utils/redactSecrets.js";

export async function handleMeshDown(
  rawStage: string = "dev",
  options: MeshDownOptions = {}
): Promise<number> {
  const stage = (rawStage || "dev").toLowerCase();
  const meshDir = resolveProjectDir(options.projectDir);

  let mode: "dev" | "prod";
  let includeTester = false;

  if (stage === "dev") {
    mode = "dev";
  } else if (stage === "prod") {
    mode = "prod";
  } else if (stage === "test-e2e" || stage === "test") {
    mode = "prod";
    includeTester = true;
  } else {
    throw new ScriptError(
      `Unknown mesh stage: "${rawStage}". Supported stages: dev, prod, test, test-e2e`
    );
  }

  console.log(
    pc.cyan(`\n🧹 Stopping and tearing down global mesh environment [${stage}]...`)
  );
  const { yaml } = compileMeshEnvironment(mode, meshDir, { includeTester });

  if (options.debug) {
    console.log(
      pc.yellow("\nFinal merged Mesh YAML configuration:\n"),
      redactYamlSecrets(yaml)
    );
  }

  teardownCompose(yaml, meshDir, {
    removeVolumes: Boolean(options.volumes),
  });

  console.log(
    pc.green(`✅ Global mesh environment [${stage}] stopped and removed.\n`)
  );
  return 0;
}
