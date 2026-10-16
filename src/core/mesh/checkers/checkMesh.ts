import pc from "picocolors";
import { resolveProjectDir } from "../../../utils/paths.js";
import { getMeshJson } from "../getMeshJson.js";
import { checkMeshServices } from "./checkMeshServices.js";
import { checkMeshTester } from "./checkMeshTester.js";
import { checkDockerfileContract } from "../../checkers/checkDockerfileContract.js";

export interface CheckMeshOptions {
  requireTester?: boolean | undefined;
  dockerfileContract?: typeof checkDockerfileContract;
}

export function checkMesh(
  meshDir: string = process.cwd(),
  options: CheckMeshOptions = {}
): void {
  const absMeshDir = resolveProjectDir(meshDir);
  const mesh = getMeshJson(absMeshDir);

  checkMeshServices(mesh, absMeshDir,options.dockerfileContract);
  checkMeshTester(mesh, absMeshDir);

  console.log(
    pc.bold(
      pc.green("\nAll V3 mesh infrastructure, services, and contract checks passed.\n")
    )
  );
}
