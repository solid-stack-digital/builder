import { ScriptError } from "../errors/ScriptError.js";
import type { BuildDependency } from "../types/index.js";

export interface ParsedPortMapping {
  raw: string;
  hostPort: number;
  containerPort: number;
}

const EXPLICIT_PORT_MAPPING = /^([1-9]\d{0,4}):([1-9]\d{0,4})$/;

function assertValidPort(port: number, label: string): void {
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new ScriptError(`${label} must be between 1 and 65535.`);
  }
}

export function parseExplicitPortMapping(
  value: string,
  context = "Dependency port"
): ParsedPortMapping {
  const match = EXPLICIT_PORT_MAPPING.exec(value.trim());
  if (!match) {
    throw new ScriptError(`${context} "${value}" must use "HOST_PORT:CONTAINER_PORT".`);
  }
  const hostPort = Number(match[1]);
  const containerPort = Number(match[2]);
  assertValidPort(hostPort, `${context} host port`);
  assertValidPort(containerPort, `${context} container port`);
  return { raw: `${hostPort}:${containerPort}`, hostPort, containerPort };
}

export function normalizePrimaryDependencyPort(
  value: number | string,
  context = "Dependency port"
): ParsedPortMapping {
  if (typeof value === "number") {
    assertValidPort(value, `${context} host port`);
    return { raw: `${value}:3000`, hostPort: value, containerPort: 3000 };
  }
  const trimmed = value.trim();
  if (/^[1-9]\d{0,4}$/.test(trimmed)) {
    const hostPort = Number(trimmed);
    assertValidPort(hostPort, `${context} host port`);
    return { raw: `${hostPort}:3000`, hostPort, containerPort: 3000 };
  }
  return parseExplicitPortMapping(trimmed, context);
}

export function getDependencyPortMappings(
  dependency: Pick<BuildDependency, "port" | "ports">,
  context = "Dependency"
): ParsedPortMapping[] {
  const mappings: ParsedPortMapping[] = [];
  if (dependency.port !== undefined) {
    mappings.push(normalizePrimaryDependencyPort(dependency.port, `${context} primary port`));
  }
  for (const value of dependency.ports ?? []) {
    mappings.push(parseExplicitPortMapping(value, `${context} auxiliary port`));
  }
  return [...new Map(mappings.map((mapping) => [mapping.raw, mapping])).values()];
}
