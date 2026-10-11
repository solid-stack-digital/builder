import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import pc from "picocolors";
import { ScriptError } from "../../errors/ScriptError.js";
import { ConfigError } from "../../errors/ConfigError.js";
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
    throw new ConfigError({sourceFile:path.join(projectDir,"build.json"),configPath:"dockerfile",value:dockerfileRel,composition:"service",reason:`Application Dockerfile not found at ${dockerfilePath}`});
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
