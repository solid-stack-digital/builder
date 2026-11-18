import { stringify } from "yaml";
import type { Environment } from "../../types/index.js";
import type { RunOptions } from "../RunOptions.js";
import type { MeshRunOptions } from "../mesh/MeshRunOptions.js";
import type { CompiledComposition } from "../composition/types.js";
import { inspectRequiredHealth, type InspectImage } from "../composition/inspectRequiredHealth.js";
import { anonymousVolumeServices } from "../composition/composeVolumes.js";
import { persistHostPortAllocations, removeHostPortAllocations } from "../config/hostPorts.js";
import { checkHostPortCollisions, extractHostPorts } from "../../utils/checkPortCollision.js";
import { redactYamlSecrets } from "../../utils/redactSecrets.js";
import { writeRunState, clearRunState } from "../../utils/runState.js";
import { runWithCleanup } from "../runWithCleanup.js";
import { runCompose } from "../runCompose.js";
import { teardownCompose } from "../teardownCompose.js";
import { currentOutput } from "../output/index.js";
export interface LongLivedAdapters { compose?:typeof runCompose; teardown?:typeof teardownCompose; checkPorts?:typeof checkHostPortCollisions; inspectImage?:InspectImage }
export async function runLongLived(stage:"dev"|"prod",projectDir:string,options:RunOptions|MeshRunOptions,compile:(validationMode:boolean)=>CompiledComposition,composition:"service"|"mesh",adapters:LongLivedAdapters={}):Promise<number> {
  const compiled=compile(Boolean(options.dryRun)),yaml=stringify(compiled.compose);
  if(options.debug)currentOutput().log(redactYamlSecrets(yaml));
  if(options.dryRun)return 0;
  await (adapters.checkPorts??checkHostPortCollisions)(extractHostPorts(yaml));
  persistHostPortAllocations(projectDir,compiled.allocations);
  try {
    writeRunState(projectDir,{projectName:compiled.projectName,stage,configStage:stage,workflow:stage,composition,projectDir,runtimeServiceNames:compiled.runtimeServiceNames,testerServiceNames:[],allocatedEndpointKeys:[...compiled.allocations.keys()],anonymousVolumeServices:anonymousVolumeServices(compiled.compose.services)});
  } catch (error) {
    removeHostPortAllocations(projectDir,[...compiled.allocations.keys()]);
    throw error;
  }
  let succeeded=false;
  return runWithCleanup(async()=>{
    const built=compiled.runtimeServiceNames.filter(name=>compiled.compose.services[name]?.build!==undefined);
    const images=compiled.runtimeServiceNames.filter(name=>compiled.compose.services[name]?.build===undefined&&compiled.compose.services[name]?.image!==undefined);
    if(built.length){const result=await (adapters.compose??runCompose)(["build",...built],yaml,projectDir,{removeVolumes:false});if(result!==0)return result;}
    if(images.length){const result=await (adapters.compose??runCompose)(["pull","--policy","missing",...images],yaml,projectDir,{removeVolumes:false});if(result!==0)return result;}
    inspectRequiredHealth(compiled.deferredHealthChecks,projectDir,adapters.inspectImage,stage,composition);
    await (adapters.checkPorts??checkHostPortCollisions)(extractHostPorts(yaml));
    const compose=adapters.compose??runCompose,services=compiled.runtimeServiceNames,out=currentOutput();
    if(!options.detach&&out.mode!=="normal"){
      // Quiet attached run: start detached and wait for health so the "running" line is true,
      // then follow logs until Ctrl-C (exit 130), which counts as a clean stop.
      const started=await compose(["up","--no-build","--detach","--wait",...services],yaml,projectDir,{removeVolumes:false});
      if(started!==0)return started;
      out.result({kind:"running"});
      const followed=await compose(["logs","--follow","--no-color",...services],yaml,projectDir,{removeVolumes:false});
      return followed===130?0:followed;
    }
    const status=await compose(["up","--no-build",...(options.detach?["--detach"]:[]),...services],yaml,projectDir,{removeVolumes:false});
    succeeded=status===0;
    return status;
  },async()=>{
    if(options.detach&&succeeded)return;
    await (adapters.teardown??teardownCompose)(yaml,projectDir,{removeVolumes:false});
    removeHostPortAllocations(projectDir,[...compiled.allocations.keys()]);
    clearRunState(projectDir);
  });
}
