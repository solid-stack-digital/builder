import path from "node:path";
import { ConfigError } from "../../../errors/ConfigError.js";
import { resolveProjectDir } from "../../../utils/paths.js";
import { resolveInsideProject } from "../../config/pathSafety.js";
import { loadComposeDocument } from "../../composition/loadCompose.js";
import { compileMeshComposition } from "../v2/compileMeshComposition.js";
import type { MeshConfig } from "../types.js";

export function checkMeshTester(mesh: MeshConfig, meshDir: string, options: {required?:boolean} = {}): void {
  const root = resolveProjectDir(meshDir);
  if (!mesh.tester) {
    if (options.required) throw new ConfigError({sourceFile:path.join(root,"mesh.json"),configPath:"tester",stage:"e2e",composition:"mesh",reason:"Global mesh E2E requires root tester"});
    return;
  }
  const file = resolveInsideProject(root, mesh.tester.compose, {sourceFile:path.join(root,"mesh.json"),configPath:"tester.compose",stage:"e2e"});
  loadComposeDocument(file,{sourceFile:path.join(root,"mesh.json"),configPath:"tester.compose",stage:"e2e",composition:"mesh"});
  compileMeshComposition("e2e",root,{validationMode:true});
}
