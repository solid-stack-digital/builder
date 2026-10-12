import { ConfigError } from "../../errors/ConfigError.js";
import type { ComposeService } from "./types.js";

function buildObject(service: ComposeService): Record<string, unknown> | undefined {
  return service.build && typeof service.build === "object" && !Array.isArray(service.build)
    ? service.build as Record<string, unknown> : undefined;
}

export function rewriteBuildSecretReferences(service: ComposeService, names: Map<string, string>): void {
  const build = buildObject(service);
  if (!build || !Array.isArray(build.secrets)) return;
  build.secrets = build.secrets.map(entry => {
    if (typeof entry === "string") return names.get(entry) ?? entry;
    if (entry && typeof entry === "object" && typeof entry.source === "string") {
      return { ...entry, source: names.get(entry.source) ?? entry.source };
    }
    return entry;
  });
}

export function collectBuildSecretReferences(service: ComposeService): string[] {
  const build = buildObject(service);
  if (!build || !Array.isArray(build.secrets)) return [];
  return build.secrets.flatMap(entry => {
    if (typeof entry === "string") return [entry];
    return entry && typeof entry === "object" && typeof entry.source === "string" ? [entry.source] : [];
  });
}

/** Service build contexts need build-order/closure semantics we do not support. */
export function assertNoServiceBuildContexts(service: ComposeService, configPath: string, sourceFile: string): void {
  const contexts = buildObject(service)?.additional_contexts;
  const values = Array.isArray(contexts)
    ? contexts.map(entry => typeof entry === "string" ? entry.slice(entry.indexOf("=") + 1) : entry)
    : contexts && typeof contexts === "object" ? Object.values(contexts) : [];
  if (values.some(value => typeof value === "string" && value.startsWith("service:"))) {
    throw new ConfigError({
      sourceFile,
      configPath: `${configPath}.build.additional_contexts`,
      reason: "Compose service-reference additional_contexts are unsupported",
    });
  }
}
