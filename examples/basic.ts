import { Container } from "@solid-stack/di";
import {
  GreeterService,
  GreeterConfigToken,
  formatGreeting,
} from "../src/index.js";

// 1. Pure utility usage
const directGreeting = formatGreeting("Direct User", { prefix: "⚡" });
console.log("[Direct Util]:", directGreeting);

// 2. DI Container resolution
const container = new Container();

// Configure the ValueToken
container.provideValue(GreeterConfigToken, {
  prefix: "🚀",
  suffix: "Welcome to the Solid Stack ecosystem!",
});

// Resolve the service
const greeter = container.resolve(GreeterService);
const result = greeter.greet("Open Source Developer");

console.log("[Service Result]:", result.message);
console.log("[Timestamp]:", result.timestamp.toISOString());
