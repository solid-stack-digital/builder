import { spawnSync } from "node:child_process";
import pc from "picocolors";
import { compileEnvironment } from "../core/compileEnvironment.js";
import { ScriptError } from "../errors/ScriptError.js";
import type { Environment, ServiceUpOptions } from "../types/index.js";
import { checkDependencies } from "../utils/checkDependencies.js";
import { checkInfra } from "./checkInfra.js";

function runCompose(
  args: string[],
  yamlConfig: string,
  projectDir: string
): number {
  const runResult = spawnSync(
    "docker",
    ["compose", "--project-directory", projectDir, "-f", "-", ...args],
    {
      cwd: projectDir,
      input: yamlConfig,
      stdio: ["pipe", "inherit", "inherit"],
      encoding: "utf-8",
    }
  );

  if (runResult.error) {
    throw new ScriptError(
      `Failed to run docker compose: ${runResult.error.message}`
    );
  }

  return runResult.status ?? (runResult.error ? 1 : 0);
}

function teardownCompose(yamlConfig: string, projectDir: string): void {
  const downResult = spawnSync(
    "docker",
    [
      "compose",
      "--project-directory",
      projectDir,
      "-f",
      "-",
      "down",
      "-v",
      "--remove-orphans",
    ],
    {
      cwd: projectDir,
      input: yamlConfig,
      stdio: ["pipe", "inherit", "inherit"],
      encoding: "utf-8",
    }
  );

  if (downResult.error) {
    console.error(
      pc.red(`Failed to run docker compose down: ${downResult.error.message}`)
    );
  }
}

export async function handleServiceUp(
  rawStage?: string,
  options: ServiceUpOptions = {}
): Promise<number> {
  const projectDir = options.projectDir || process.cwd();
  const stage = (rawStage || "dev").toLowerCase();

  // Validate dependencies (e.g. docker installed)
  checkDependencies();

  // Check infrastructure (unless explicitly skipped)
  if (!options.skipCheck) {
    checkInfra(projectDir);
  }

  if (stage === "dev") {
    console.log(pc.cyan(`🚀 Starting DEV environment...`));
    const finalYamlConfig = compileEnvironment("dev", projectDir);

    if (options.dryRun || options.debug || process.env.CI_DEBUG === "true") {
      console.log(pc.yellow("Final merged YAML configuration:\n"), finalYamlConfig);
    }

    if (options.dryRun) {
      console.log(pc.green("✅ Dry run completed successfully."));
      return 0;
    }

    const upArgs = ["up", "--build"];
    if (options.detach) {
      upArgs.push("-d");
    }

    const status = runCompose(upArgs, finalYamlConfig, projectDir);
    return status;
  }

  if (stage === "prod") {
    console.log(pc.cyan(`🏭 Starting PROD environment...`));
    const finalYamlConfig = compileEnvironment("prod", projectDir);

    if (options.dryRun || options.debug || process.env.CI_DEBUG === "true") {
      console.log(pc.yellow("Final merged YAML configuration:\n"), finalYamlConfig);
    }

    if (options.dryRun) {
      console.log(pc.green("✅ Dry run completed successfully."));
      return 0;
    }

    const upArgs = ["up", "--build"];
    if (options.detach) {
      upArgs.push("-d");
    }

    const status = runCompose(upArgs, finalYamlConfig, projectDir);
    return status;
  }

  if (stage === "test-unit" || (stage === "test" && options.unit && !options.e2e)) {
    console.log(pc.bold(pc.blue(`\n========================================`)));
    console.log(pc.bold(pc.blue(`🧪 STAGE: UNIT & ISOLATED TESTS`)));
    console.log(pc.bold(pc.blue(`========================================\n`)));
    const finalYamlConfig = compileEnvironment("test", projectDir);

    if (options.dryRun || options.debug || process.env.CI_DEBUG === "true") {
      console.log(pc.yellow("Final merged YAML configuration:\n"), finalYamlConfig);
    }

    if (options.dryRun) {
      console.log(pc.green("✅ Dry run completed successfully."));
      return 0;
    }

    let status = 0;
    try {
      status = runCompose(
        ["up", "--build", "--abort-on-container-exit"],
        finalYamlConfig,
        projectDir
      );
    } finally {
      teardownCompose(finalYamlConfig, projectDir);
    }

    if (status === 0) {
      console.log(pc.bold(pc.green(`\n✅ Unit tests passed successfully.\n`)));
    } else {
      console.error(pc.red(`\n❌ Unit tests failed with exit code ${status}.\n`));
    }
    return status;
  }

  if (
    stage === "test-e2e" ||
    stage === "e2e" ||
    (stage === "test" && options.e2e && !options.unit)
  ) {
    console.log(pc.bold(pc.blue(`\n========================================`)));
    console.log(pc.bold(pc.blue(`🚦 STAGE: INTEGRATED E2E TESTS`)));
    console.log(pc.bold(pc.blue(`========================================\n`)));
    const finalYamlConfig = compileEnvironment("e2e", projectDir);

    if (options.dryRun || options.debug || process.env.CI_DEBUG === "true") {
      console.log(pc.yellow("Final merged YAML configuration:\n"), finalYamlConfig);
    }

    if (options.dryRun) {
      console.log(pc.green("✅ Dry run completed successfully."));
      return 0;
    }

    let status = 0;
    try {
      status = runCompose(
        [
          "up",
          "--build",
          "--abort-on-container-exit",
          "--exit-code-from",
          "tester",
        ],
        finalYamlConfig,
        projectDir
      );
    } finally {
      teardownCompose(finalYamlConfig, projectDir);
    }

    if (status === 0) {
      console.log(pc.bold(pc.green(`\n✅ E2E tests passed successfully.\n`)));
    } else {
      console.error(pc.red(`\n❌ E2E tests failed with exit code ${status}.\n`));
    }
    return status;
  }

  if (stage === "test") {
    if (options.dryRun) {
      console.log(pc.bold(pc.blue(`\n========================================`)));
      console.log(pc.bold(pc.blue(`🧪 [1/2] STAGE: UNIT & ISOLATED TESTS`)));
      console.log(pc.bold(pc.blue(`========================================\n`)));
      const unitYaml = compileEnvironment("test", projectDir);
      console.log(pc.yellow("Unit Test YAML configuration:\n"), unitYaml);

      console.log(pc.bold(pc.blue(`\n========================================`)));
      console.log(pc.bold(pc.blue(`🚦 [2/2] STAGE: INTEGRATED E2E TESTS`)));
      console.log(pc.bold(pc.blue(`========================================\n`)));
      const e2eYaml = compileEnvironment("e2e", projectDir);
      console.log(pc.yellow("E2E Test YAML configuration:\n"), e2eYaml);

      console.log(pc.green("✅ Dry run completed successfully for all test stages."));
      return 0;
    }

    // --- STAGE 1: Unit & Isolated Tests ---
    console.log(pc.bold(pc.blue(`\n========================================`)));
    console.log(pc.bold(pc.blue(`🧪 [1/2] STAGE: UNIT & ISOLATED TESTS`)));
    console.log(pc.bold(pc.blue(`========================================\n`)));

    const unitYaml = compileEnvironment("test", projectDir);
    if (options.debug || process.env.CI_DEBUG === "true") {
      console.log(pc.yellow("Unit Test YAML configuration:\n"), unitYaml);
    }

    let unitStatus = 0;
    try {
      unitStatus = runCompose(
        ["up", "--build", "--abort-on-container-exit"],
        unitYaml,
        projectDir
      );
    } finally {
      teardownCompose(unitYaml, projectDir);
    }

    if (unitStatus !== 0) {
      console.error(pc.red(`\n❌ [1/2] Unit tests failed with exit code ${unitStatus}. Aborting E2E tests.\n`));
      return unitStatus;
    }

    console.log(pc.bold(pc.green(`\n✅ [1/2] Unit tests passed successfully.\n`)));

    // --- STAGE 2: Integrated E2E Tests ---
    console.log(pc.bold(pc.blue(`========================================`)));
    console.log(pc.bold(pc.blue(`🚦 [2/2] STAGE: INTEGRATED E2E TESTS`)));
    console.log(pc.bold(pc.blue(`========================================\n`)));

    const e2eYaml = compileEnvironment("e2e", projectDir);
    if (options.debug || process.env.CI_DEBUG === "true") {
      console.log(pc.yellow("E2E Test YAML configuration:\n"), e2eYaml);
    }

    let e2eStatus = 0;
    try {
      e2eStatus = runCompose(
        [
          "up",
          "--build",
          "--abort-on-container-exit",
          "--exit-code-from",
          "tester",
        ],
        e2eYaml,
        projectDir
      );
    } finally {
      teardownCompose(e2eYaml, projectDir);
    }

    if (e2eStatus !== 0) {
      console.error(pc.red(`\n❌ [2/2] E2E tests failed with exit code ${e2eStatus}.\n`));
      return e2eStatus;
    }

    console.log(pc.bold(pc.green(`\n✅ [2/2] E2E tests passed successfully.\n`)));
    console.log(pc.bold(pc.green(`🎉 All test stages (unit + e2e) completed successfully!\n`)));
    return 0;
  }

  throw new ScriptError(
    `Unknown environment stage: "${rawStage}". Supported stages: dev, prod, test, test-unit, test-e2e`
  );
}
