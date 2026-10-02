import { runDev } from "../../../../core/runners/runDev.js";
import { runProd } from "../../../../core/runners/runProd.js";
import { runTest } from "../../../../core/runners/runTest.js";
import { runTestE2e } from "../../../../core/runners/runTestE2e.js";
import { runTestUnit } from "../../../../core/runners/runTestUnit.js";
import { ScriptError } from "../../../../errors/ScriptError.js";
import { SERVICE_STAGES, type ServiceUpOptions } from "../../../../types/index.js";
import { resolveProjectDir } from "../../../../utils/paths.js";

export async function handleServiceUp(
  rawStage?: string,
  options: ServiceUpOptions = {}
): Promise<number> {
  const projectDir = resolveProjectDir(options.projectDir);
  const stage = (rawStage || "dev").toLowerCase();

  const runOptions = {
    projectDir,
    debug: Boolean(options.debug),
    detach: Boolean(options.detach),
    dryRun: Boolean(options.dryRun),
  };

  if (stage === "dev") {
    return runDev(runOptions);
  }

  if (stage === "prod") {
    return runProd(runOptions);
  }

  if (stage === "test-unit") {
    return runTestUnit(runOptions);
  }

  if (stage === "test-e2e") {
    return runTestE2e(runOptions);
  }

  if (stage === "test") {
    return runTest(runOptions);
  }

  throw new ScriptError(
    `Unknown environment stage: "${rawStage}". Supported stages: ${SERVICE_STAGES.join(", ")}`
  );
}
