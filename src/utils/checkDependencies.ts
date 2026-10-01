import { spawnSync } from "node:child_process";
import { ScriptError } from "../errors/ScriptError.js";

export function checkDependencies(): void {
  const dockerCheck = spawnSync("command -v docker", { shell: true });
  if (dockerCheck.status !== 0) {
    throw new ScriptError(
      "Error: docker is not installed or not in PATH. Please install Docker first."
    );
  }
}
