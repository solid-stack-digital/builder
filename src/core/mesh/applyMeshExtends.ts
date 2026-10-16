import { ConfigError } from "../../errors/ConfigError.js";
import { applyServiceOverlay } from "../config/stageMerge.js";
import type { EffectiveBuildConfig, EffectiveMeshConfig, Origin } from "../config/types.js";
import type { EffectiveService } from "../config/types.js";
export function applyMeshExtends(mesh: EffectiveMeshConfig, builds: Map<string,EffectiveBuildConfig>, stage: string): void {
  for (const [root, build] of builds) {
    const entry = mesh.services[root]!;
    for (const layer of entry.extendsLayers) for (const [name, patch] of Object.entries(layer.patches).sort(([a],[b]) => a.localeCompare(b))) {
      const old = build.services[name];
      const origin: Origin = { ...layer.origin, meshRoot: root, configPath: `${layer.origin.configPath}.${name}` };
      if (!old) throw new ConfigError({ sourceFile: mesh.sourceFile, configPath: origin.configPath, stage, composition: "mesh", referencedObject: `${root}.source.${name}`, reason: "extends target does not exist" });
      if (patch.compose !== undefined && patch.compose !== (old as { compose?: string }).compose) throw new ConfigError({ sourceFile: mesh.sourceFile, configPath: `${origin.configPath}.compose`, stage, composition: "mesh", reason: `compose is immutable; previous ${build.origins.get(name)?.configPath}.compose`, value: patch.compose });
      for(const [target,kind] of Object.entries((patch.requisites as Record<string,unknown>)??{}))if(kind===false){
        const exists=target.startsWith("source.")?Boolean(build.services[target.slice(7)]):Boolean(mesh.services[target]);
        if(!exists)throw new ConfigError({sourceFile:mesh.sourceFile,configPath:`${origin.configPath}.requisites.${target}`,stage,composition:"mesh",referencedObject:target,reason:"Unknown requisite target"});
      }
      const canonicalPatch = structuredClone(patch);
      if (canonicalPatch.requisites) {
        canonicalPatch.requisites = Object.fromEntries(Object.entries(canonicalPatch.requisites as Record<string,unknown>).map(([target, kind]) => [target.startsWith("source.") ? target.slice(7) : `@mesh:${target}`, kind]));
      }
      build.services[name] = applyServiceOverlay(old as EffectiveService & Record<string,unknown>, canonicalPatch) as EffectiveService;
      const env = build.envOrigins.get(name) ?? new Map<string,Origin>();
      for (const key of Object.keys((patch.env as Record<string,string>) ?? {})) env.set(key,{ ...origin, configPath: `${origin.configPath}.env.${key}` });
      build.envOrigins.set(name,env);
      const edges = build.requisiteOrigins.get(name) ?? new Map<string,Origin>();
      for (const [target, kind] of Object.entries((patch.requisites as Record<string,unknown>) ?? {})) {
        const canonical = target.startsWith("source.") ? target.slice(7) : `@mesh:${target}`;
        if (kind === false) edges.delete(canonical); else edges.set(canonical,{ ...origin, configPath: `${origin.configPath}.requisites.${target}` });
      }
      build.requisiteOrigins.set(name,edges);
      build.layers.push({ stage: layer.layer, services: { [name]: structuredClone(patch) }, origin });
    }
  }
}
