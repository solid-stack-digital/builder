import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import pc from "picocolors";
import { parseAllDocuments } from "yaml";
import { ScriptError } from "../../../errors/ScriptError.js";
import { errorMessage } from "../../../utils/errorMessage.js";
import { isPathInside, resolveProjectDir } from "../../../utils/paths.js";
import { CONFTEST_IMAGE, HADOLINT_IMAGE } from "../../checkers/constants.js";
import { runStep } from "../../checkers/runStep.js";
import type { MeshConfig } from "../types.js";

export function checkMeshTester(
  mesh: MeshConfig,
  meshDir: string = process.cwd(),
  options: { required?: boolean } = {}
): void {
  if (!mesh.tester) {
    if (options.required) {
      throw new ScriptError(
        'E2E tester not configured in mesh.json: Missing "tester" configuration.'
      );
    }
    return;
  }

  const absMeshDir = resolveProjectDir(meshDir);
  const testerConfig = mesh.tester;
  if (!testerConfig.path || typeof testerConfig.path !== "string") {
    throw new ScriptError(
      'Invalid tester configuration in mesh.json: Missing or invalid "path".'
    );
  }

  const absTesterDir = path.resolve(absMeshDir, testerConfig.path);
  if (!isPathInside(absMeshDir, absTesterDir)) {
    throw new ScriptError(
      `Security error: Tester directory path "${testerConfig.path}" escapes the mesh project directory.`
    );
  }

  if (!existsSync(absTesterDir)) {
    throw new ScriptError(
      `E2E tester directory does not exist: ${absTesterDir} (declared path: "${testerConfig.path}")`
    );
  }

  console.log(
    pc.bold(pc.cyan(`\n🔍 Checking E2E Tester (${testerConfig.path})...`))
  );

  // 1. Check Compose file
  const composeRel = testerConfig.compose || "docker-compose.yml";
  const composePath = path.resolve(absTesterDir, composeRel);

  if (!existsSync(composePath)) {
    throw new ScriptError(
      `E2E tester docker compose file not found at: ${composePath}`
    );
  }

  try {
    const composeContent = readFileSync(composePath, "utf-8");
    const docs = parseAllDocuments(composeContent);
    const docErrors = docs.flatMap((doc) => doc.errors);
    if (docErrors.length > 0) {
      throw new Error(docErrors.map((e) => e.message).join("\n"));
    }
  } catch (err: unknown) {
    throw new ScriptError(
      `Invalid YAML syntax in tester docker compose (${composeRel}): ${errorMessage(err)}`
    );
  }

  // 2. Check Dockerfile
  const dockerfileRel = testerConfig.dockerfile || "Dockerfile";
  const dockerfilePath = path.resolve(absTesterDir, dockerfileRel);

  if (!existsSync(dockerfilePath)) {
    throw new ScriptError(
      `E2E tester Dockerfile not found at: ${dockerfilePath}`
    );
  }

  const dockerfileContent = readFileSync(dockerfilePath, "utf-8");

  console.log(pc.cyan(`\n🔍 Linting E2E Tester Dockerfile (${dockerfileRel})...`));
  runStep(
    "docker",
    ["run", "--rm", "-i", HADOLINT_IMAGE, "hadolint", "--failure-threshold", "error", "-"],
    absTesterDir,
    {
      stepName: "E2E Tester Dockerfile Linting",
      targetFile: dockerfileRel,
      input: dockerfileContent,
    }
  );

  // 3. Optional policy/contract checks if policies exist
  const dockerfilePolicyRel =
    testerConfig.policy?.dockerfile || "policy/dockerfile";
  const dockerfilePolicyDir = path.resolve(absTesterDir, dockerfilePolicyRel);
  if (existsSync(dockerfilePolicyDir)) {
    console.log(
      pc.cyan(
        `\n🔍 Validating Tester Dockerfile Contract (${dockerfilePolicyRel})...`
      )
    );
    runStep(
      "docker",
      [
        "run",
        "--rm",
        "-v",
        `${absTesterDir}:/project`,
        "-w",
        "/project",
        CONFTEST_IMAGE,
        "test",
        dockerfileRel,
        "-p",
        `${dockerfilePolicyRel}/`,
      ],
      absTesterDir,
      { stepName: "E2E Tester Dockerfile Contract", targetFile: dockerfileRel }
    );
  }

  const composePolicyRel = testerConfig.policy?.compose || "policy/compose";
  const composePolicyDir = path.resolve(absTesterDir, composePolicyRel);
  if (existsSync(composePolicyDir)) {
    console.log(
      pc.cyan(`\n🔍 Validating Tester Compose Contract (${composePolicyRel})...`)
    );
    runStep(
      "docker",
      [
        "run",
        "--rm",
        "-v",
        `${absTesterDir}:/project`,
        "-w",
        "/project",
        CONFTEST_IMAGE,
        "test",
        composeRel,
        "-p",
        `${composePolicyRel}/`,
        "--all-namespaces",
      ],
      absTesterDir,
      { stepName: "E2E Tester Compose Contract", targetFile: composeRel }
    );
  }

  console.log(pc.green(`✅ E2E tester configuration and contracts verified.\n`));
}
