import fs from "node:fs";
import path from "node:path";
import { ConfigError } from "../../errors/ConfigError.js";
import { isRemoteBuildContext } from "./composePaths.js";
import { assertNoServiceBuildContexts } from "./composeBuildResources.js";
import type { ComposeDocument } from "./types.js";

/** Check local build inputs only for Compose bundles that will be materialized. */
export function validateMaterializedComposeBuildInputs(
  document: ComposeDocument,
  sourceFile: string,
  stage: string,
  composition: "service" | "mesh",
): void {
  const baseDir = path.dirname(sourceFile);
  for (const [name, service] of Object.entries(document.services ?? {})) {
    const build = service.build;
    if (build === undefined) continue;
    assertNoServiceBuildContexts(service, `services.${name}`, sourceFile);

    const objectBuild = build && typeof build === "object" && !Array.isArray(build)
      ? build as Record<string, unknown>
      : undefined;
    const context = typeof build === "string"
      ? build : objectBuild?.context ?? ".";
    const configPath = `services.${name}.build`;
    const fail = (field: string, value: unknown, reason: string): never => {
      throw new ConfigError({
        sourceFile,
        configPath: `${configPath}.${field}`,
        stage,
        composition,
        value,
        reason,
      });
    };

    if (typeof context !== "string" || context.trim() === "") {
      return fail("context", context, "Local build context must be a non-empty path");
    }
    if (isRemoteBuildContext(context)) continue;

    const absoluteContext = path.resolve(baseDir, context);
    let directory = false;
    try { directory = fs.statSync(absoluteContext).isDirectory(); } catch {
      // Fail with the logical Compose path below.
    }
    if (!directory) {
      fail("context", context,
        "Materialized local build context is missing or not a directory");
    }

    if (objectBuild?.dockerfile_inline !== undefined) continue;
    const dockerfile = objectBuild?.dockerfile ?? "Dockerfile";
    if (typeof dockerfile !== "string" || dockerfile.trim() === "") {
      return fail("dockerfile", dockerfile, "Dockerfile path must be a non-empty string");
    }
    const absoluteDockerfile = path.resolve(absoluteContext, dockerfile);
    let regular = false;
    try { regular = fs.statSync(absoluteDockerfile).isFile(); } catch {
      // Fail with the logical Compose path below.
    }
    if (!regular) {
      fail("dockerfile", dockerfile,
        "Materialized local Dockerfile is missing or not a regular file");
    }
  }
}
