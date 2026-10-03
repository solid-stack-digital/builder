export type Environment = "dev" | "test" | "e2e" | "prod";

export const SERVICE_STAGES = [
  "dev",
  "prod",
  "test",
  "test-unit",
  "test-e2e",
] as const;

export type ServiceStage = (typeof SERVICE_STAGES)[number];

export type BuildDependency = {
  path: string;
  name: string;
  serviceName?: string | undefined;
  port?: number | string | undefined;
};

export type BuildOverride = {
  path: string;
};

export interface BuildPolicyConfig {
  dockerfile?: string | undefined;
  compose?: string | undefined;
}

export type BuildJson = {
  $schema?: string | undefined;
  name?: string | undefined;
  dockerfile?: string | undefined;
  port?: number | string | undefined;
  policy?: BuildPolicyConfig | undefined;
  policies?: BuildPolicyConfig | undefined;
  composeFiles?: string[] | undefined;
  dependencies?: Record<string, { path: string; service?: string | undefined; port?: number | string | undefined }> | undefined;
  overrides?: Record<string, { path: string }> | undefined;
  services?: Record<string, any> | undefined;
  envOverrides?: Record<string, string> | undefined;
  tester?:
    | {
        envOverrides?: Record<string, string> | undefined;
      }
    | undefined;
};

export interface ServiceUpOptions {
  projectDir?: string | undefined;
  debug?: boolean | undefined;
  detach?: boolean | undefined;
  dryRun?: boolean | undefined;
  skipChecks?: boolean | undefined;
  silenceWarnings?: boolean | undefined;
}

export interface ServiceDownOptions {
  projectDir?: string | undefined;
  volumes?: boolean | undefined;
  debug?: boolean | undefined;
}
