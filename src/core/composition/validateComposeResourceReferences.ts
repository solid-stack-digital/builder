import { ConfigError } from "../../errors/ConfigError.js";
import { collectBuildSecretReferences } from "./composeBuildResources.js";
import { parseVolume } from "./composeVolumes.js";
import type { ComposeDocument, ComposeService } from "./types.js";

type ResourceKind = "volume" | "network" | "config" | "secret";

export function validateComposeResourceReferences(
  document: ComposeDocument,
  context: {
    sourceFile: string;
    stage?: string;
    composition: "service" | "mesh";
  },
  onlyServices?: Iterable<string>,
): void {
  const selected = onlyServices ? new Set(onlyServices) : undefined;

  const fail = (configPath: string, kind: ResourceKind, name: string): never => {
    throw new ConfigError({
      sourceFile: context.sourceFile,
      configPath,
      ...(context.stage ? { stage: context.stage } : {}),
      composition: context.composition,
      referencedObject: name,
      reason: `Compose ${kind} reference "${name}" has no top-level definition`,
    });
  };

  const exists = (kind: ResourceKind, name: string): boolean => {
    const definitions = document[kind === "volume" ? "volumes" : kind === "network" ? "networks" : kind === "config" ? "configs" : "secrets"];
    return Boolean(definitions && Object.hasOwn(definitions, name));
  };

  const check = (path: string, kind: ResourceKind, name: string): void => {
    if (kind === "network" && name === "default") return;
    if (!exists(kind, name)) fail(path, kind, name);
  };

  for (const [serviceName, service] of Object.entries(document.services ?? {})) {
    if (selected && !selected.has(serviceName)) continue;
    validateServiceResources(serviceName, service, check);
  }
}

function validateServiceResources(
  serviceName: string,
  service: ComposeService,
  check: (path: string, kind: ResourceKind, name: string) => void,
): void {
  for (const mount of Array.isArray(service.volumes) ? service.volumes : []) {
    const parsed = parseVolume(mount);
    if (parsed?.type === "volume" && parsed.source) {
      check(`services.${serviceName}.volumes`, "volume", parsed.source);
    }
  }

  const networks = service.networks;
  const networkNames = Array.isArray(networks)
    ? networks.filter((name): name is string => typeof name === "string")
    : networks && typeof networks === "object"
      ? Object.keys(networks)
      : [];
  for (const name of networkNames) {
    check(`services.${serviceName}.networks`, "network", name);
  }

  for (const kind of ["configs", "secrets"] as const) {
    const entries = service[kind];
    if (!Array.isArray(entries)) continue;
    for (const entry of entries) {
      const name = typeof entry === "string"
        ? entry
        : entry && typeof entry === "object" && typeof entry.source === "string"
          ? entry.source
          : undefined;
      if (name) check(`services.${serviceName}.${kind}`, kind === "configs" ? "config" : "secret", name);
    }
  }

  for (const name of collectBuildSecretReferences(service)) {
    check(`services.${serviceName}.build.secrets`, "secret", name);
  }
}
