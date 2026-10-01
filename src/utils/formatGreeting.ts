import type { GreeterConfig } from "../types/index.js";

/**
 * Pure utility function to format a greeting message with optional prefix and suffix.
 */
export function formatGreeting(
  name: string,
  config: GreeterConfig = {},
): string {
  const prefix = config.prefix ? `${config.prefix.trim()} ` : "";
  const suffix = config.suffix ? ` ${config.suffix.trim()}` : "";
  return `${prefix}Hello, ${name.trim()}!${suffix}`;
}
