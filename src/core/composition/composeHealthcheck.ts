/** Endpoint readiness requires an enabled Compose command, not just a truthy test. */
export function isEnabledValidComposeHealthcheck(value: unknown): boolean {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const health = value as Record<string, unknown>;
  if (health.disable === true) return false;
  const test = health.test;
  if (typeof test === "string") return test.trim().length > 0 && !/^NONE$/i.test(test.trim());
  if (!Array.isArray(test) || !test.every(item => typeof item === "string")) return false;
  if (test[0] !== "CMD" && test[0] !== "CMD-SHELL") return false;
  return test.length >= 2 && test.slice(1).some(item => item.trim().length > 0);
}
