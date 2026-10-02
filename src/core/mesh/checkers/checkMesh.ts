import pc from "picocolors";
import { resolveProjectDir } from "../../../utils/paths.js";
import { getMeshJson } from "../getMeshJson.js";
import { checkMeshServices } from "./checkMeshServices.js";
import { checkMeshTester } from "./checkMeshTester.js";

export interface CheckMeshOptions {
  requireTester?: boolean | undefined;
}

export function checkMesh(
  meshDir: string = process.cwd(),
  options: CheckMeshOptions = {}
): void {
  const absMeshDir = resolveProjectDir(meshDir);
  const mesh = getMeshJson(absMeshDir);

  checkMeshServices(mesh, absMeshDir);
  checkMeshTester(mesh, absMeshDir, { required: Boolean(options.requireTester) });

  console.log(
    pc.bold(
      pc.green("\n🎉 All mesh infrastructure, services, and contract checks passed!\n")
    )
  );
}
