import { existsSync } from "node:fs";
import path from "node:path";
import pc from "picocolors";
import type { BuildJson } from "../../types/index.js";
import { getDeclaredYamlFiles } from "./getDeclaredYamlFiles.js";
import { runStep } from "./runStep.js";

export function checkComposeContract(
  buildJson: BuildJson,
  projectDir: string
): void {
  // Only validate compose contract if explicitly declared in build.json
  const policyRel =
    buildJson.policy?.compose ||
    buildJson.policies?.compose;

  if (!policyRel) {
    return;
  }

  const policyDir = path.resolve(projectDir, policyRel);

  if (!existsSync(policyDir)) {
    return;
  }

  const declaredFiles = getDeclaredYamlFiles(buildJson, projectDir);
  const existingFiles = declaredFiles.filter((f) => existsSync(f.absolutePath));

  if (existingFiles.length === 0) {
    return;
  }

  const fileArgs = existingFiles.map((f) => `"${f.relativePath}"`).join(" ");
  console.log(pc.cyan(`\n🔍 4. Validating Compose Contract (${policyRel})...`));
  runStep(
    `docker run --rm -v "${projectDir}:/project" -w /project openpolicyagent/conftest test ${fileArgs} -p "${policyRel}/" --all-namespaces`,
    projectDir,
    {
      stepName: "Compose Contract Validation",
      targetFile: fileArgs,
    }
  );
}
