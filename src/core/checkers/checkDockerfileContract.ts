import { existsSync } from "node:fs";
import path from "node:path";
import pc from "picocolors";
import type { BuildJson } from "../../types/index.js";
import { runStep } from "./runStep.js";

export function checkDockerfileContract(
  buildJson: BuildJson,
  projectDir: string
): void {
  const dockerfileRel =
    (buildJson.dockerfile as string | undefined) || "Dockerfile";
  const dockerfilePath = path.resolve(projectDir, dockerfileRel);

  const policyRel =
    buildJson.policy?.dockerfile ||
    buildJson.policies?.dockerfile ||
    "policy/dockerfile";
  const policyDir = path.resolve(projectDir, policyRel);

  if (!existsSync(dockerfilePath) || !existsSync(policyDir)) {
    return;
  }

  console.log(pc.cyan(`\n🔍 2. Validating Dockerfile Contract (${policyRel})...`));
  runStep(
    `docker run --rm -v "${projectDir}:/project" -w /project openpolicyagent/conftest test "${dockerfileRel}" -p "${policyRel}/"`,
    projectDir,
    { stepName: "Dockerfile Contract", targetFile: dockerfileRel }
  );
}
