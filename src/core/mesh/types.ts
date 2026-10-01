export interface MeshServiceConfig {
  path: string;
  port?: number | string;
  provideDependency?: Record<string, string>;
  replaceMocks?: Record<string, string>;
  envOverrides?: Record<string, string>;
}

export interface MeshTesterConfig {
  path: string;
  compose?: string;
  dockerfile?: string;
  policy?: {
    dockerfile?: string;
    compose?: string;
  };
}

export interface MeshConfig {
  name?: string;
  services: Record<string, MeshServiceConfig>;
  dependencies?: Record<string, { path: string; service: string }>;
  tester?: MeshTesterConfig;
  [key: string]: any;
}

export interface MeshUpOptions {
  projectDir?: string;
  debug?: boolean;
  detach?: boolean;
}

export type MeshStage = "dev" | "prod" | "test" | "test-unit" | "test-e2e";
