import path from "node:path";
import z from "zod";
import { ScriptError } from "../errors/ScriptError.js";
import type { BuildOverride } from "../types/index.js";

export const extractOverrides = (
  buildJson: any,
  projectDir: string = process.cwd()
): Record<string, BuildOverride> => {
  if (!buildJson || typeof buildJson !== "object") {
    return {};
  }

  if (!("overrides" in buildJson) || !buildJson.overrides) {
    return {};
  }

  const schema = z.object({
    overrides: z.record(
      z.string(),
      z.object({
        path: z.string(),
      })
    ),
  });

  const result = schema.safeParse(buildJson);
  if (!result.success) {
    throw new ScriptError(
      `Invalid build.json structure for overrides: ${result.error.message}`
    );
  }

  const resolvedOverrides: Record<string, BuildOverride> = {};
  for (const [key, value] of Object.entries(result.data.overrides)) {
    resolvedOverrides[key] = {
      path: path.resolve(projectDir, value.path),
    };
  }

  return resolvedOverrides;
};
