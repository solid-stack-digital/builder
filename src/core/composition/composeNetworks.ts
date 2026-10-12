export function normalizeNetworks(value: unknown): Record<string, unknown> {
 if (Array.isArray(value)) return Object.fromEntries(value.filter((name): name is string => typeof name === 'string').map(name => [name, null]));
 return value && typeof value === 'object' ? { ...value as Record<string, unknown> } : {};
}
