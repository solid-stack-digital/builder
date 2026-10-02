/**
 * Normalizes a service's depends_on declaration to the object syntax
 * so that subsequent additions/lookups do not corrupt array instances.
 */
export function normalizeDependsOn(service: any): void {
  if (!service || typeof service !== "object" || !service.depends_on) {
    return;
  }
  if (Array.isArray(service.depends_on)) {
    const obj: Record<string, { condition: string }> = {};
    for (const dep of service.depends_on) {
      if (typeof dep === "string") {
        obj[dep] = { condition: "service_started" };
      }
    }
    service.depends_on = obj;
  }
}
