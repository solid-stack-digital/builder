import type { Command } from "commander";
import { checkInfra } from "../../core/checkers/checkInfra.js";
import { SERVICE_STAGES } from "../../types/index.js";
import { checkDependencies } from "../../utils/checkDependencies.js";
import { resolveProjectDir } from "../../utils/paths.js";
import { registerDownCommand } from "./commands/down/command.js";
import { registerUpCommand } from "./commands/up/command.js";

export const registerServiceCommand = (cmd: Command): void => {
  const service = cmd.command("service").description("Manage and run services");

  // attach hooks
  service.hook("preAction", async (_thisCommand, actionCommand) => {
    // Validate dependencies (e.g. docker installed, daemon running)
    checkDependencies();

    if (actionCommand.name() === "up") {
      const options = actionCommand.opts();
      const stageArg = actionCommand.args[0]?.toLowerCase();

      // If an unknown stage was given to 'up', don't run checkInfra
      if (stageArg && !SERVICE_STAGES.includes(stageArg as any)) {
        return;
      }

      const projectDir = resolveProjectDir(options.projectDir);

      if (!options.skipChecks) {
        checkInfra(projectDir);
      }
    }
  });

  // attach up command
  registerUpCommand(service);

  // attach down command
  registerDownCommand(service);
};
