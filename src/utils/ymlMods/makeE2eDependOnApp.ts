import { ScriptError } from "../../errors/ScriptError.js";
import { normalizeDependsOn } from "./normalizeDependsOn.js";

export const makeE2eDependOnApp = (yml: any): void => {
  if (!yml || !yml.services) {
    throw new ScriptError("Invalid YAML structure. Missing 'services' field.");
  }

  if (!yml.services.tester) {
    throw new ScriptError("Tester service not found");
  }

  if (!yml.services.app) {
    throw new ScriptError("App service not found");
  }

  normalizeDependsOn(yml.services.tester);
  yml.services.tester.depends_on = {
    ...(yml.services.tester.depends_on || {}),
    app: {
      condition: "service_healthy",
    },
  };
};
