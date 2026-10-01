import pc from "picocolors";
import { getBuildJson } from "../../utils/getBuildJson.js";
import { checkDockerfile } from "./checkDockerfile.js";
import { checkDockerfileContract } from "./checkDockerfileContract.js";
import { checkYamlFiles } from "./checkYamlFiles.js";
import { checkComposeContract } from "./checkComposeContract.js";

export function checkInfra(projectDir: string = process.cwd()): void {
  // Purely loads locations of files to be checked from build.json
  const buildJson = getBuildJson(projectDir);

  checkDockerfile(buildJson, projectDir);
  checkDockerfileContract(buildJson, projectDir);
  checkYamlFiles(buildJson, projectDir);
  checkComposeContract(buildJson, projectDir);

  console.log(pc.green("\n✅ All infrastructure and contract checks passed.\n"));
}
