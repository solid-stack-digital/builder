import { stringify } from "yaml";
import type { RunOptions } from "../RunOptions.js";
import { compileServiceComposition } from "../composition/compileServiceComposition.js";
import { nodeId } from "../config/types.js";
import { persistHostPortAllocations, removeHostPortAllocations } from "../config/hostPorts.js";
import { checkHostPortCollisions, extractHostPorts } from "../../utils/checkPortCollision.js";
import { redactYamlSecrets } from "../../utils/redactSecrets.js";
import { clearRunState, writeRunState } from "../../utils/runState.js";
import { runWithCleanup } from "../runWithCleanup.js";
import { runCompose } from "../runCompose.js";
import { teardownCompose } from "../teardownCompose.js";
export interface UnitRuntimeAdapters { compose?: typeof runCompose; teardown?: typeof teardownCompose; checkPorts?: typeof checkHostPortCollisions }
export async function runTestUnit(options:RunOptions,adapters:UnitRuntimeAdapters={}):Promise<number> {
  const compiled=compileServiceComposition("test",options.projectDir,{validationMode:Boolean(options.dryRun)}),yaml=stringify(compiled.compose);
  const main=compiled.mainServiceNames.get(nodeId(undefined,"main"))!;
  if(options.debug)console.log(redactYamlSecrets(yaml));
  if(options.dryRun)return 0;
  await (adapters.checkPorts??checkHostPortCollisions)(extractHostPorts(yaml));
  await (adapters.teardown??teardownCompose)(yaml,options.projectDir,{removeVolumes:true,silent:true});
  persistHostPortAllocations(options.projectDir,compiled.allocations);
  writeRunState(options.projectDir,{projectName:compiled.projectName,stage:"test-unit",configStage:"test",workflow:"test",composition:"service",projectDir:options.projectDir,runtimeServiceNames:[main],testerServiceNames:[],allocatedEndpointKeys:[...compiled.allocations.keys()]});
  return runWithCleanup(()=>(adapters.compose??runCompose)(["up","--build","--abort-on-container-exit","--exit-code-from",main,main],yaml,options.projectDir,{removeVolumes:true}),async()=>{await (adapters.teardown??teardownCompose)(yaml,options.projectDir,{removeVolumes:true});removeHostPortAllocations(options.projectDir,[...compiled.allocations.keys()]);clearRunState(options.projectDir);});
}
