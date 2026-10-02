import pc from "picocolors";
import { compileMeshEnvironment } from "../../../../core/mesh/compileMeshEnvironment.js";
import type { MeshDownOptions } from "../../../../core/mesh/MeshRunOptions.js";
import { teardownCompose } from "../../../../core/teardownCompose.js";
import { ScriptError } from "../../../../errors/ScriptError.js";
import { resolveProjectDir } from "../../../../utils/paths.js";
import { redactYamlSecrets } from "../../../../utils/redactSecrets.js";
import {
  clearRunState,
  projectNamesForMeshStage,
  readRunState,
} from "../../../../utils/runState.js";

export async function handleMeshDown(
  rawStage: string = "dev",
  options: MeshDownOptions = {}
): Promise<number> {
  const stage = (rawStage || "dev").toLowerCase();
  const meshDir = resolveProjectDir(options.projectDir);

  const validStages = ["dev", "prod", "test", "test-unit", "test-e2e"];
  if (!validStages.includes(stage)) {
    throw new ScriptError(
      `Unknown mesh stage: "${rawStage}". Supported stages: dev, prod, test, test-unit, test-e2e`
    );
  }

  console.log(
    pc.cyan(`\n🧹 Stopping and tearing down global mesh environment [${stage}]...`)
  );

  if (options.debug) {
    try {
      const mode = stage === "dev" ? "dev" : "prod";
      const includeTester = stage === "test" || stage === "test-e2e";
      const { yaml } = compileMeshEnvironment(mode, meshDir, { includeTester });
      console.log(
        pc.yellow("\nFinal merged Mesh YAML configuration:\n"),
        redactYamlSecrets(yaml)
      );
    } catch {
      // Non-critical if YAML compilation fails during down --debug
    }
  }

  // H6: Robust teardown by project name (does not fail when YAML/env files are broken)
  const runState = readRunState(meshDir);
  const candidateProjects = projectNamesForMeshStage(meshDir, stage);
  if (runState?.projectName) {
    candidateProjects.unshift(runState.projectName);
  }
  const uniqueProjects = Array.from(new Set(candidateProjects));

  for (const proj of uniqueProjects) {
    await teardownCompose("", meshDir, {
      projectName: proj,
      removeVolumes: Boolean(options.volumes),
    });
  }

  clearRunState(meshDir);

  console.log(
    pc.green(`✅ Global mesh environment [${stage}] stopped and removed.\n`)
  );
  return 0;
}

