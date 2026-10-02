import { checkInfra } from "../../core/checkers/checkInfra.js";
import { checkDependencies } from "../../utils/checkDependencies.js";
import { resolveProjectDir } from "../../utils/paths.js";

export interface CheckHandlerOptions {
  projectDir?: string;
}

export async function handleCheck(
  options: CheckHandlerOptions = {}
): Promise<number> {
  const projectDir = resolveProjectDir(options.projectDir);
  checkDependencies();
  checkInfra(projectDir);
  return 0;
}
