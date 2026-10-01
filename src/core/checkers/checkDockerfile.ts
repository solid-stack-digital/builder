import { existsSync } from "node:fs";
import path from "node:path";
import pc from "picocolors";
import { ScriptError } from "../../errors/ScriptError.js";
import type { BuildJson } from "../../types/index.js";
import { runStep } from "./runStep.js";

export function checkDockerfile(buildJson: BuildJson, projectDir: string): void {
  const dockerfileRel = (buildJson.dockerfile as string | undefined) || "Dockerfile";
  const dockerfilePath = path.resolve(projectDir, dockerfileRel);

  if (!existsSync(dockerfilePath)) {
    if (buildJson.dockerfile) {
      throw new ScriptError(
        `Dockerfile declared in build.json not found at: ${dockerfilePath}`
      );
    }
    console.log(
      pc.yellow(`⚠️  No ${dockerfileRel} found in project directory. Skipping Dockerfile checks.`)
    );
    return;
  }

  console.log(pc.cyan(`\n🔍 1. Linting Dockerfile (${dockerfileRel})...`));
  runStep(
    `docker run --rm -i hadolint/hadolint hadolint --failure-threshold error - < "${dockerfileRel}"`,
    projectDir,
    { stepName: "Dockerfile Linting", targetFile: dockerfileRel }
  );
}
