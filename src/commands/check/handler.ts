import { checkInfra } from "../../core/checkers/checkInfra.js";

export interface CheckHandlerOptions {
  projectDir?: string;
}

export async function handleCheck(
  options: CheckHandlerOptions = {},
): Promise<number> {
  const projectDir = options.projectDir || process.cwd();
  checkInfra(projectDir);
  return 0;
}
