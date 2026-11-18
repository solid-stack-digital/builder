import type { RunOptions } from "../RunOptions.js";
import pc from "picocolors";
import { runTestUnit, type UnitRuntimeAdapters } from "./runTestUnit.js";
import { runTestE2e, type E2eRuntimeAdapters } from "./runTestE2e.js";
import { compileServiceComposition } from "../composition/compileServiceComposition.js";
import { currentOutput } from "../output/index.js";

export interface TestRuntimeAdapters { unit?:UnitRuntimeAdapters; e2e?:E2eRuntimeAdapters }
export const runTest = async (options: RunOptions,adapters:TestRuntimeAdapters={}): Promise<number> => {
  compileServiceComposition("test",options.projectDir,{validationMode:true});
  compileServiceComposition("e2e",options.projectDir,{validationMode:true});
  // --- STAGE 1: Unit & Isolated Tests ---
  currentOutput().log(pc.bold(pc.blue(`\n========================================`)));
  currentOutput().log(pc.bold(pc.blue(`🧪 [1/2] STAGE: UNIT & ISOLATED TESTS`)));
  currentOutput().log(pc.bold(pc.blue(`========================================\n`)));

  const unitStatus = await runTestUnit({ ...options, skipBanner: true },adapters.unit);

  if (unitStatus !== 0) {
    currentOutput().error(
      pc.red(
        `\n❌ [1/2] Unit tests failed with exit code ${unitStatus}. Aborting E2E tests.\n`,
      ),
    );
    return unitStatus;
  }

  currentOutput().log(
    pc.bold(pc.green(`\n✅ [1/2] Unit tests passed successfully.\n`)),
  );

  // --- STAGE 2: Integrated E2E Tests ---
  currentOutput().log(pc.bold(pc.blue(`========================================`)));
  currentOutput().log(pc.bold(pc.blue(`🚦 [2/2] STAGE: INTEGRATED E2E TESTS`)));
  currentOutput().log(pc.bold(pc.blue(`========================================\n`)));

  const e2eStatus = await runTestE2e({ ...options, skipBanner: true },adapters.e2e);

  if (e2eStatus !== 0) {
    currentOutput().error(
      pc.red(`\n❌ [2/2] E2E tests failed with exit code ${e2eStatus}.\n`),
    );
    return e2eStatus;
  }

  currentOutput().log(pc.bold(pc.green(`\n✅ [2/2] E2E tests passed successfully.\n`)));
  currentOutput().log(
    pc.bold(
      pc.green(`🎉 All test stages (unit + e2e) completed successfully!\n`),
    ),
  );
  return 0;
};
