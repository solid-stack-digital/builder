import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import pc from "picocolors";
import { parse } from "yaml";
import { ScriptError } from "../../../errors/ScriptError.js";
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

  const testerConfig = mesh.tester;
  if (!testerConfig.path || typeof testerConfig.path !== "string") {
    throw new ScriptError(
      'Invalid tester configuration in mesh.json: Missing or invalid "path".'
    );
  }

  const testerDir = path.resolve(meshDir, testerConfig.path);
  if (!existsSync(testerDir)) {
    throw new ScriptError(
      `E2E tester directory does not exist: ${testerDir} (declared path: "${testerConfig.path}")`
    );
  }

  console.log(
    pc.bold(pc.cyan(`\n🔍 Checking E2E Tester (${testerConfig.path})...`))
  );

  // 1. Check Compose file
  const composeRel = testerConfig.compose || "docker-compose.yml";
  const composePath = path.resolve(testerDir, composeRel);

  if (!existsSync(composePath)) {
    throw new ScriptError(
      `E2E tester docker compose file not found at: ${composePath}`
    );
  }

  try {
    const composeContent = readFileSync(composePath, "utf-8");
    parse(composeContent);
  } catch (err: any) {
    throw new ScriptError(
      `Invalid YAML syntax in tester docker compose (${composeRel}): ${
        err?.message || String(err)
      }`
    );
  }

  // 2. Check Dockerfile
  const dockerfileRel = testerConfig.dockerfile || "Dockerfile";
  const dockerfilePath = path.resolve(testerDir, dockerfileRel);

  if (!existsSync(dockerfilePath)) {
    throw new ScriptError(
      `E2E tester Dockerfile not found at: ${dockerfilePath}`
    );
  }

  console.log(pc.cyan(`\n🔍 Linting E2E Tester Dockerfile (${dockerfileRel})...`));
  runStep(
    `docker run --rm -i hadolint/hadolint hadolint --failure-threshold error - < "${dockerfileRel}"`,
    testerDir,
    { stepName: "E2E Tester Dockerfile Linting", targetFile: dockerfileRel }
  );

  // 3. Optional policy/contract checks if policies exist
  const dockerfilePolicyRel =
    testerConfig.policy?.dockerfile || "policy/dockerfile";
  const dockerfilePolicyDir = path.resolve(testerDir, dockerfilePolicyRel);
  if (existsSync(dockerfilePolicyDir)) {
    console.log(
      pc.cyan(
        `\n🔍 Validating Tester Dockerfile Contract (${dockerfilePolicyRel})...`
      )
    );
    runStep(
      `docker run --rm -v "${testerDir}:/project" -w /project openpolicyagent/conftest test "${dockerfileRel}" -p "${dockerfilePolicyRel}/"`,
      testerDir,
      { stepName: "E2E Tester Dockerfile Contract", targetFile: dockerfileRel }
    );
  }

  const composePolicyRel = testerConfig.policy?.compose || "policy/compose";
  const composePolicyDir = path.resolve(testerDir, composePolicyRel);
  if (existsSync(composePolicyDir)) {
    console.log(
      pc.cyan(`\n🔍 Validating Tester Compose Contract (${composePolicyRel})...`)
    );
    runStep(
      `docker run --rm -v "${testerDir}:/project" -w /project openpolicyagent/conftest test "${composeRel}" -p "${composePolicyRel}/" --all-namespaces`,
      testerDir,
      { stepName: "E2E Tester Compose Contract", targetFile: composeRel }
    );
  }

  console.log(pc.green(`✅ E2E tester configuration and contracts verified.\n`));
}
