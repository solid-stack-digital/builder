import { isIP } from "node:net";

function validPort(value: string): number | undefined {
  if (!/^\d+$/.test(value)) return undefined;
  const port = Number(value);
  return Number.isInteger(port) && port >= 1 && port <= 65535
    ? port
    : undefined;
}

/** Returns a fixed published host port, when Compose syntax declares one. */
export function parsePublishedHostPort(value: unknown): number | undefined {
  if (value && typeof value === "object") {
    const published = (value as Record<string, unknown>).published;
    if (typeof published === "number" && Number.isInteger(published)) {
      return published >= 1 && published <= 65535 ? published : undefined;
    }
    if (typeof published === "string") return validPort(published);
    return undefined;
  }
  if (typeof value !== "string") return undefined;

  const mapping = value.replace(/\/(?:tcp|udp|sctp)$/i, "");
  if (/^\d+(?:-\d+)?$/.test(mapping)) return undefined;

  if (mapping.startsWith("[")) {
    const close = mapping.indexOf("]");
    if (close < 0 || isIP(mapping.slice(1, close)) !== 6) return undefined;
    const suffix = mapping.slice(close + 1);
    const match = suffix.match(/^:(\d+)(?:-\d+)?:\d+(?:-\d+)?$/);
    return match ? validPort(match[1]!) : undefined;
  }

  const parts = mapping.split(":");
  if (parts.length === 2) return validPort(parts[0]!);

  if (parts.length >= 3) {
    const hostIp = parts.slice(0, -2).join(":");
    if (isIP(hostIp) === 4) return validPort(parts[parts.length - 2]!);
  }

  return undefined;
}
