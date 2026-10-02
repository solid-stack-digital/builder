import type { Command } from "commander";
import { checkInfra } from "../../core/checkers/checkInfra.js";
import { SERVICE_STAGES } from "../../types/index.js";
import { checkDependencies } from "../../utils/checkDependencies.js";
import { resolveProjectDir } from "../../utils/paths.js";
import { registerUpCommand } from "./commands/up/command.js";

export const registerServiceCommand = (cmd: Command): void => {
  const service = cmd.command("service").description("Manage and run services");

  // attach hooks
  service.hook("preAction", async (_thisCommand, actionCommand) => {
    const options = actionCommand.opts();
    const stageArg = actionCommand.args[0];

    // If an unknown stage was given to 'up', don't run checkInfra
    if (stageArg && !SERVICE_STAGES.includes(stageArg as any)) {
      return;
    }

    const projectDir = resolveProjectDir(options.projectDir);

    // Validate dependencies (e.g. docker installed, daemon running)
    checkDependencies();

    if (!options.skipChecks) {
      checkInfra(projectDir);
    }
  });

  // attach up command
  registerUpCommand(service);
};
