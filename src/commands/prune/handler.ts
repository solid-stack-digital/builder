import { spawnSync } from "node:child_process";
import pc from "picocolors";
import { ScriptError } from "../../errors/ScriptError.js";

export interface PruneOptions {
  volumes?: boolean;
}

export async function handlePrune(options: PruneOptions = {}): Promise<number> {
  console.log(pc.cyan("\n🧹 Pruning stopped Compose containers and unused networks..."));

  // 1. Remove stopped containers
  const rmContainers = spawnSync("docker", ["container", "prune", "-f"], {
    stdio: "inherit",
    encoding: "utf-8",
  });
  if (rmContainers.error) {
    throw new ScriptError(`Failed to prune containers: ${rmContainers.error.message}`, {
      cause: rmContainers.error,
    });
  }

  // 2. Remove unused networks
  const rmNetworks = spawnSync("docker", ["network", "prune", "-f"], {
    stdio: "inherit",
    encoding: "utf-8",
  });
  if (rmNetworks.error) {
    throw new ScriptError(`Failed to prune networks: ${rmNetworks.error.message}`, {
      cause: rmNetworks.error,
    });
  }

  // 3. Optional volume pruning
  if (options.volumes) {
    console.log(pc.cyan("🧹 Pruning dangling volumes..."));
    spawnSync("docker", ["volume", "prune", "-f"], {
      stdio: "inherit",
      encoding: "utf-8",
    });
  }

  console.log(pc.green("✅ Docker environment pruned successfully.\n"));
  return 0;
}
