import { ScriptError } from "../../errors/ScriptError.js";

export const attachName = (
  yml: any,
  nameOrBuildJson: string | { name?: string }
): void => {
  if (!yml) {
    throw new ScriptError("Invalid YAML structure. Missing 'yml' field.");
  }
  const name =
    typeof nameOrBuildJson === "string"
      ? nameOrBuildJson
      : nameOrBuildJson?.name;
  if (name) {
    yml.name = name;
  }
};
