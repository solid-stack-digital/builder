import path from "node:path";
import { z } from "zod";
import { ScriptError } from "../errors/ScriptError.js";
import type { BuildOverride } from "../types/index.js";

const VALID_STAGES = ["dev", "prod", "test", "e2e"] as const;

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
      z.enum(VALID_STAGES, {
        errorMap: () => ({
          message: `Unknown stage override. Supported stages are: ${VALID_STAGES.join(", ")}`,
        }),
      }),
      z.object({
        path: z.string({ required_error: "Override 'path' is required" }),
      })
    ),
  });

  const result = schema.safeParse(buildJson);
  if (!result.success) {
    const errorDetails = result.error.issues
      .map((issue) => `${issue.path.join(".")}: ${issue.message}`)
      .join("; ");
    throw new ScriptError(
      `Invalid build.json structure for overrides: ${errorDetails}`
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

