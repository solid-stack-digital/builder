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
    return await runDev(runOptions);
  }

  if (stage === "prod") {
    return await runProd(runOptions);
  }

  if (stage === "test-unit") {
    return await runTestUnit(runOptions);
  }

  if (stage === "test-e2e") {
    return await runTestE2e(runOptions);
  }

  if (stage === "test") {
    return await runTest(runOptions);
  }

  throw new ScriptError(
    `Unknown environment stage: "${rawStage}". Supported stages: ${SERVICE_STAGES.join(", ")}`
  );
}
