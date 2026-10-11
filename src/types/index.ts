export type Environment = "dev" | "test" | "e2e" | "prod";

export const SERVICE_STAGES = ["dev", "prod", "test", "test-unit", "test-e2e"] as const;
export type ServiceStage = (typeof SERVICE_STAGES)[number];
export type PublicPort = number | "AUTO";

export interface AppEndpoint { port: number; publicPort?: PublicPort; primary?: boolean; scheme?: string; }
export interface DependencyEndpoint extends AppEndpoint { service: string; }
export interface AppConfig { env?: Record<string, string>; endpoints?: Record<string, AppEndpoint>; }
export interface DependencyConfig { compose: string; env?: Record<string, string>; endpoints?: Record<string, DependencyEndpoint>; dependsOn?: string[]; }
export interface TesterConfig { env?: Record<string, string>; }
export interface AppStageConfig { env?: Record<string, string>; endpoints?: Record<string, Partial<AppEndpoint>>; }
export interface DependencyStageConfig { compose?: string; env?: Record<string, string>; endpoints?: Record<string, Partial<DependencyEndpoint>>; dependsOn?: string[]; }
export interface BuildStageConfig { "override-compose"?: string; app?: AppStageConfig; dependencies?: Record<string, DependencyStageConfig>; }
export interface BuildJson { $schema?: string; name?: string; dockerfile?: string; app: AppConfig; dependencies?: Record<string, DependencyConfig>; tester?: TesterConfig; dev?: BuildStageConfig; prod?: BuildStageConfig; test?: BuildStageConfig; e2e?: BuildStageConfig; }
export interface ServiceUpOptions { projectDir?: string; debug?: boolean; detach?: boolean; dryRun?: boolean; skipChecks?: boolean; silenceWarnings?: boolean; full?: boolean; }
export interface ServiceDownOptions { projectDir?: string; volumes?: boolean; debug?: boolean; }
