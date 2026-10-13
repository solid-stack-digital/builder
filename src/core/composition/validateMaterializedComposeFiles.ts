import fs from "node:fs";
import path from "node:path";
import { ConfigError } from "../../errors/ConfigError.js";
import type { ComposeDocument } from "./types.js";

/** File-backed Compose resources are required only when their bundle is run. */
export function validateMaterializedComposeFiles(
  document: ComposeDocument,
  sourceFile: string,
  stage: string,
): void {
  for (const kind of ["configs", "secrets"] as const) {
    for (const [name, raw] of Object.entries(document[kind] ?? {})) {
      if (!raw || typeof raw !== "object" || Array.isArray(raw)) continue;
      const file = (raw as Record<string, unknown>).file;
      if (typeof file !== "string") continue;
      const absolute = path.resolve(path.dirname(sourceFile), file);
      let regular = false;
      try {
        regular = fs.statSync(absolute).isFile();
      } catch {
        // Report missing or inaccessible files with the same config diagnostic.
      }
      if (!regular) {
        throw new ConfigError({
          sourceFile,
          configPath: `${kind}.${name}.file`,
          stage,
          composition: "service",
          value: file,
          reason: "Materialized Compose file resource is missing or not a regular file",
        });
      }
    }
  }
}
