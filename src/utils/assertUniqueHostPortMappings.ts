import { parse } from "yaml";
import { ScriptError } from "../errors/ScriptError.js";
import { parsePublishedHostPort } from "./composePublishedPort.js";

/** Check static Compose host-port claims independently of occupied OS ports. */
export function assertUniqueHostPortMappings(yamlConfig: string): void {
  const parsed = parse(yamlConfig);
  const owners = new Map<number, string>();
  for (const [serviceName, service] of Object.entries(parsed?.services ?? {})) {
    for (const port of (service as { ports?: unknown[] })?.ports ?? []) {
      const hostPort = parsePublishedHostPort(port);
      if (hostPort === undefined) continue;
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
