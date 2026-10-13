export interface MeshTesterConfig { compose: string; service: string; env?: Record<string, string>; }
export interface MeshServiceConfig { path: string; env?: Record<string, string>; dependencies?: Record<string, string>; dependsOn?: string[]; publish?: string[]; }
export interface MeshServiceStageOverlay { path?: string; env?: Record<string, string>; dependencies?: Record<string, string>; dependsOn?: string[]; publish?: string[]; }
export interface MeshStageConfig { services?: Record<string, MeshServiceStageOverlay>; }
export interface MeshConfig { $schema?: string; name?: string; tester?: MeshTesterConfig; services: Record<string, MeshServiceConfig>; dev?: MeshStageConfig; prod?: MeshStageConfig; e2e?: MeshStageConfig; }
export const MESH_CONFIG_STAGES = ["dev", "prod", "e2e"] as const;
export type MeshConfigStage = (typeof MESH_CONFIG_STAGES)[number];
export type MeshCompositionStage = MeshConfigStage;
export const MESH_COMMAND_STAGES = ["dev", "prod", "test", "test-e2e"] as const;
export type MeshCommandStage = (typeof MESH_COMMAND_STAGES)[number];
export interface MeshUpOptions { projectDir?: string; debug?: boolean; detach?: boolean; dryRun?: boolean; skipChecks?: boolean; }
