import { resolveApplicationDockerfile } from "../config/pathSafety.js";
import pc from "picocolors";
import type { BuildJson } from "../../types/index.js";
import { resolveProjectDir } from "../../utils/paths.js";
import { getDockerfilePolicyDir } from "../templates.js";
import { CONFTEST_IMAGE } from "./constants.js";
import { runStep } from "./runStep.js";

export function checkDockerfileContract(build: BuildJson, projectDir: string): void {
  const root = resolveProjectDir(projectDir);
  const relative = build.dockerfile ?? "Dockerfile";
  resolveApplicationDockerfile(root, relative);
  const policyDir = getDockerfilePolicyDir();
  console.log(pc.cyan(`\n🔍 Validating Builder Dockerfile contract (${relative})...`));
  runStep("docker", ["run","--rm","--network","none","--mount",`type=bind,src=${root},dst=/project,readonly`,"--mount",`type=bind,src=${policyDir},dst=/builder-policy,readonly`,"-w","/project",CONFTEST_IMAGE,"test",relative,"-p","/builder-policy"],root,{stepName:"Dockerfile Contract",targetFile:relative});
}
