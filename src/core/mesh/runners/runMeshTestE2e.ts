import { stringify } from "yaml";
import type { MeshRunOptions } from "../MeshRunOptions.js";
import { resolveProjectDir } from "../../../utils/paths.js";
import { compileMeshComposition } from "../compileMeshComposition.js";
import { persistHostPortAllocations, removeHostPortAllocations } from "../../config/hostPorts.js";
import { checkHostPortCollisions, extractHostPorts } from "../../../utils/checkPortCollision.js";
import { redactYamlSecrets } from "../../../utils/redactSecrets.js";
import { clearRunState, writeRunState } from "../../../utils/runState.js";
import { runWithCleanup } from "../../runWithCleanup.js";
import { teardownCompose } from "../../teardownCompose.js";
import { runFiniteTester } from "../../runners/runFiniteTester.js";
import type { E2eRuntimeAdapters } from "../../runners/runTestE2e.js";
export async function runMeshTestE2e(options:MeshRunOptions={},adapters:E2eRuntimeAdapters={}):Promise<number> {
  const root=resolveProjectDir(options.projectDir),compiled=compileMeshComposition("e2e",root,{validationMode:Boolean(options.dryRun)}),yaml=stringify(compiled.compose);
  if(options.debug)console.log(redactYamlSecrets(yaml));
  if(options.dryRun)return 0;
  await (adapters.checkPorts??checkHostPortCollisions)(extractHostPorts(yaml));
  await (adapters.teardown??teardownCompose)(yaml,root,{removeVolumes:true,silent:true});
  persistHostPortAllocations(root,compiled.allocations);
  writeRunState(root,{projectName:compiled.projectName,stage:"test-e2e",configStage:"e2e",workflow:"test",composition:"mesh",projectDir:root,runtimeServiceNames:compiled.runtimeServiceNames,testerServiceNames:compiled.testerServiceNames,allocatedEndpointKeys:[...compiled.allocations.keys()]});
  return runWithCleanup(()=>runFiniteTester(compiled,root,adapters.finite),async()=>{await (adapters.teardown??teardownCompose)(yaml,root,{removeVolumes:true});removeHostPortAllocations(root,[...compiled.allocations.keys()]);clearRunState(root);});
}
