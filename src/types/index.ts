export type Environment = "dev" | "test" | "e2e" | "prod";

export type BuildDependency = {
  path: string;
  name: string;
  serviceName: string;
};

export type BuildOverride = {
  path: string;
};

export type BuildJson = {
  name?: string;
  dependencies?: Record<string, { path: string; service: string }>;
  overrides?: Record<string, { path: string }>;
  services?: Record<string, any>;
  [key: string]: any;
};

export interface ServiceUpOptions {
  projectDir?: string;
  skipCheck?: boolean;
  debug?: boolean;
  detach?: boolean;
  dryRun?: boolean;
  unit?: boolean;
  e2e?: boolean;
}
