import { existsSync } from "node:fs";
import path from "node:path";
import pc from "picocolors";
import { ScriptError } from "../../errors/ScriptError.js";
import type { BuildJson } from "../../types/index.js";
import { isPathInside, resolveProjectDir } from "../../utils/paths.js";
import { CONFTEST_IMAGE } from "./constants.js";
import { getDeclaredYamlFiles } from "./getDeclaredYamlFiles.js";
import { runStep } from "./runStep.js";

export function checkComposeContract(
  buildJson: BuildJson,
  projectDir: string
): void {
  const absProjectDir = resolveProjectDir(projectDir);

  const policyRel =
    buildJson.policy?.compose ||
    buildJson.policies?.compose;

  if (!policyRel) {
    return;
  }

  const policyDir = path.resolve(absProjectDir, policyRel);

  if (!existsSync(policyDir)) {
    return;
  }

  const declaredFiles = getDeclaredYamlFiles(buildJson, absProjectDir);
  const existingFiles = declaredFiles.filter((f) => existsSync(f.absolutePath));

  if (existingFiles.length === 0) {
    return;
  }

  for (const f of existingFiles) {
    if (!isPathInside(absProjectDir, f.absolutePath)) {
      throw new ScriptError(
        `Security error: Compose file path "${f.relativePath}" escapes the project directory.`
      );
    }
  }

  const relativePaths = existingFiles.map((f) => f.relativePath);

  console.log(pc.cyan(`\n🔍 Validating Compose Contract (${policyRel})...`));
  runStep(
    "docker",
    [
      "run",
      "--rm",
      "--network",
      "none",
      "--mount",
      `type=bind,src=${absProjectDir},dst=/project,readonly`,
      "-w",
      "/project",
      CONFTEST_IMAGE,
      "test",
      ...relativePaths,
      "-p",
      `${policyRel}/`,
      "--all-namespaces",
    ],
    absProjectDir,
    {
      stepName: "Compose Contract Validation",
      targetFile: relativePaths.join(", "),
    }
  );
}
