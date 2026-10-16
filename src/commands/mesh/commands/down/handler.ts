import path from "node:path";
import { getMeshJson } from "../../../../core/mesh/getMeshJson.js";
import { resolveInsideProject } from "../../../../core/config/pathSafety.js";
import { MESH_COMMAND_STAGES } from "../../../../core/mesh/types.js";
import { handleServiceDown } from "../../../service/commands/down/handler.js";
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

function rootServiceDirsForCleanup(meshDir: string): string[] {
  try {
    const mesh = getMeshJson(meshDir);
    const dirs = Object.entries(mesh.services)
      .sort(([a], [b]) => a.localeCompare(b))
      .filter(([name]) => name !== "tester")
      .map(([name, service]) => resolveInsideProject(meshDir, (service as {source:string}).source, {
        sourceFile: path.join(meshDir, "mesh.json"),
        configPath: `services.${name}.source`,
      }));
    return [...new Set(dirs)];
  } catch {
    // Do not parse legacy config with a permissive fallback.
    // Invalid config can still be recovered at the mesh root by saved state.
    return [];
  }
}

export async function handleMeshDown(
  rawStage: string = "dev",
  options: MeshDownOptions = {}
): Promise<number> {
  const stage = (rawStage || "dev").toLowerCase();
  const meshDir = resolveProjectDir(options.projectDir);

  if (stage === "test-unit") {
    throw new ScriptError(
      "mesh down test-unit is no longer supported because meshes have no test topology. " +
      "Use builder service down test-unit -C <service> for service recovery, " +
      "or builder mesh down test for the complete test pipeline.",
    );
  }
  if (!(MESH_COMMAND_STAGES as readonly string[]).includes(stage)) {
    throw new ScriptError(
      `Unknown mesh stage: "${rawStage}". Supported stages: ${MESH_COMMAND_STAGES.join(", ")}`
    );
  }

  console.log(
    pc.cyan(`\n🧹 Stopping and tearing down global mesh environment [${stage}]...`)
  );

  if (options.debug) {
    try {
      const mode = stage === "dev" ? "dev" : stage === "test" || stage === "test-e2e" ? "e2e" : "prod";
      const { yaml } = compileMeshEnvironment(mode, meshDir, { validateWithDocker: false });
      console.log(
        pc.yellow("\nFinal merged Mesh YAML configuration:\n"),
        redactYamlSecrets(yaml)
      );
    } catch {
      // Non-critical if YAML compilation fails during down --debug
    }
  }

  const runState = readRunState(meshDir);
  if (runState && stage !== "test" && runState.stage !== stage) {
    throw new ScriptError(`Saved runtime is for ${runState.stage}; use builder mesh down ${runState.stage} -C ${meshDir}`);
  }
  if (runState && stage === "test" && !["test", "test-e2e"].includes(runState.stage)) {
    throw new ScriptError(`Saved runtime is for ${runState.stage}; use its matching down command`);
  }

  if (stage === "test") {
    for (const serviceDir of rootServiceDirsForCleanup(meshDir)) {
      const status = await handleServiceDown("test", {
        projectDir: serviceDir,
        volumes: Boolean(options.volumes),
        debug: Boolean(options.debug),
      });
      if (status !== 0) return status;
    }
  }

  // H6: Robust teardown by project name (does not fail when YAML/env files are broken)
  const candidateProjects = runState?.projectName
    ? [runState.projectName]
    : projectNamesForMeshStage(meshDir, stage);
  const uniqueProjects = Array.from(new Set(candidateProjects));

  for (const proj of uniqueProjects) {
    await teardownCompose("", meshDir, {
      projectName: proj,
      ...(runState?.projectName === proj && runState.anonymousVolumeServices ? {anonymousVolumeServices: runState.anonymousVolumeServices} : {}),
      removeVolumes: Boolean(options.volumes),
    });
  }

  clearRunState(meshDir);

  console.log(
    pc.green(`✅ Global mesh environment [${stage}] stopped and removed.\n`)
  );
  return 0;
}

