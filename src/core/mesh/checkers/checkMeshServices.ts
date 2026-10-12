import path from "node:path";
import pc from "picocolors";
import { ConfigError } from "../../../errors/ConfigError.js";
import { resolveProjectDir } from "../../../utils/paths.js";
import { resolveMeshStage } from "../../config/resolveMeshStage.js";
import { compileServiceComposition } from "../../composition/compileServiceComposition.js";
import { checkInfra } from "../../checkers/checkInfra.js";
import { compileMeshComposition } from "../v2/compileMeshComposition.js";
import { applyTestAppPublications, validateMeshTestStage } from "../v2/validateMeshTestStage.js";
import { loadEffectiveMeshServices } from "../v2/loadMeshServices.js";
import { resolveMeshEnvMap,resolveServiceBuildEnvThroughMesh,type MeshReferenceContext } from "../v2/meshReferences.js";
import { resolveMeshAppEnvironmentLayers } from "../v2/resolveMeshAppEnvironment.js";
import type { MeshEndpointRegistry } from "../v2/types.js";
import type { MeshConfig } from "../types.js";

export interface CheckMeshServicesOptions {
  includeTestStage?: boolean | undefined;
}

export function checkMeshServices(
  mesh: MeshConfig,
  meshDir: string,
  options: CheckMeshServicesOptions = {},
): void {
  const root = resolveProjectDir(meshDir), meshPath = path.join(root,"mesh.json");
  const checked = new Set<string>();
  const stages: Array<"dev" | "prod" | "test" | "e2e"> = options.includeTestStage
    ? ["dev", "prod", "test", "e2e"]
    : ["dev", "prod", "e2e"];
  for (const stage of stages) {
    const effective = resolveMeshStage(mesh,stage,meshPath);
    const services = loadEffectiveMeshServices(root,effective,stage);
    const testValidation = stage === "test"
      ? validateMeshTestStage(services,root,meshPath,true)
      : undefined;
    for (const [name,svc] of Object.entries(services)) {
      if (!checked.has(svc.absolutePath)) { console.log(pc.cyan(`\n🔍 Checking mesh service ${name}...`)); checkInfra(svc.absolutePath); checked.add(svc.absolutePath); }
      if (stage === "test") {
        const fragment = compileServiceComposition("test",svc.absolutePath,{validationMode:true,meshMode:true,deferReferenceResolution:true});
        applyTestAppPublications(testValidation!, name, fragment.compose.services.app!, fragment.endpoints.app);
        const endpoints:MeshEndpointRegistry={app:{[name]:fragment.endpoints.app},dependencies:{[name]:fragment.endpoints.dependencies}};
        const ctx:MeshReferenceContext={services:{[name]:svc},bindings:new Map(),endpoints,stage:"test",meshJsonPath:meshPath};
        for (const key of ["EXEC_MODE","INFRA_MODE",...(Object.values(svc.effectiveBuild.app.endpoints).some(ep=>ep.primary)?["PORT"]:[])]) {
          if (key in svc.meshEnv) throw new ConfigError({sourceFile:meshPath,configPath:`services.${name}.env.${key}`,stage:"test",composition:"mesh",reason:"Mesh service env cannot set Builder-owned environment"});
        }
        resolveMeshAppEnvironmentLayers(name,fragment.appEnvironmentLayers,ctx,new Set(Object.keys(svc.meshEnv)));
        for (const [depName,depEnv] of Object.entries(fragment.dependencyEnvironments??{})) resolveServiceBuildEnvThroughMesh(name,depEnv,ctx,`services.${name}.dependencies.${depName}.env`);
        resolveMeshEnvMap(svc.meshEnv,ctx,`services.${name}.env`);
      }
    }
    if (stage !== "test") compileMeshComposition(stage,root,{validationMode:true,allowMissingTester:true});
  }
}
