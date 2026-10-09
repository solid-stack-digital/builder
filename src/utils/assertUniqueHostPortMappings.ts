import { parse } from "yaml";
import { ScriptError } from "../errors/ScriptError.js";

/** Check static Compose host-port claims independently of occupied OS ports. */
export function assertUniqueHostPortMappings(yamlConfig: string): void {
  const parsed = parse(yamlConfig);
  const owners = new Map<number, string>();
  for (const [serviceName, service] of Object.entries(parsed?.services ?? {})) {
    for (const port of (service as { ports?: unknown[] })?.ports ?? []) {
      let hostPort: number | null = null;
      if (typeof port === "string") {
        const parts = port.split(":");
        // Compose short syntax: TARGET alone has no published host port.
        if (parts.length === 2) hostPort = Number(parts[0]);
        if (parts.length === 3) hostPort = Number(parts[1]);
      } else if (port && typeof port === "object" && "published" in port) {
        hostPort = Number(port.published);
      }
      if (!hostPort || !Number.isInteger(hostPort)) continue;
      const existing = owners.get(hostPort);
      if (existing) {
        throw new ScriptError(
          `Port Collision Detected: Host port ${hostPort} is requested by both "${existing}" and "${serviceName}".`
        );
      }
      owners.set(hostPort, serviceName);
    }
  }
}
