import pc from "picocolors";
import { getBuildJson } from "../../utils/getBuildJson.js";
import { resolveProjectDir } from "../../utils/paths.js";
import { checkDockerfile } from "./checkDockerfile.js";
import { checkDockerfileContract } from "./checkDockerfileContract.js";
import { checkAllEffectiveServiceStages } from "./checkEffectiveServiceStages.js";
import { currentOutput } from "../output/index.js";

export interface InfraCheckAdapters { dockerfile?:typeof checkDockerfile; dockerfileContract?:typeof checkDockerfileContract }
export function checkInfra(projectDir: string = process.cwd(),adapters:InfraCheckAdapters={}): void {
  const absProjectDir = resolveProjectDir(projectDir);
  const buildJson = getBuildJson(absProjectDir);

  (adapters.dockerfile??checkDockerfile)(buildJson, absProjectDir);
  (adapters.dockerfileContract??checkDockerfileContract)(buildJson, absProjectDir);
  checkAllEffectiveServiceStages(absProjectDir);

  currentOutput().log(pc.green("\nAll V3 service infrastructure and contract checks passed.\n"));
}
