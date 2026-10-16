import type { ComposeService } from "./types.js";
export type ComposeCondition = "service_started" | "service_healthy" | "service_completed_successfully";
export function normalizeComposeDependsOn(value: unknown): Record<string, { condition: ComposeCondition; restart?: boolean; required?: boolean }> {
  const entries = Array.isArray(value) ? value.filter((item):item is string => typeof item === "string").map(name => [name, { condition: "service_started" }] as const) : value && typeof value === "object" ? Object.entries(value as Record<string,unknown>) : [];
  return Object.fromEntries(entries.map(([name,raw]) => [name, raw && typeof raw === "object" && !Array.isArray(raw) ? { condition: "service_started", ...raw } : { condition: "service_started" }]));
}
export function addComposeCondition(service: ComposeService, target: string, condition: ComposeCondition): void {
  service.depends_on = { ...normalizeComposeDependsOn(service.depends_on), [target]: { condition } };
}
