import { existsSync } from "node:fs";
import path from "node:path";
import pc from "picocolors";
import { ScriptError } from "../../errors/ScriptError.js";
import type { BuildJson } from "../../types/index.js";
import { isPathInside, resolveProjectDir } from "../../utils/paths.js";
import { CONFTEST_IMAGE } from "./constants.js";
import { runStep } from "./runStep.js";

export function checkDockerfileContract(
  buildJson: BuildJson,
  projectDir: string
): void {
  const absProjectDir = resolveProjectDir(projectDir);
  const dockerfileRel =
    (buildJson.dockerfile as string | undefined) || "Dockerfile";
  const dockerfilePath = path.resolve(absProjectDir, dockerfileRel);

  const policyRel =
    buildJson.policy?.dockerfile ||
    buildJson.policies?.dockerfile ||
    "policy/dockerfile";
  const policyDir = path.resolve(absProjectDir, policyRel);

  if (!isPathInside(absProjectDir, dockerfilePath)) {
    throw new ScriptError(
      `Security error: Dockerfile path "${dockerfileRel}" escapes the project directory.`
    );
  }

  if (!existsSync(dockerfilePath) || !existsSync(policyDir)) {
    return;
  }

  console.log(pc.cyan(`\n🔍 Validating Dockerfile Contract (${policyRel})...`));
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
      dockerfileRel,
      "-p",
      `${policyRel}/`,
    ],
    absProjectDir,
    { stepName: "Dockerfile Contract", targetFile: dockerfileRel }
  );
}
