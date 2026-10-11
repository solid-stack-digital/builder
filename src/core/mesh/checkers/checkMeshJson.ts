import { ConfigError } from "../../../errors/ConfigError.js";
import { meshSchema } from "../meshSchema.js";
import type { MeshConfig } from "../types.js";

export function checkMeshJson(mesh: unknown): MeshConfig {
  const result = meshSchema.safeParse(mesh);
  if (!result.success) throw new ConfigError({sourceFile:"mesh.json",configPath:"<root>",composition:"mesh",reason:`Invalid mesh.json: ${result.error.issues.map(issue=>`${issue.path.join(".") || "<root>"}: ${issue.message}`).join("; ")}`});
  return result.data as MeshConfig;
}
