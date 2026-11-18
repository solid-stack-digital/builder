import { stringify } from "yaml";
import type { RunOptions } from "../RunOptions.js";
import { compileServiceComposition } from "../composition/compileServiceComposition.js";
import type { CompiledComposition } from "../composition/types.js";
import { nodeId } from "../config/types.js";
import { persistHostPortAllocations, removeHostPortAllocations } from "../config/hostPorts.js";
import { checkHostPortCollisions, extractHostPorts } from "../../utils/checkPortCollision.js";
import { redactYamlSecrets } from "../../utils/redactSecrets.js";
import { clearRunState, writeRunState } from "../../utils/runState.js";
import { runWithCleanup } from "../runWithCleanup.js";
import { runCompose } from "../runCompose.js";
import { teardownCompose } from "../teardownCompose.js";
import { inspectRunnerExit } from "./runFiniteTester.js";
import { finishFollow, followerFor, type FollowCompose } from "./liveLogs.js";
import { currentOutput } from "../output/index.js";
export type InspectServiceExit = (yaml:string,projectDir:string,service:string)=>number|undefined;
export interface UnitRuntimeAdapters { compose?: typeof runCompose; teardown?: typeof teardownCompose; checkPorts?: typeof checkHostPortCollisions; inspectExit?: InspectServiceExit; follow?: FollowCompose }
/** Isolated unit graph with on-inframode-isolated modules: start detached, wait for main, report main's exit. */
async function runUnitWithLocalModules(compiled:CompiledComposition,yaml:string,main:string,projectDir:string,compose:typeof runCompose,inspectExit:InspectServiceExit,follow:FollowCompose):Promise<number> {
  const started=await compose(["up","--build","--detach",...compiled.runtimeServiceNames],yaml,projectDir,{removeVolumes:true,timeoutMs:120_000});
  if(started!==0){try{await compose(["logs","--no-color"],yaml,projectDir,{removeVolumes:true});}catch(error){currentOutput().warn("Could not collect startup logs",error);}return started;}
  const follower=follow(["logs","--follow","--no-color",main],yaml,projectDir);
  const waited=await compose(["wait",main],yaml,projectDir,{removeVolumes:true});
  const status=inspectExit(yaml,projectDir,main)??(waited===0?1:waited);
  await finishFollow(follower);
  return status;
}
export async function runTestUnit(options:RunOptions,adapters:UnitRuntimeAdapters={}):Promise<number> {
  const compiled=compileServiceComposition("test",options.projectDir,{validationMode:Boolean(options.dryRun)}),yaml=stringify(compiled.compose);
  const main=compiled.mainServiceNames.get(nodeId(undefined,"main"))!;
  if(options.debug)currentOutput().log(redactYamlSecrets(yaml));
  if(options.dryRun)return 0;
  await (adapters.checkPorts??checkHostPortCollisions)(extractHostPorts(yaml));
  await (adapters.teardown??teardownCompose)(yaml,options.projectDir,{removeVolumes:true,silent:true});
  persistHostPortAllocations(options.projectDir,compiled.allocations);
  writeRunState(options.projectDir,{projectName:compiled.projectName,stage:"test-unit",configStage:"test",workflow:"test",composition:"service",projectDir:options.projectDir,runtimeServiceNames:compiled.runtimeServiceNames,testerServiceNames:[],allocatedEndpointKeys:[...compiled.allocations.keys()]});
  const compose=adapters.compose??runCompose;
  const execute=compiled.runtimeServiceNames.length===1
    ?()=>compose(["up","--build","--abort-on-container-exit","--exit-code-from",main,main],yaml,options.projectDir,{removeVolumes:true})
    :()=>runUnitWithLocalModules(compiled,yaml,main,options.projectDir,compose,adapters.inspectExit??inspectRunnerExit,followerFor(adapters));
  return runWithCleanup(execute,async()=>{await (adapters.teardown??teardownCompose)(yaml,options.projectDir,{removeVolumes:true});removeHostPortAllocations(options.projectDir,[...compiled.allocations.keys()]);clearRunState(options.projectDir);});
}
