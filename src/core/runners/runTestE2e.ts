import pc from "picocolors";
import { parse } from "yaml";
import { redactYamlSecrets } from "../../utils/redactSecrets.js";
import { clearRunState, writeRunState } from "../../utils/runState.js";
import { compileEnvironment } from "../compileEnvironment.js";
import { runCompose } from "../runCompose.js";
import type { RunOptions } from "../RunOptions.js";
import { teardownCompose } from "../teardownCompose.js";

export const runTestE2e = async (options: RunOptions): Promise<number> => {
  if (!options.skipBanner) {
    console.log(pc.bold(pc.blue(`\n========================================`)));
    console.log(pc.bold(pc.blue(`🚦 STAGE: INTEGRATED E2E TESTS`)));
    console.log(pc.bold(pc.blue(`========================================\n`)));
  }
  const finalYamlConfig = compileEnvironment("e2e", options.projectDir);
  const parsed = parse(finalYamlConfig);
  const projectName = parsed?.name || "e2e";

  if (options.debug) {
    console.log(
      pc.yellow("Final merged YAML configuration:\n"),
      redactYamlSecrets(finalYamlConfig)
    );
  }

  if (options.dryRun) {
    console.log(pc.green("[DRY-RUN] E2E tests simulated. Compose was not started."));
    return 0;
  }

  // Stale-project cleanup before up (quietly)
  await teardownCompose(finalYamlConfig, options.projectDir, {
    removeVolumes: true,
    silent: true,
  });

  // Stateful tracking
  writeRunState(options.projectDir, {
    projectName,
    stage: "test-e2e",
    projectDir: options.projectDir,
  });

  let status = 0;
  try {
    status = await runCompose(
      [
        "up",
        "--build",
        "--abort-on-container-exit",
        "--exit-code-from",
        "tester",
      ],
      finalYamlConfig,
      options.projectDir,
      { removeVolumes: true }
    );
  } finally {
    await teardownCompose(finalYamlConfig, options.projectDir, { removeVolumes: true });
    clearRunState(options.projectDir);
  }

  if (status === 0) {
    console.log(pc.bold(pc.green(`\n✅ E2E tests passed successfully.\n`)));
  } else {
    console.error(pc.red(`\n❌ E2E tests failed with exit code ${status}.\n`));
  }
  return status;
};
