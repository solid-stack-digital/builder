import { spawnSync } from "node:child_process";
import pc from "picocolors";
import { ScriptError } from "../../errors/ScriptError.js";
import { currentOutput } from "../../core/output/index.js";
import { BUILDER_OWNER_LABEL } from "../../core/composition/compileGraphComposition.js";

export interface PruneOptions {
  volumes?: boolean;
  dryRun?: boolean;
}

export async function handlePrune(options: PruneOptions = {},spawn:typeof spawnSync=spawnSync): Promise<number> {
  const filter=`label=${BUILDER_OWNER_LABEL}=true`,out=currentOutput(),inherit=out.mode==="normal";
  for(const kind of ["container","network",...(options.volumes?["volume"]:[])]){
    const args=[kind,"prune","-f","--filter",filter];
    if(options.dryRun){out.log(`docker ${args.join(" ")}`);continue;}
    const result=spawn("docker",args,{stdio:inherit?"inherit":"pipe",encoding:"utf-8"});
    if(!inherit){if(result.stdout)out.write("stdout",String(result.stdout));if(result.stderr)out.write("stderr",String(result.stderr));}
    if(result.error||result.status!==0)throw new ScriptError(`Failed to prune Builder ${kind}s: ${result.error?.message??result.stderr??`exit code ${result.status}`}`);
  }
  if(!options.dryRun)out.log(pc.green("Builder-owned Docker resources pruned."));
  return 0;
}
