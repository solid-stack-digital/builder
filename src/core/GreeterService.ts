import { MakeInjectable, type DepsType } from "@solid-stack/di";
import { GreeterConfigToken, type GreetResult } from "../types/index.js";
import { formatGreeting } from "../utils/index.js";

@MakeInjectable
export class GreeterService {
  public static deps = {
    config: GreeterConfigToken,
  };

  constructor(public deps: DepsType<typeof GreeterService.deps>) {}

  /**
   * Generates a structured greeting response.
   */
  greet(name = "World"): GreetResult {
    const message = formatGreeting(name, this.deps.config);
    return {
      message,
      timestamp: new Date(),
    };
  }
}
