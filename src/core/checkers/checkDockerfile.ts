import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import pc from "picocolors";
import { ScriptError } from "../../errors/ScriptError.js";
import type { BuildJson } from "../../types/index.js";
import { isPathInside } from "../../utils/paths.js";
import { HADOLINT_IMAGE } from "./constants.js";
import { runStep } from "./runStep.js";

export function checkDockerfile(buildJson: BuildJson, projectDir: string): void {
  const dockerfileRel = (buildJson.dockerfile as string | undefined) || "Dockerfile";
  const dockerfilePath = path.resolve(projectDir, dockerfileRel);

  if (!isPathInside(projectDir, dockerfilePath)) {
    throw new ScriptError(
      `Security error: Dockerfile path "${dockerfileRel}" escapes the project directory.`
    );
  }

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

  const content = readFileSync(dockerfilePath, "utf-8");

  console.log(pc.cyan(`\n🔍 Linting Dockerfile (${dockerfileRel})...`));
  runStep(
    "docker",
    ["run", "--rm", "-i", "--network", "none", HADOLINT_IMAGE, "hadolint", "--failure-threshold", "error", "-"],
    projectDir,
    { stepName: "Dockerfile Linting", targetFile: dockerfileRel, input: content }
  );
}
