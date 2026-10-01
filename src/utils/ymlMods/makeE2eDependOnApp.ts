import { ScriptError } from "../../errors/ScriptError.js";

export const makeE2eDependOnApp = (yml: any) => {
  if (!yml || !yml.services) {
    throw new ScriptError("Invalid YAML structure. Missing 'services' field.");
  }

  if (!yml.services.tester) {
    throw new ScriptError("Tester service not found");
  }

  if (!yml.services.app) {
    throw new ScriptError("App service not found");
  }

  yml.services.tester.depends_on = {
    ...yml.services.tester.depends_on,
    app: {
      condition: "service_healthy",
    },
  };
};
