import { existsSync, statSync } from "node:fs";
import path from "node:path";
import pc from "picocolors";
import { ScriptError } from "../../../errors/ScriptError.js";
import { isPathInside, resolveProjectDir } from "../../../utils/paths.js";
import { checkInfra } from "../../checkers/checkInfra.js";
import type { MeshConfig } from "../types.js";

export function checkMeshServices(
  mesh: MeshConfig,
  meshDir: string = process.cwd()
): void {
  const absMeshDir = resolveProjectDir(meshDir);
  const serviceNames = Object.keys(mesh.services);

  console.log(
    pc.bold(
      pc.cyan(
        `\n🔍 Checking Mesh Services (${serviceNames.length} service${
          serviceNames.length === 1 ? "" : "s"
        })...`
      )
    )
  );

  for (const serviceName of serviceNames) {
    const serviceConfig = mesh.services[serviceName];
    if (!serviceConfig) {
      throw new ScriptError(`Service "${serviceName}" configuration is missing.`);
    }
    const serviceDir = path.resolve(absMeshDir, serviceConfig.path);

    if (!isPathInside(absMeshDir, serviceDir)) {
      throw new ScriptError(
        `Security error: Service "${serviceName}" directory escapes the mesh directory: ${serviceDir}`
      );
    }

    if (!existsSync(serviceDir)) {
      throw new ScriptError(
        `Service "${serviceName}" directory does not exist: ${serviceDir} (declared path: "${serviceConfig.path}")`
      );
    }

    if (!statSync(serviceDir).isDirectory()) {
      throw new ScriptError(
        `Service "${serviceName}" path is not a directory: ${serviceDir}`
      );
    }

    const buildJsonPath = path.resolve(serviceDir, "build.json");
    if (!existsSync(buildJsonPath)) {
      throw new ScriptError(
        `Service "${serviceName}" is missing a valid build.json at: ${buildJsonPath}`
      );
    }

    console.log(
      pc.bold(pc.blue(`\n--- Validating Infrastructure for [${serviceName}] ---`))
    );
    checkInfra(serviceDir);
  }
}
