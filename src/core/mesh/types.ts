export interface MeshServiceConfig {
  path: string;
  port?: number | string | undefined;
  provideDependency?: Record<string, string> | undefined;
  replaceMocks?: Record<string, string> | undefined;
  envOverrides?: Record<string, string> | undefined;
  healthcheck?: any | undefined;
}

export interface MeshTesterConfig {
  path: string;
  compose?: string | undefined;
  dockerfile?: string | undefined;
  policy?:
    | {
        dockerfile?: string | undefined;
        compose?: string | undefined;
      }
    | undefined;
}

export interface MeshConfig {
  name?: string | undefined;
  services: Record<string, MeshServiceConfig>;
  dependencies?: Record<string, { path: string; service?: string | undefined }> | undefined;
  tester?: MeshTesterConfig | undefined;
  [key: string]: any;
}

export interface MeshUpOptions {
  projectDir?: string | undefined;
  debug?: boolean | undefined;
  detach?: boolean | undefined;
  dryRun?: boolean | undefined;
  skipChecks?: boolean | undefined;
}

export const MESH_STAGES = [
  "dev",
  "prod",
  "test",
  "test-unit",
  "test-e2e",
] as const;

export type MeshStage = (typeof MESH_STAGES)[number];
