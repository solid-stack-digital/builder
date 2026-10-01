import { compileEnvironment } from "../compileEnvironment.js";
import { runCompose } from "../runCompose.js";
import type { RunOptions } from "../RunOptions.js";
import pc from "picocolors";

export const runDev = (options: RunOptions): number => {
  console.log(pc.cyan(`🚀 Starting DEV environment...`));
  const finalYamlConfig = compileEnvironment("dev", options.projectDir);

  if (options.debug) {
    console.log(
      pc.yellow("Final merged YAML configuration:\n"),
      finalYamlConfig,
    );
  }

  const upArgs = ["up", "--build"];
  if (options.detach) {
    upArgs.push("-d");
  }

  const status = runCompose(upArgs, finalYamlConfig, options.projectDir);
  return status;
};
