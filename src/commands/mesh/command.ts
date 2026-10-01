import type { Command } from "commander";
import { registerMeshUpCommand } from "./commands/up/command.js";
import { registerMeshCheckCommand } from "./commands/check/command.js";

export const registerMeshCommand = (program: Command) => {
  const meshCmd = program
    .command("mesh")
    .description("Manage and orchestrate multi-service mesh environments");

  registerMeshUpCommand(meshCmd);
  registerMeshCheckCommand(meshCmd);
};
