import pc from "picocolors";
import { getBuildJson } from "../../utils/getBuildJson.js";
import { resolveProjectDir } from "../../utils/paths.js";
import { checkDockerfile } from "./checkDockerfile.js";
import { checkDockerfileContract } from "./checkDockerfileContract.js";
import { checkYamlFiles } from "./checkYamlFiles.js";
import { checkAllEffectiveServiceStages } from "./checkEffectiveServiceStages.js";

export function checkInfra(projectDir: string = process.cwd()): void {
  const absProjectDir = resolveProjectDir(projectDir);
  const buildJson = getBuildJson(absProjectDir);

  checkDockerfile(buildJson, absProjectDir);
  checkDockerfileContract(buildJson, absProjectDir);
  checkYamlFiles(buildJson, absProjectDir);
  checkAllEffectiveServiceStages(absProjectDir);

  console.log(pc.green("\n✅ All V2 service infrastructure and contract checks passed.\n"));
}
