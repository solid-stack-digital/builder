import type { ComposeService } from "./types.js";

type PlainMap = Record<string, unknown>;

function isMap(value: unknown): value is PlainMap {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function mergeValue(inherited: unknown, overlay: unknown): unknown {
  if (overlay === undefined) return structuredClone(inherited);
  if (!isMap(inherited) || !isMap(overlay)) return structuredClone(overlay);

  return Object.fromEntries(
    [...new Set([...Object.keys(inherited), ...Object.keys(overlay)])].map((key) => [
      key,
      Object.hasOwn(overlay, key)
        ? mergeValue(inherited[key], overlay[key])
        : structuredClone(inherited[key]),
    ]),
  );
}

export function mergeMainOverride(
  inherited: ComposeService,
  overlay: ComposeService,
): ComposeService {
  return mergeValue(inherited, overlay) as ComposeService;
}
