import type { Command } from "commander";
import { registerUpCommand } from "./commands/up/command.js";
import { checkDependencies } from "@/utils/checkDependencies.js";
import { checkInfra } from "@/core/checkers/checkInfra.js";

export const registerServiceCommand = (cmd: Command) => {
  const service = cmd.command("service").description("Manage and run services");

  // attach hooks 
  service.hook("preAction", async (thisCommand, actionCommand) => {
const options = actionCommand.opts();
  const projectDir = options.projectDir || process.cwd();
  // Validate dependencies (e.g. docker installed)
  checkDependencies();

  checkInfra(projectDir);
  })

  // attach up command 
  registerUpCommand(service);
};
