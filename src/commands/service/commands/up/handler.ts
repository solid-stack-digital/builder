import pc from "picocolors";
import { ScriptError } from "../../../../errors/ScriptError.js";
import type { ServiceUpOptions } from "../../../../types/index.js";
import { checkDependencies } from "../../../../utils/checkDependencies.js";
import { checkInfra } from "../../../checkInfra.js";
import { runDev } from "@/core/runners/runDev.js";
import { runProd } from "@/core/runners/runProd.js";
import { runTestE2e } from "@/core/runners/runTestE2e.js";
import { runTestUnit } from "@/core/runners/runTestUnit.js";
import { runTest } from "@/core/runners/runTest.js";

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
    const status = runTest(runOptions);
    return status;
  }

  throw new ScriptError(
    `Unknown environment stage: "${rawStage}". Supported stages: dev, prod, test, test-unit, test-e2e`,
  );
}
