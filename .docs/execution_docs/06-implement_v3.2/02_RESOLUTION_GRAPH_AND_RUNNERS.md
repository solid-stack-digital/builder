# 02 — Stage resolution, graph, and runners

Files touched: `src/core/config/resolveBuildStage.ts`, `src/core/composition/compileServiceComposition.ts`, `src/core/config/serviceGraph.ts`, `src/core/runners/runFiniteTester.ts`, `src/core/runners/runTestUnit.ts`.

Files that must **not** change: `src/core/mesh/loadMeshSources.ts` (it keeps calling `resolveBuildStage` with three arguments, so `isolated` defaults to `false`), `src/core/mesh/applyMeshExtends.ts`, `src/core/config/references.ts`, `src/core/composition/compileGraphComposition.ts`, `src/core/runners/runLongLived.ts`.

---

## Step 2.1 — `src/core/config/resolveBuildStage.ts` (replace the whole file)

The changes from 3.1.0 are:
- the `isolatedOverlay` flag on `originFor`;
- `record` takes the services path explicitly;
- the overlay loop moves into `applyOverlay`, which is reused for the block;
- the block is applied after the stage chain when `options.isolated` is true.

All validation after the overlays is unchanged.

```ts
import path from "node:path";
import { ConfigError } from "../../errors/ConfigError.js";
import type { BuildJson, Environment, TesterService } from "../../types/index.js";
import { assertPrimaryEndpointInvariant } from "./endpointProperties.js";
import { applyServiceOverlay, stageOverlayChain } from "./stageMerge.js";
import type { EffectiveBuildConfig, EffectiveService, Origin } from "./types.js";

export const ISOLATED_OVERLAY_KEY = "on-inframode-isolated" as const;
export interface ResolveBuildStageOptions { isolated?: boolean }
const originFor = (sourceFile: string, configPath: string, layer: "base" | Environment, isolatedOverlay = false): Origin => ({ sourceFile, configPath, projectDir: path.dirname(sourceFile), scope: "build", layer, ...(isolatedOverlay ? { isolatedOverlay: true as const } : {}) });
const fail = (sourceFile: string, stage: Environment, configPath: string, reason: string, value?: unknown): never => { throw new ConfigError({ sourceFile, stage, composition: "service", configPath, reason, value }); };
export function resolveBuildStage(build: BuildJson, stage: Environment, sourceFile: string, options: ResolveBuildStageOptions = {}): EffectiveBuildConfig {
  const services = structuredClone(build.services) as unknown as Record<string, Record<string,unknown>>;
  const origins = new Map<string,Origin>();
  const envOrigins = new Map<string,Map<string,Origin>>();
  const buildArgsOrigins = new Map<string,Map<string,Origin>>();
  const requisiteOrigins = new Map<string,Map<string,Origin>>();
  const layers: EffectiveBuildConfig["layers"] = [];
  const deletedRequisiteTargets: {target:string;path:string}[] = [];
  const record = (name: string, entry: Record<string,unknown>, layer: "base"|Environment, servicesPath: string, isolatedOverlay = false) => {
    const where = `${servicesPath}.${name}`;
    const origin = originFor(sourceFile, where, layer, isolatedOverlay);
    origins.set(name, origin);
    const env = envOrigins.get(name) ?? new Map<string,Origin>();
    for (const key of Object.keys((entry.env as Record<string,string>) ?? {})) env.set(key, originFor(sourceFile, `${where}.env.${key}`, layer, isolatedOverlay));
    envOrigins.set(name, env);
    const args = buildArgsOrigins.get(name) ?? new Map<string,Origin>();
    for (const key of Object.keys((entry.buildArgs as Record<string,string>) ?? {})) args.set(key, originFor(sourceFile, `${where}.buildArgs.${key}`, layer, isolatedOverlay));
    buildArgsOrigins.set(name, args);
    const edges = requisiteOrigins.get(name) ?? new Map<string,Origin>();
    for (const [key, value] of Object.entries((entry.requisites as Record<string,unknown>) ?? {})) {
      if (value === false) edges.delete(key); else edges.set(key, originFor(sourceFile, `${where}.requisites.${key}`, layer, isolatedOverlay));
    }
    requisiteOrigins.set(name, edges);
  };
  const applyOverlay = (patches: Record<string,Record<string,unknown>>, overlayStage: Environment, servicesPath: string, isolatedOverlay: boolean) => {
    for (const [name, patch] of Object.entries(patches).sort(([a],[b]) => a.localeCompare(b))) {
      const current = services[name];
      const where = `${servicesPath}.${name}`;
      if (isolatedOverlay && name === "tester") fail(sourceFile, stage, where, `tester cannot be configured in ${ISOLATED_OVERLAY_KEY}`);
      if (!current && (name === "main" || name === "tester")) fail(sourceFile, stage, where, "Required special service is missing from base");
      if (current && patch.compose !== undefined && patch.compose !== current.compose) fail(sourceFile, stage, `${where}.compose`, `compose is immutable; previous declaration ${origins.get(name)?.configPath}.compose, attempted ${where}.compose`, patch.compose);
      if (!current && name !== "main" && name !== "tester" && (typeof patch.compose !== "string" || !patch.compose.trim())) fail(sourceFile, stage, `${where}.compose`, "Stage-introduced service requires a complete compose declaration");
      services[name] = current ? applyServiceOverlay(current, patch) : structuredClone(patch);
      for (const [target,kind] of Object.entries((patch.requisites as Record<string,unknown>)??{})) if(kind===false)deletedRequisiteTargets.push({target,path:`${where}.requisites.${target}`});
      record(name, patch, overlayStage, servicesPath, isolatedOverlay);
    }
    layers.push({ stage: overlayStage, services: structuredClone(patches), origin: originFor(sourceFile, servicesPath, overlayStage, isolatedOverlay) });
  };
  for (const [name, value] of Object.entries(services).sort(([a],[b]) => a.localeCompare(b))) record(name, value, "base", "services");
  layers.push({ stage: "base", services: structuredClone(services), origin: originFor(sourceFile, "services", "base") });
  for (const overlayStage of stageOverlayChain(stage)) applyOverlay((build[overlayStage]?.services ?? {}) as Record<string,Record<string,unknown>>, overlayStage, `${overlayStage}.services`, false);
  if (options.isolated && (stage === "dev" || stage === "test")) {
    const block = build[stage]?.[ISOLATED_OVERLAY_KEY];
    if (block) applyOverlay((block.services ?? {}) as Record<string,Record<string,unknown>>, stage, `${stage}.${ISOLATED_OVERLAY_KEY}.services`, true);
  }
  for(const deleted of deletedRequisiteTargets)if(!(deleted.target in services))fail(sourceFile,stage,deleted.path,"Unknown requisite target",deleted.target);
  for (const [name, value] of Object.entries(services)) {
    const originPath = origins.get(name)?.configPath ?? `services.${name}`;
    if (name === "tester") {
      if (typeof value.compose !== "string" || typeof value.service !== "string") fail(sourceFile, stage, originPath, "Effective tester requires compose and service");
      continue;
    }
    const endpoints = (value.endpoints ?? {}) as Record<string, { port?: number; service?: string; primary?: boolean }>;
    for (const [endpointName, endpoint] of Object.entries(endpoints)) {
      if (!Number.isInteger(endpoint.port) || endpoint.port! < 1 || endpoint.port! > 65535) fail(sourceFile, stage, `${originPath}.endpoints.${endpointName}.port`, "Effective endpoint requires port in 1..65535", endpoint.port);
      if (name !== "main" && (typeof endpoint.service !== "string" || !endpoint.service.trim())) fail(sourceFile, stage, `${originPath}.endpoints.${endpointName}.service`, "Effective ordinary endpoint requires service");
    }
    assertPrimaryEndpointInvariant(endpoints, { sourceFile, stage, configPath: `${originPath}.endpoints` });
    if (name !== "main" && (typeof value.compose !== "string" || !value.compose.trim())) fail(sourceFile, stage, `${originPath}.compose`, "Effective ordinary service requires compose");
    if (name !== "main" && Object.keys(endpoints).length === 0 && (typeof value.service !== "string" || !value.service.trim())) fail(sourceFile, stage, `${originPath}.service`, "endpoint-less service requires service");
    if (name !== "main" && Object.keys(endpoints).length > 0 && typeof value.service === "string") {
      const primary = Object.values(endpoints).find(endpoint => endpoint.primary);
      if (primary?.service && value.service !== primary.service) fail(sourceFile, stage, `${originPath}.service`, "top-level service must equal primary endpoint owner", value.service);
    }
    value.env ??= {}; if(name === "main") value.buildArgs ??= {}; value.endpoints ??= {}; value.requisites ??= {};
    value.kind = name === "main" ? "main" : "ordinary";
  }
  return { name: build.name, services: services as unknown as Record<string,EffectiveService|TesterService>, layers, origins, envOrigins, buildArgsOrigins, requisiteOrigins, sourceFile, projectDir: path.dirname(sourceFile) };
}
```

The 3.1.0 file imports `MainService` and `OrdinaryService` but never uses them. The new import line drops them on purpose.

## Step 2.2 — `src/core/composition/compileServiceComposition.ts` (replace the whole file)

```ts
import path from "node:path";
import type { Environment } from "../../types/index.js";
import { getBuildJson } from "../../utils/getBuildJson.js";
import { resolveProjectDir } from "../../utils/paths.js";
import { executionProfile } from "../config/executionProfile.js";
import { resolveBuildStage } from "../config/resolveBuildStage.js";
import { compileGraphComposition } from "./compileGraphComposition.js";
import type { CompiledComposition } from "./types.js";
export interface CompileServiceCompositionOptions { full?:boolean|undefined; silenceWarnings?:boolean|undefined; validationMode?:boolean|undefined }
export function compileServiceComposition(stage:Environment,projectDir:string,options:CompileServiceCompositionOptions={}):CompiledComposition {
  const root=resolveProjectDir(projectDir),isolated=executionProfile(stage,"service",Boolean(options.full)).infraMode==="isolated";
  const build=resolveBuildStage(getBuildJson(root),stage,path.join(root,"build.json"),{isolated});
  return compileGraphComposition({stage,composition:"service",projectDir:root,name:build.name,instances:new Map([["",build]]),full:Boolean(options.full),validationMode:Boolean(options.validationMode)});
}
```

## Step 2.3 — `src/core/config/serviceGraph.ts`

**2.3a.** Replace `computeClosure`:

```ts
export function computeClosure(start: NodeId, adjacency: ReadonlyMap<NodeId, readonly Edge[]>): Set<NodeId> {
  const visited = new Set<NodeId>(); const stack = [start];
  while (stack.length) { const id = stack.pop()!; if (visited.has(id)) continue; visited.add(id); for (const edge of adjacency.get(id) ?? []) stack.push(edge.target); }
  return visited;
}
```

with:

```ts
export function computeClosure(start: NodeId, adjacency: ReadonlyMap<NodeId, readonly Edge[]>, follow: (edge: Edge) => boolean = () => true): Set<NodeId> {
  const visited = new Set<NodeId>(); const stack = [start];
  while (stack.length) { const id = stack.pop()!; if (visited.has(id)) continue; visited.add(id); for (const edge of adjacency.get(id) ?? []) if (follow(edge)) stack.push(edge.target); }
  return visited;
}
```

**2.3b.** In `selectReachableGraph`, replace these five lines:

```ts
  const active = new Set<NodeId>();
  if (profile.infraMode === "isolated") for (const root of declared.roots) active.add(root);
  else for (const root of declared.roots) for (const id of computeClosure(root,adjacency)) active.add(id);
  const nodes = new Map([...declared.nodes].filter(([id]) => active.has(id)));
  const edges = profile.infraMode === "isolated" ? [] : declared.edges.filter(edge => active.has(edge.consumer) && active.has(edge.target));
```

with:

```ts
  const rootSet = new Set(declared.roots), isolated = profile.infraMode === "isolated";
  // Isolated runs follow root edges only when declared in on-inframode-isolated; activated modules keep their own edges.
  const follow = (edge: Edge): boolean => !isolated || !rootSet.has(edge.consumer) || edge.origin.isolatedOverlay === true;
  const active = new Set<NodeId>();
  for (const root of declared.roots) for (const id of computeClosure(root,adjacency,follow)) active.add(id);
  const nodes = new Map([...declared.nodes].filter(([id]) => active.has(id)));
  const edges = declared.edges.filter(edge => follow(edge) && active.has(edge.consumer) && active.has(edge.target));
```

Leave the rest of the function unchanged. The later `computeClosure(id,activeAdjacency)` call keeps the default `follow`.

Why this is identical to 3.1.0 without a block: in isolated mode no origin carries `isolatedOverlay`. Every root edge fails `follow`, so `active` = roots. Every non-root edge has an inactive consumer, so `edges` = `[]`. In integrated mode `follow` is always true.

## Step 2.4 — `src/core/runners/runFiniteTester.ts`

Replace:

```ts
function inspectRunnerExit(yaml:string,projectDir:string,runner:string):number|undefined {
```

with:

```ts
export function inspectRunnerExit(yaml:string,projectDir:string,runner:string):number|undefined {
```

## Step 2.5 — `src/core/runners/runTestUnit.ts` (replace the whole file)

```ts
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
export type InspectServiceExit = (yaml:string,projectDir:string,service:string)=>number|undefined;
export interface UnitRuntimeAdapters { compose?: typeof runCompose; teardown?: typeof teardownCompose; checkPorts?: typeof checkHostPortCollisions; inspectExit?: InspectServiceExit }
/** Isolated unit graph with on-inframode-isolated modules: start detached, wait for main, report main's exit. */
async function runUnitWithLocalModules(compiled:CompiledComposition,yaml:string,main:string,projectDir:string,compose:typeof runCompose,inspectExit:InspectServiceExit):Promise<number> {
  const started=await compose(["up","--build","--detach",...compiled.runtimeServiceNames],yaml,projectDir,{removeVolumes:true,timeoutMs:120_000});
  if(started!==0){try{await compose(["logs","--no-color"],yaml,projectDir,{removeVolumes:true});}catch(error){console.warn("Could not collect startup logs",error);}return started;}
  const waited=await compose(["wait",main],yaml,projectDir,{removeVolumes:true});
  const status=inspectExit(yaml,projectDir,main)??(waited===0?1:waited);
  try{await compose(["logs","--no-color",main],yaml,projectDir,{removeVolumes:true});}catch(error){console.warn("Could not collect unit logs",error);}
  return status;
}
export async function runTestUnit(options:RunOptions,adapters:UnitRuntimeAdapters={}):Promise<number> {
  const compiled=compileServiceComposition("test",options.projectDir,{validationMode:Boolean(options.dryRun)}),yaml=stringify(compiled.compose);
  const main=compiled.mainServiceNames.get(nodeId(undefined,"main"))!;
  if(options.debug)console.log(redactYamlSecrets(yaml));
  if(options.dryRun)return 0;
  await (adapters.checkPorts??checkHostPortCollisions)(extractHostPorts(yaml));
  await (adapters.teardown??teardownCompose)(yaml,options.projectDir,{removeVolumes:true,silent:true});
  persistHostPortAllocations(options.projectDir,compiled.allocations);
  writeRunState(options.projectDir,{projectName:compiled.projectName,stage:"test-unit",configStage:"test",workflow:"test",composition:"service",projectDir:options.projectDir,runtimeServiceNames:compiled.runtimeServiceNames,testerServiceNames:[],allocatedEndpointKeys:[...compiled.allocations.keys()]});
  const compose=adapters.compose??runCompose;
  const execute=compiled.runtimeServiceNames.length===1
    ?()=>compose(["up","--build","--abort-on-container-exit","--exit-code-from",main,main],yaml,options.projectDir,{removeVolumes:true})
    :()=>runUnitWithLocalModules(compiled,yaml,main,options.projectDir,compose,adapters.inspectExit??inspectRunnerExit);
  return runWithCleanup(execute,async()=>{await (adapters.teardown??teardownCompose)(yaml,options.projectDir,{removeVolumes:true});removeHostPortAllocations(options.projectDir,[...compiled.allocations.keys()]);clearRunState(options.projectDir);});
}
```

## Step 2.6 — Check

```bash
pnpm typecheck
pnpm exec vitest run --config vitest.v3.config.ts   # every existing test must still pass
```

No existing test is expected to change behavior. If one fails, the replacement was not applied exactly. Compare it against this chapter.
