import { ConfigError } from "../../errors/ConfigError.js";
import { ENDPOINT_PROPERTIES } from "./constants.js";
import { resolveEndpointProperty } from "./endpointProperties.js";
import type { EffectiveGraph, EndpointProperty, NodeId, Origin, ResolvedEndpoint } from "./types.js";
import { displayNode, nodeId } from "./types.js";
export interface ParsedBuilderReference { raw: string; target: NodeId; endpoint: string; property: EndpointProperty; origin: Origin }
export interface ReferenceContext { graph: EffectiveGraph; endpoints: Map<NodeId,Record<string,ResolvedEndpoint>>; consumer?: NodeId; origin: Origin; stage: string; composition: "service"|"mesh" }
const token = /^([a-z][a-z0-9-]*)\.endpoints\.([a-z][a-z0-9-]*)\.([a-z_]+)$/;
const sourceToken = /^source\.([a-z][a-z0-9-]*)\.endpoints\.([a-z][a-z0-9-]*)\.([a-z_]+)$/;
const meshToken = /^([a-z][a-z0-9-]*)\.source\.([a-z][a-z0-9-]*)\.endpoints\.([a-z][a-z0-9-]*)\.([a-z_]+)$/;
function fail(context: ReferenceContext, raw: string, reason: string): never { throw new ConfigError({ sourceFile: context.origin.sourceFile, configPath: context.origin.configPath, stage: context.stage, composition: context.composition, referencedObject: raw, reason }); }
export function parseBuilderReference(raw: string, context: ReferenceContext): ParsedBuilderReference {
  let target: NodeId, endpoint: string, property: string;
  let match: RegExpExecArray | null;
  if (context.origin.scope === "build" && (match = token.exec(raw))) { target = nodeId(context.origin.meshRoot,match[1]!); endpoint=match[2]!;property=match[3]!; }
  else if (context.origin.scope === "mesh" && (match = sourceToken.exec(raw))) { if (!context.origin.meshRoot) fail(context,raw,"source-relative reference requires mesh root");target=nodeId(context.origin.meshRoot,match[1]!);endpoint=match[2]!;property=match[3]!; }
  else if (context.origin.scope === "mesh" && (match = meshToken.exec(raw))) { target=nodeId(match[1]!,match[2]!);endpoint=match[3]!;property=match[4]!; }
  else fail(context,raw,"Invalid V3 endpoint reference grammar");
  if (!(ENDPOINT_PROPERTIES as readonly string[]).includes(property)) fail(context,raw,"Unknown endpoint property");
  return {raw,target,endpoint,property:property as EndpointProperty,origin:context.origin};
}
export function resolveBuilderReference(ref: ParsedBuilderReference, context: ReferenceContext): string {
  const target = context.graph.nodes.get(ref.target);
  if (!target || (context.consumer && !context.graph.closures.get(context.consumer)?.has(ref.target))) fail(context,ref.raw,`outside effective requisite closure: ${context.consumer ? displayNode(context.consumer) : "tester"} -> ${displayNode(ref.target)}`);
  const endpoint = context.endpoints.get(ref.target)?.[ref.endpoint];
  if (!endpoint) fail(context,ref.raw,`Unknown endpoint ${displayNode(ref.target)}.endpoints.${ref.endpoint}`);
  return resolveEndpointProperty(endpoint,ref.property,{sourceFile:context.origin.sourceFile,configPath:context.origin.configPath,stage:context.stage,composition:context.composition,referencedObject:ref.raw});
}
export function interpolateBuilderReferences(value: string, context: ReferenceContext): string {
  const sentinel = "\u0000DOLLAR\u0000";
  const protectedValue = value.replace(/\$\$/g,sentinel);
  if (protectedValue.includes("${") && /\$\{[^}]*$/.test(protectedValue)) fail(context,protectedValue,"Malformed Builder endpoint reference");
  return protectedValue.replace(/\$\{([^}]*)\}/g,(_whole,body:string)=>resolveBuilderReference(parseBuilderReference(body,context),context)).replaceAll(sentinel,"$");
}
export function collectBuilderReferences(value: string, context: ReferenceContext): ParsedBuilderReference[] {
  const safe=value.replace(/\$\$/g,"\u0000DOLLAR\u0000");
  return [...safe.matchAll(/\$\{([^}]*)\}/g)].map(match=>parseBuilderReference(match[1]!,context));
}
