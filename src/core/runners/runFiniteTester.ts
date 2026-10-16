import { spawnSync } from "node:child_process";
import { stringify } from "yaml";
import type { CompiledComposition } from "../composition/types.js";
import { inspectRequiredHealth, type InspectImage } from "../composition/inspectRequiredHealth.js";
import { runCompose } from "../runCompose.js";
import { checkHostPortCollisions,extractHostPorts } from "../../utils/checkPortCollision.js";
export interface FiniteTesterAdapters {
  compose?: typeof runCompose;
  inspectRunnerExit?: (yaml:string,projectDir:string,runner:string)=>number|undefined;
  inspectImage?: InspectImage;
  checkPorts?: typeof checkHostPortCollisions;
}
function inspectRunnerExit(yaml:string,projectDir:string,runner:string):number|undefined {
  const ps=spawnSync("docker",["compose","--project-directory",projectDir,"-f","-","ps","-aq",runner],{cwd:projectDir,encoding:"utf8",input:yaml});
  const id=ps.stdout?.trim();
  if(ps.status!==0||!id)return undefined;
  const inspected=spawnSync("docker",["inspect","--format","{{.State.ExitCode}}",id],{cwd:projectDir,encoding:"utf8"});
  const code=Number(inspected.stdout?.trim());
  return inspected.status===0&&Number.isInteger(code)?code:undefined;
}
/** Start the full effective graph and report only the selected runner's exit status. */
export async function runFiniteTester(compiled:CompiledComposition,projectDir:string,adapters:FiniteTesterAdapters={}):Promise<number> {
  const compose=adapters.compose??runCompose;
  if(!compiled.testerServiceName)throw new Error("Finite tester composition has no selected runner");
  const yaml=stringify(compiled.compose);
  const members=[...new Set([...compiled.runtimeServiceNames,...compiled.testerServiceNames])];
  const built=members.filter(name=>compiled.compose.services[name]?.build!==undefined);
  const images=members.filter(name=>compiled.compose.services[name]?.build===undefined&&compiled.compose.services[name]?.image!==undefined);
  if(built.length){const buildStatus=await compose(["build",...built],yaml,projectDir,{removeVolumes:true});if(buildStatus!==0)return buildStatus;}
  if(images.length){const pullStatus=await compose(["pull","--policy","missing",...images],yaml,projectDir,{removeVolumes:true});if(pullStatus!==0)return pullStatus;}
  inspectRequiredHealth(compiled.deferredHealthChecks??[],projectDir,adapters.inspectImage,"e2e",[...compiled.graph.nodes.values()].some(node=>node.meshRoot!==undefined)?"mesh":"service");
  await (adapters.checkPorts??checkHostPortCollisions)(extractHostPorts(yaml));
  let startStatus:number;
  try {
    startStatus=await compose(["up","--no-build","--detach",...members],yaml,projectDir,{removeVolumes:true,timeoutMs:120_000});
  } catch (error) {
    throw new Error(`Tester startup failed while waiting for ${members.join(", ")}: ${error instanceof Error?error.message:String(error)}`,{cause:error});
  }
  if(startStatus!==0){try{await compose(["logs","--no-color"],yaml,projectDir,{removeVolumes:true});}catch(error){console.warn("Could not collect startup logs",error);}return startStatus;}
  const waited=await compose(["wait",compiled.testerServiceName],yaml,projectDir,{removeVolumes:true});
  const inspected=(adapters.inspectRunnerExit??inspectRunnerExit)(yaml,projectDir,compiled.testerServiceName);
  const status=inspected??(waited===0?1:waited);
  try{await compose(["logs","--no-color"],yaml,projectDir,{removeVolumes:true});}catch(error){console.warn("Could not collect tester logs",error);}
  return status;
}
