import { ScriptError } from "../../../errors/ScriptError.js";
import type { MeshConfig } from "../types.js";

export function checkMeshJson(mesh: MeshConfig): void {
  if (!mesh.services || typeof mesh.services !== "object") {
    throw new ScriptError('Invalid mesh.json: "services" must be an object.');
  }

  const serviceNames = Object.keys(mesh.services);
  if (serviceNames.length === 0) {
    throw new ScriptError('Invalid mesh.json: At least one service must be defined in "services".');
  }

  for (const [serviceName, serviceConfig] of Object.entries(mesh.services)) {
    if (!serviceConfig || typeof serviceConfig !== "object") {
      throw new ScriptError(
        `Invalid mesh.json: Service "${serviceName}" must be an object configuration.`
      );
    }

    if (!serviceConfig.path || typeof serviceConfig.path !== "string") {
      throw new ScriptError(
        `Invalid mesh.json: Service "${serviceName}" is missing a valid "path" property.`
      );
    }
  }
}
