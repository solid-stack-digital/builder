import { ConfigError } from "../../errors/ConfigError.js";
import { PortConflictError } from "../../errors/PortConflictError.js";
import type { PublicPort } from "../../types/index.js";
import type { EffectiveGraph, NodeId, Origin } from "./types.js";
import { displayNode, nodeId } from "./types.js";
export interface PublicationIntent { nodeId: NodeId; endpoint: string; requestedPort: PublicPort; origin: Origin; logicalPath: string }
export function resolvePublicationIntent(graph: EffectiveGraph, stage: string, composition: "service"|"mesh", publish?: Map<string,string[]>, meshSourceFile?: string, publishOrigins?: Map<string,Origin>): PublicationIntent[] {
  const result: PublicationIntent[] = [];
  const append = (id: NodeId, endpoint: string, origin: Origin, selector: string) => {
    const node=graph.nodes.get(id);
    if (!node) throw new ConfigError({sourceFile:origin.sourceFile,configPath:origin.configPath,stage,composition,referencedObject:selector,reason:"publish selector target is not reachable"});
    const def=node.declaration.endpoints[endpoint];
    if (!def || def.publicPort===undefined) throw new ConfigError({sourceFile:origin.sourceFile,configPath:origin.configPath,stage,composition,referencedObject:selector,reason:"publish selector requires an endpoint with publicPort capability"});
    result.push({nodeId:id,endpoint,requestedPort:def.publicPort,origin,logicalPath:`${displayNode(id)}.endpoints.${endpoint}`});
  };
  if (composition === "service") {
    for (const [id,node] of graph.nodes) for (const [endpoint,def] of Object.entries(node.declaration.endpoints)) if (def.publicPort!==undefined) append(id,endpoint,node.origin,`${displayNode(id)}.endpoints.${endpoint}`);
  } else if (publish) for (const [root,selectors] of publish) {
    const main=nodeId(root,"main"), closure=graph.closures.get(main) ?? new Set<NodeId>();
    for (const selector of new Set(selectors)) {
      const match=/^([a-z][a-z0-9-]*)\.endpoints\.([a-z][a-z0-9-]*)$/.exec(selector);
      const mainOrigin=graph.nodes.get(main)?.origin;
      if (!mainOrigin) continue;
      const origin:Origin=publishOrigins?.get(root)??(meshSourceFile?{...mainOrigin,sourceFile:meshSourceFile,configPath:`services.${root}.publish`,scope:"mesh"}:mainOrigin);
      if (!match) throw new ConfigError({sourceFile:origin.sourceFile,configPath:origin.configPath,stage,composition,referencedObject:selector,reason:"Invalid publish selector; expected <local>.endpoints.<endpoint>"});
      const id=nodeId(root,match[1]!);
      if (!closure.has(id)) throw new ConfigError({sourceFile:origin.sourceFile,configPath:origin.configPath,stage,composition,referencedObject:selector,reason:"publish selector target is not in source main requisite closure"});
      append(id,match[2]!,origin,selector);
    }
  }
  result.sort((a,b)=>`${a.nodeId}:${a.endpoint}`.localeCompare(`${b.nodeId}:${b.endpoint}`));
  const fixed=new Map<number,PublicationIntent>();
  for(const item of result)if(typeof item.requestedPort==="number"){
    const prior=fixed.get(item.requestedPort);
    if(prior)throw new PortConflictError(item.requestedPort,prior.logicalPath,item.logicalPath,stage,item.origin.sourceFile,composition);
    fixed.set(item.requestedPort,item);
  }
  return result;
}
