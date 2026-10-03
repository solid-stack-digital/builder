import pc from "picocolors";
import { parse } from "yaml";
import { checkHostPortCollisions, extractHostPorts } from "../../utils/checkPortCollision.js";
import { redactYamlSecrets } from "../../utils/redactSecrets.js";
import { clearRunState, writeRunState } from "../../utils/runState.js";
import { compileEnvironment } from "../compileEnvironment.js";
import { runCompose } from "../runCompose.js";
import type { RunOptions } from "../RunOptions.js";
import { teardownCompose } from "../teardownCompose.js";

export const runDev = async (options: RunOptions): Promise<number> => {
  console.log(pc.cyan(`🚀 Starting DEV environment...`));
  const finalYamlConfig = compileEnvironment("dev", options.projectDir, {
    silenceWarnings: options.silenceWarnings,
  });
  const parsed = parse(finalYamlConfig);
  const projectName = parsed?.name || "dev";

  if (options.debug) {
    console.log(
      pc.yellow("Final merged YAML configuration:\n"),
      redactYamlSecrets(finalYamlConfig)
    );
  }

  if (options.dryRun) {
    console.log(pc.green("Dry run complete. Compose was not started."));
    return 0;
  }

  // Pre-flight host port collision warning
  const hostPorts = extractHostPorts(finalYamlConfig);
  await checkHostPortCollisions(hostPorts);

  // Stateful tracking
  writeRunState(options.projectDir, {
    projectName,
    stage: "dev",
    projectDir: options.projectDir,
  });

  const upArgs = ["up", "--build"];
  if (options.detach) {
    upArgs.push("-d");
  }

  let status = 0;
  try {
    status = await runCompose(upArgs, finalYamlConfig, options.projectDir, {
      removeVolumes: false,
    });
  } finally {
    if (!options.detach) {
      await teardownCompose(finalYamlConfig, options.projectDir, {
        removeVolumes: false,
      });
      clearRunState(options.projectDir);
    }
  }
  return status;
};
