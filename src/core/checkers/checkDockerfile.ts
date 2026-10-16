import { resolveApplicationDockerfile } from "../config/pathSafety.js";
import { readFileSync } from "node:fs";
import pc from "picocolors";
import type { BuildJson } from "../../types/index.js";
import { HADOLINT_IMAGE } from "./constants.js";
import { runStep } from "./runStep.js";

export function checkDockerfile(buildJson: BuildJson, projectDir: string): void {
  const dockerfileRel = "Dockerfile";
  const dockerfilePath = resolveApplicationDockerfile(projectDir, dockerfileRel);

  const content = readFileSync(dockerfilePath, "utf-8");

  console.log(pc.cyan(`\n🔍 Linting Dockerfile (${dockerfileRel})...`));
  runStep(
    "docker",
    ["run", "--rm", "-i", "--network", "none", HADOLINT_IMAGE, "hadolint", "--failure-threshold", "error", "-"],
    projectDir,
    { stepName: "Dockerfile Linting", targetFile: dockerfileRel, input: content }
  );
}
