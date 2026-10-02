import { ScriptError } from "../../errors/ScriptError.js";
import type { BuildDependency } from "../../types/index.js";
import { normalizeDependsOn } from "./normalizeDependsOn.js";

export const addDependenciesToAppService = (
  yml: any,
  dependencies: BuildDependency[]
): void => {
  if (!yml || !yml.services || !yml.services.app) {
    throw new ScriptError("Invalid YAML structure. Missing 'services.app' field.");
  }

  if (!dependencies || dependencies.length === 0) {
    return;
  }

  normalizeDependsOn(yml.services.app);
  yml.services.app.depends_on = yml.services.app.depends_on || {};
  dependencies.forEach((dep) => {
    yml.services.app.depends_on[dep.name] = {
      condition: "service_healthy",
    };
  });
};
