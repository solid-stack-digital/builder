import pc from "picocolors";
import { redactYamlSecrets } from "../../utils/redactSecrets.js";
import { compileEnvironment } from "../compileEnvironment.js";
import { runCompose } from "../runCompose.js";
import type { RunOptions } from "../RunOptions.js";
import { teardownCompose } from "../teardownCompose.js";

export const runProd = async (options: RunOptions): Promise<number> => {
  console.log(pc.cyan(`🏭 Starting PROD environment...`));
  const finalYamlConfig = compileEnvironment("prod", options.projectDir);

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
      teardownCompose(finalYamlConfig, options.projectDir, {
        removeVolumes: false,
      });
    }
  }
  return status;
};
