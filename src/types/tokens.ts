import { ValueToken } from "@solid-stack/di";

export interface GreeterConfig {
  /** Prefix to prepend to greeting message (e.g. "🚀") */
  prefix?: string;
  /** Suffix to append to greeting message (e.g. "Have a great day!") */
  suffix?: string;
}

export interface GreetResult {
  /** Full greeting message text */
  message: string;
  /** Timestamp when greeting was generated */
  timestamp: Date;
}

export class GreeterConfigToken extends ValueToken<GreeterConfig> {}
