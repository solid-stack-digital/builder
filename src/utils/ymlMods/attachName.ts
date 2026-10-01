import { ScriptError } from "../../errors/ScriptError.js";

export const attachName = (yml: any, buildJson: any) => {
  if (!yml) {
    throw new ScriptError("Invalid YAML structure. Missing 'yml' field.");
  }
  yml.name = buildJson.name || yml.name;
};
