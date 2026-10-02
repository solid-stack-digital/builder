import type { Command } from "commander";
import { registerMeshCheckCommand } from "./commands/check/command.js";
import { registerMeshDownCommand } from "./commands/down/command.js";
import { registerMeshUpCommand } from "./commands/up/command.js";

export const registerMeshCommand = (program: Command) => {
  const meshCmd = program
    .command("mesh")
    .description("Manage and orchestrate multi-service mesh environments");

  registerMeshUpCommand(meshCmd);
  registerMeshDownCommand(meshCmd);
  registerMeshCheckCommand(meshCmd);
};
