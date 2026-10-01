import pc from "picocolors"; 
import { compileEnvironment } from "../compileEnvironment.js";
import { runCompose } from "../runCompose.js";
import type { RunOptions } from "../RunOptions.js";
import { teardownCompose } from "../teardownCompose.js";

export const runTestUnit = (options: RunOptions): number => {
  console.log(pc.bold(pc.blue(`\n========================================`)));
  console.log(pc.bold(pc.blue(`🧪 STAGE: UNIT & ISOLATED TESTS`)));
  console.log(pc.bold(pc.blue(`========================================\n`)));
  const finalYamlConfig = compileEnvironment("test", options.projectDir);

  if (options.debug) {
    console.log(
      pc.yellow("Final merged YAML configuration:\n"),
      finalYamlConfig,
    );
  }

  let status = 0;
  try {
    status = runCompose(
      ["up", "--build", "--abort-on-container-exit"],
      finalYamlConfig,
      options.projectDir,
    );
  } finally {
    teardownCompose(finalYamlConfig, options.projectDir);
  }

  if (status === 0) {
    console.log(pc.bold(pc.green(`\n✅ Unit tests passed successfully.\n`)));
  } else {
    console.error(pc.red(`\n❌ Unit tests failed with exit code ${status}.\n`));
  }
  return status;
};
