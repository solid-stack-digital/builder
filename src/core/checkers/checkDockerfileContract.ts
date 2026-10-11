import { existsSync } from "node:fs";
import path from "node:path";
import pc from "picocolors";
import { ConfigError } from "../../errors/ConfigError.js";
import type { BuildJson } from "../../types/index.js";
import { isPathInside, resolveProjectDir } from "../../utils/paths.js";
import { getDockerfilePolicyDir } from "../templates.js";
import { CONFTEST_IMAGE } from "./constants.js";
import { runStep } from "./runStep.js";

export function checkDockerfileContract(build: BuildJson, projectDir: string): void {
  const root = resolveProjectDir(projectDir);
  const relative = build.dockerfile ?? "Dockerfile";
  const dockerfile = path.resolve(root, relative);
  if (!isPathInside(root, dockerfile) || !existsSync(dockerfile)) throw new ConfigError({sourceFile:path.join(root,"build.json"),configPath:"dockerfile",value:relative,composition:"service",reason:"Application Dockerfile missing or outside project"});
  const policyDir = getDockerfilePolicyDir();
  console.log(pc.cyan(`\n🔍 Validating Builder Dockerfile contract (${relative})...`));
  runStep("docker", ["run","--rm","--network","none","--mount",`type=bind,src=${root},dst=/project,readonly`,"--mount",`type=bind,src=${policyDir},dst=/builder-policy,readonly`,"-w","/project",CONFTEST_IMAGE,"test",relative,"-p","/builder-policy"],root,{stepName:"Dockerfile Contract",targetFile:relative});
}
