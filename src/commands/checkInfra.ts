import { spawnSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import pc from "picocolors";
import { ScriptError } from "../errors/ScriptError.js";

interface RunContext {
  stepName: string;
  targetFile?: string;
  envName?: string;
  filesUsed?: string[];
}

function findServiceDefiners(projectDir: string, serviceName: string): string[] {
  const dirsToScan = [
    path.join(projectDir, ".docker/core"),
    path.join(projectDir, ".docker/mocks"),
    path.join(projectDir, ".docker/overrides"),
  ];
  const hits: string[] = [];

  for (const dir of dirsToScan) {
    if (!existsSync(dir)) continue;
    for (const file of readdirSync(dir)) {
      if (!file.endsWith(".yml") && !file.endsWith(".yaml")) continue;
      const filePath = path.join(dir, file);
      const content = readFileSync(filePath, "utf-8");
      const hasBlock = new RegExp(`^\\s{2}${serviceName}:\\s*$`, "m").test(content);
      if (!hasBlock) continue;
      const hasImageOrBuild = new RegExp(
        `^\\s{2}${serviceName}:[\\s\\S]*?^\\s{4,}(image|build):`,
        "m"
      ).test(content);
      hits.push(
        `    - ${filePath}${hasImageOrBuild ? "  (defines image/build)" : "  (no image/build here)"}`
      );
    }
  }
  return hits;
}

function explainComposeMergeFailure(
  projectDir: string,
  ctx: RunContext,
  rawOutput: string
): string {
  const lines: string[] = [];
  const serviceMatch = rawOutput.match(
    /service "([^"]+)" has neither an image nor a build context specified/
  );
  const envMissingMatch =
    /env file .* not found|no such file or directory.*\.env/i.test(rawOutput);

  lines.push(`Environment          : ${ctx.envName}`);
  lines.push(`Compose files merged :`);
  (ctx.filesUsed ?? [])
    .filter((f) => f !== "-f")
    .forEach((f) => lines.push(`    - ${f}`));
  lines.push("");

  if (serviceMatch && serviceMatch[1]) {
    const serviceName = serviceMatch[1];
    lines.push(
      `ROOT CAUSE: Service "${serviceName}" is referenced in the merged stack above, but none of those`
    );
    lines.push(
      `files provide an "image:" or "build:" for it — Docker Compose cannot start it as-is.`
    );
    lines.push("");
    lines.push(
      `Every file under .docker/ that defines a "${serviceName}:" service block:`
    );
    const definers = findServiceDefiners(projectDir, serviceName);
    if (definers.length > 0) {
      definers.forEach((d) => lines.push(d));
    } else {
      lines.push(
        `    (none found — check spelling/indentation of "${serviceName}:" in your yml files)`
      );
    }
  } else if (envMissingMatch) {
    lines.push(`ROOT CAUSE: A referenced .env file could not be found.`);
    lines.push("");
    lines.push("HOW TO FIX:");
    lines.push(
      `  - Create the missing env file at the project root (e.g. .env.dev, .env.prod, .env.test)`
    );
  } else {
    lines.push(
      "Docker Compose failed to resolve this merged stack. Common causes:"
    );
    lines.push(
      `  - A "\${VAR}" substitution with no default and no value set in the shell or an env_file.`
    );
    lines.push(`  - A YAML syntax error in one of the files listed above.`);
    lines.push(`  - A duplicate or conflicting key across two merged files.`);
  }

  lines.push("");
  lines.push("Raw Docker Compose / Conftest output:");
  lines.push("-".repeat(60));
  lines.push(rawOutput.trim());
  lines.push("-".repeat(60));

  return lines.join("\n");
}

function runStep(command: string, projectDir: string, ctx: RunContext): void {
  const result = spawnSync(command, {
    shell: true,
    cwd: projectDir,
    stdio: ["inherit", "pipe", "pipe"],
    encoding: "utf-8",
  });

  const stdout = result.stdout ?? "";
  const stderr = result.stderr ?? "";
  if (stdout) process.stdout.write(stdout);
  if (stderr) process.stderr.write(stderr);

  if (result.status !== 0) {
    console.error("\n" + "=".repeat(60));
    console.error(pc.red(`🚨 INFRASTRUCTURE CHECK FAILED 🚨`));
    console.error("=".repeat(60));
    console.error(`Failed Step : ${ctx.stepName}`);
    if (ctx.targetFile) {
      console.error(`Target File : ${ctx.targetFile}  <-- FIX THIS FILE`);
    }
    console.error("=".repeat(60));

    if (ctx.envName) {
      console.error("\n" + explainComposeMergeFailure(projectDir, ctx, stdout + stderr));
    }

    console.error("");
    throw new ScriptError(`Infrastructure check failed at step: ${ctx.stepName}`);
  }
}

export function checkInfra(projectDir: string = process.cwd()): void {
  const dockerfilePath = path.join(projectDir, "Dockerfile");

  if (!existsSync(dockerfilePath)) {
    console.log(pc.yellow("⚠️  No Dockerfile found in project directory. Skipping Dockerfile checks."));
    return;
  }

  console.log(pc.cyan("\n🔍 1. Linting Dockerfile..."));
  runStep(
    "docker run --rm -i hadolint/hadolint hadolint --failure-threshold error - < Dockerfile",
    projectDir,
    { stepName: "Dockerfile Linting", targetFile: "Dockerfile" }
  );

  const policyDockerfileDir = path.join(projectDir, "policy/dockerfile");
  if (existsSync(policyDockerfileDir)) {
    console.log(pc.cyan("\n🔍 2. Validating Dockerfile Contract..."));
    runStep(
      `docker run --rm -v "${projectDir}:/project" -w /project openpolicyagent/conftest test Dockerfile -p policy/dockerfile/`,
      projectDir,
      { stepName: "Dockerfile Contract", targetFile: "Dockerfile" }
    );
  }

  console.log(pc.green("\n✅ All infrastructure and contract checks passed.\n"));
}
