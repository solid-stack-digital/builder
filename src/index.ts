/**
 * @solid-stack/ts-jspackage-template
 *
 * A modern TypeScript package starter template powered by @solid-stack/di.
 */

// 1. Core Services & Implementations
export { GreeterService } from "./core/index.js";

// 2. Public Types & DI Tokens
export {
  GreeterConfigToken,
  type GreeterConfig,
  type GreetResult,
} from "./types/index.js";

// 3. Helper Utilities
export { formatGreeting } from "./utils/index.js";
