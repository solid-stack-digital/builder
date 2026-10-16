import { stringify } from "yaml";
import type { RunOptions } from "../RunOptions.js";
import { compileServiceComposition } from "../composition/compileServiceComposition.js";
import { persistHostPortAllocations, removeHostPortAllocations } from "../config/hostPorts.js";
import { checkHostPortCollisions, extractHostPorts } from "../../utils/checkPortCollision.js";
import { redactYamlSecrets } from "../../utils/redactSecrets.js";
import { clearRunState, writeRunState } from "../../utils/runState.js";
import { runWithCleanup } from "../runWithCleanup.js";
import { teardownCompose } from "../teardownCompose.js";
import { runFiniteTester, type FiniteTesterAdapters } from "./runFiniteTester.js";
export interface E2eRuntimeAdapters { finite?: FiniteTesterAdapters; teardown?: typeof teardownCompose; checkPorts?: typeof checkHostPortCollisions }
export async function runTestE2e(options:RunOptions,adapters:E2eRuntimeAdapters={}):Promise<number> {
  const compiled=compileServiceComposition("e2e",options.projectDir,{validationMode:Boolean(options.dryRun)}),yaml=stringify(compiled.compose);
  if(options.debug)console.log(redactYamlSecrets(yaml));
  if(options.dryRun)return 0;
  await (adapters.checkPorts??checkHostPortCollisions)(extractHostPorts(yaml));
  await (adapters.teardown??teardownCompose)(yaml,options.projectDir,{removeVolumes:true,silent:true});
  persistHostPortAllocations(options.projectDir,compiled.allocations);
  writeRunState(options.projectDir,{projectName:compiled.projectName,stage:"test-e2e",configStage:"e2e",workflow:"test",composition:"service",projectDir:options.projectDir,runtimeServiceNames:compiled.runtimeServiceNames,testerServiceNames:compiled.testerServiceNames,allocatedEndpointKeys:[...compiled.allocations.keys()]});
  return runWithCleanup(()=>runFiniteTester(compiled,options.projectDir,adapters.finite),async()=>{await (adapters.teardown??teardownCompose)(yaml,options.projectDir,{removeVolumes:true});removeHostPortAllocations(options.projectDir,[...compiled.allocations.keys()]);clearRunState(options.projectDir);});
}
