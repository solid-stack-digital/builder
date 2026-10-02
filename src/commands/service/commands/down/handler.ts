import pc from "picocolors";
import { compileEnvironment } from "../../../../core/compileEnvironment.js";
import { teardownCompose } from "../../../../core/teardownCompose.js";
import { ScriptError } from "../../../../errors/ScriptError.js";
import type { Environment, ServiceDownOptions } from "../../../../types/index.js";
import { resolveProjectDir } from "../../../../utils/paths.js";
import { redactYamlSecrets } from "../../../../utils/redactSecrets.js";
import {
  clearRunState,
  projectNamesForServiceStage,
  readRunState,
} from "../../../../utils/runState.js";

export async function handleServiceDown(
  rawStage: string = "dev",
  options: ServiceDownOptions = {}
): Promise<number> {
  const projectDir = resolveProjectDir(options.projectDir);
  const stage = (rawStage || "dev").toLowerCase();

  const validStages = ["dev", "prod", "test", "test-unit", "test-e2e"];
  if (!validStages.includes(stage)) {
    throw new ScriptError(
      `Unknown environment stage: "${rawStage}". Supported stages: dev, prod, test, test-unit, test-e2e`
    );
  }

  console.log(
    pc.cyan(`\n🧹 Stopping and tearing down service environment [${stage}]...`)
  );

  if (options.debug) {
    try {
      let env: Environment = "dev";
      if (stage === "prod") env = "prod";
      else if (stage === "test" || stage === "test-unit") env = "test";
      else if (stage === "test-e2e") env = "e2e";

      const finalYamlConfig = compileEnvironment(env, projectDir);
      console.log(
        pc.yellow("Final merged YAML configuration:\n"),
        redactYamlSecrets(finalYamlConfig)
      );
    } catch {
      // Non-critical if YAML compilation fails during down --debug
    }
  }

  // H6: Robust teardown by project name (does not fail when YAML/env files are broken)
  const runState = readRunState(projectDir);
  const candidateProjects = projectNamesForServiceStage(projectDir, stage);
  if (runState?.projectName) {
    candidateProjects.unshift(runState.projectName);
  }
  const uniqueProjects = Array.from(new Set(candidateProjects));

  for (const proj of uniqueProjects) {
    await teardownCompose("", projectDir, {
      projectName: proj,
      removeVolumes: Boolean(options.volumes),
    });
  }

  clearRunState(projectDir);

  console.log(
    pc.green(`✅ Service environment [${stage}] stopped and removed.\n`)
  );
  return 0;
}

