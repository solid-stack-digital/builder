import pc from "picocolors";
import { compileEnvironment } from "../../../../core/compileEnvironment.js";
import { teardownCompose } from "../../../../core/teardownCompose.js";
import { ScriptError } from "../../../../errors/ScriptError.js";
import type { Environment, ServiceDownOptions } from "../../../../types/index.js";
import { resolveProjectDir } from "../../../../utils/paths.js";
import { redactYamlSecrets } from "../../../../utils/redactSecrets.js";

export async function handleServiceDown(
  rawStage: string = "dev",
  options: ServiceDownOptions = {}
): Promise<number> {
  const projectDir = resolveProjectDir(options.projectDir);
  const stage = (rawStage || "dev").toLowerCase();

  let env: Environment;
  if (stage === "dev") {
    env = "dev";
  } else if (stage === "prod") {
    env = "prod";
  } else if (stage === "test" || stage === "test-unit") {
    env = "test";
  } else if (stage === "test-e2e") {
    env = "e2e";
  } else {
    throw new ScriptError(
      `Unknown environment stage: "${rawStage}". Supported stages: dev, prod, test, test-unit, test-e2e`
    );
  }

  console.log(
    pc.cyan(`\n🧹 Stopping and tearing down service environment [${stage}]...`)
  );
  const finalYamlConfig = compileEnvironment(env, projectDir);

  if (options.debug) {
    console.log(
      pc.yellow("Final merged YAML configuration:\n"),
      redactYamlSecrets(finalYamlConfig)
    );
  }

  teardownCompose(finalYamlConfig, projectDir, {
    removeVolumes: Boolean(options.volumes),
  });

  console.log(
    pc.green(`✅ Service environment [${stage}] stopped and removed.\n`)
  );
  return 0;
}
