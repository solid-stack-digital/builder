import pc from "picocolors";
import { getMeshJson } from "../getMeshJson.js";
import { checkMeshJson } from "./checkMeshJson.js";
import { checkMeshServices } from "./checkMeshServices.js";
import { checkMeshTester } from "./checkMeshTester.js";

export interface CheckMeshOptions {
  requireTester?: boolean;
}

export function checkMesh(
  meshDir: string = process.cwd(),
  options: CheckMeshOptions = {}
): void {
  const mesh = getMeshJson(meshDir);

  checkMeshJson(mesh);
  checkMeshServices(mesh, meshDir);
  checkMeshTester(
    mesh,
    meshDir,
    options.requireTester !== undefined
      ? { required: options.requireTester }
      : {}
  );

  console.log(
    pc.bold(
      pc.green("\n🎉 All mesh infrastructure, services, and contract checks passed!\n")
    )
  );
}
