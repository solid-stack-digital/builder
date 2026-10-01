import type { Command } from "commander";
import { registerUpCommand } from "./commands/up/command.js";

export const registerServiceCommand = (cmd: Command) => {
  const service = cmd.command("service").description("Manage and run services");

  registerUpCommand(service);
};
