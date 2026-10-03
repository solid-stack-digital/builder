import path from "node:path";
import { z } from "zod";
import { ScriptError } from "../errors/ScriptError.js";
import type { BuildDependency } from "../types/index.js";

export const extractBuildDeps = (
  buildJson: any,
  projectDir: string = process.cwd()
): BuildDependency[] => {
  if (!buildJson || typeof buildJson !== "object") {
    return [];
  }

  // If dependencies key is completely omitted, default to empty array
  if (!("dependencies" in buildJson) || !buildJson.dependencies) {
    return [];
  }

  const schema = z.object({
    dependencies: z.record(
      z.string(),
      z.object({
        path: z.string(),
        service: z.string().optional(),
        port: z.union([z.number(), z.string()]).optional(),
      })
    ),
  });

  const result = schema.safeParse(buildJson);
  if (!result.success) {
    const errorDetails = result.error.issues
      .map((issue) => `${issue.path.join(".")}: ${issue.message}`)
      .join("; ");
    throw new ScriptError(
      `Invalid build.json structure for dependencies: ${errorDetails}`
    );
  }

  const dependenciesData = result.data.dependencies;

  const dependencies = Object.entries(dependenciesData || {}).map(
    ([name, service]) => {
      return {
        path: path.resolve(projectDir, service.path),
        name: name,
        serviceName: service.service,
        port: service.port,
      };
    }
  );

  return dependencies;
};
