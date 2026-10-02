import pc from "picocolors";
import { getBuildJson } from "../../utils/getBuildJson.js";
import { resolveProjectDir } from "../../utils/paths.js";
import { checkDockerfile } from "./checkDockerfile.js";
import { checkDockerfileContract } from "./checkDockerfileContract.js";
import { checkYamlFiles } from "./checkYamlFiles.js";
import { checkComposeContract } from "./checkComposeContract.js";

export function checkInfra(projectDir: string = process.cwd()): void {
  const absProjectDir = resolveProjectDir(projectDir);
  const buildJson = getBuildJson(absProjectDir);

  checkDockerfile(buildJson, absProjectDir);
  checkDockerfileContract(buildJson, absProjectDir);
  checkYamlFiles(buildJson, absProjectDir);
  checkComposeContract(buildJson, absProjectDir);

  console.log(pc.green("\n✅ All infrastructure and contract checks passed.\n"));
}
