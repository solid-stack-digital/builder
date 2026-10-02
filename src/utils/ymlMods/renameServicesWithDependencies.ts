import { ScriptError } from "../../errors/ScriptError.js";
import type { BuildDependency } from "../../types/index.js";

export const renameServicesWithDependencies = (
  yml: any,
  dependencies: BuildDependency[]
): void => {
  if (!yml || !yml.services || typeof yml.services !== "object") {
    throw new ScriptError("Invalid YAML structure. Missing 'services' field.");
  }

  if (!dependencies || dependencies.length === 0) {
    return;
  }

  // Build rename mapping: old serviceName -> new dependency name
  const renameMap = new Map<string, string>();
  for (const dep of dependencies) {
    if (dep.serviceName && dep.name && dep.serviceName !== dep.name) {
      renameMap.set(dep.serviceName, dep.name);
    }
  }

  if (renameMap.size === 0) {
    return;
  }

  // Check for collisions before performing renames
  const currentKeys = new Set(Object.keys(yml.services));
  for (const [oldName, newName] of renameMap.entries()) {
    if (currentKeys.has(newName) && !renameMap.has(newName)) {
      throw new ScriptError(
        `Service collision: cannot rename "${oldName}" to "${newName}" because a service named "${newName}" already exists in the stack.`
      );
    }
  }

  // 1. Rename service keys
  const newServices: Record<string, any> = {};
  for (const [name, service] of Object.entries(yml.services)) {
    const targetName = renameMap.get(name) || name;
    newServices[targetName] = service;
  }
  yml.services = newServices;

  // 2. Update service cross-references
  for (const service of Object.values(yml.services) as any[]) {
    if (!service || typeof service !== "object") continue;

    // depends_on (object or array form)
    if (service.depends_on) {
      if (Array.isArray(service.depends_on)) {
        service.depends_on = service.depends_on.map(
          (dep: string) => renameMap.get(dep) || dep
        );
      } else if (typeof service.depends_on === "object") {
        const updatedDependsOn: Record<string, any> = {};
        for (const [depName, depConfig] of Object.entries(service.depends_on)) {
          const targetDepName = renameMap.get(depName) || depName;
          updatedDependsOn[targetDepName] = depConfig;
        }
        service.depends_on = updatedDependsOn;
      }
    }

    // links
    if (Array.isArray(service.links)) {
      service.links = service.links.map((link: string) => {
        const [targetSvc, alias] = link.split(":");
        if (targetSvc && renameMap.has(targetSvc)) {
          const newTarget = renameMap.get(targetSvc)!;
          return alias ? `${newTarget}:${alias}` : newTarget;
        }
        return link;
      });
    }

    // network_mode: service:xxx
    if (
      typeof service.network_mode === "string" &&
      service.network_mode.startsWith("service:")
    ) {
      const targetSvc = service.network_mode.slice("service:".length);
      if (renameMap.has(targetSvc)) {
        service.network_mode = `service:${renameMap.get(targetSvc)}`;
      }
    }

    // volumes_from
    if (Array.isArray(service.volumes_from)) {
      service.volumes_from = service.volumes_from.map((vf: string) => {
        const [vfSvc, mode] = vf.split(":");
        if (vfSvc && renameMap.has(vfSvc)) {
          const newTarget = renameMap.get(vfSvc)!;
          return mode ? `${newTarget}:${mode}` : newTarget;
        }
        return vf;
      });
    }

    // extends: service
    if (service.extends && typeof service.extends === "object") {
      if (
        service.extends.service &&
        renameMap.has(service.extends.service)
      ) {
        service.extends.service = renameMap.get(service.extends.service);
      }
    }
  }
};
