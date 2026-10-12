/** Keep external lookups stable while letting Compose scope owned resources by project. */
export function namespaceResourceDefinition(
  originalKey: string,
  definition: unknown,
): unknown {
  if (definition === null || typeof definition !== "object" || Array.isArray(definition)) {
    return definition;
  }

  const result = structuredClone(definition) as Record<string, unknown>;
  if (result.external === true) {
    result.name ??= originalKey;
  } else {
    delete result.name;
  }
  return result;
}
