import pc from "picocolors";
import { ScriptError } from "../../../../errors/ScriptError.js";
import type { ServiceUpOptions } from "../../../../types/index.js";
import { checkDependencies } from "../../../../utils/checkDependencies.js";
import { checkInfra } from "../../../checkInfra.js";
import { runDev } from "@/core/runners/runDev.js";
import { runProd } from "@/core/runners/runProd.js";
import { runTestE2e } from "@/core/runners/runTestE2e.js";
import { runTestUnit } from "@/core/runners/runTestUnit.js";

export async function handleServiceUp(
  rawStage?: string,
  options: ServiceUpOptions = {},
): Promise<number> {
  const projectDir = options.projectDir || process.cwd();
  const stage = (rawStage || "dev").toLowerCase();

  // Validate dependencies (e.g. docker installed)
  checkDependencies();

  checkInfra(projectDir);

  const runOptions = {
    projectDir,
    debug: options.debug || false,
    detach: options.detach || false,
  };

  if (stage === "dev") {
    const status = runDev(runOptions);
    return status;
  }

  if (stage === "prod") {
    const status = runProd(runOptions);
    return status;
  }

  if (stage === "test-unit") {
    const status = runTestUnit(runOptions);
    return status;
  }

  if (stage === "test-e2e") {
    const status = runTestE2e(runOptions);
    return status;
  }

  if (stage === "test") {
    // --- STAGE 1: Unit & Isolated Tests ---
    console.log(pc.bold(pc.blue(`\n========================================`)));
    console.log(pc.bold(pc.blue(`🧪 [1/2] STAGE: UNIT & ISOLATED TESTS`)));
    console.log(pc.bold(pc.blue(`========================================\n`)));

    const unitStatus = runTestUnit(runOptions);

    if (unitStatus !== 0) {
      console.error(
        pc.red(
          `\n❌ [1/2] Unit tests failed with exit code ${unitStatus}. Aborting E2E tests.\n`,
        ),
      );
      return unitStatus;
    }

    console.log(
      pc.bold(pc.green(`\n✅ [1/2] Unit tests passed successfully.\n`)),
    );

    // --- STAGE 2: Integrated E2E Tests ---
    console.log(pc.bold(pc.blue(`========================================`)));
    console.log(pc.bold(pc.blue(`🚦 [2/2] STAGE: INTEGRATED E2E TESTS`)));
    console.log(pc.bold(pc.blue(`========================================\n`)));

    const e2eStatus = runTestE2e(runOptions);

    if (e2eStatus !== 0) {
      console.error(
        pc.red(`\n❌ [2/2] E2E tests failed with exit code ${e2eStatus}.\n`),
      );
      return e2eStatus;
    }

    console.log(
      pc.bold(pc.green(`\n✅ [2/2] E2E tests passed successfully.\n`)),
    );
    console.log(
      pc.bold(
        pc.green(`🎉 All test stages (unit + e2e) completed successfully!\n`),
      ),
    );
    return 0;
  }

  throw new ScriptError(
    `Unknown environment stage: "${rawStage}". Supported stages: dev, prod, test, test-unit, test-e2e`,
  );
}
