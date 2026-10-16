import type { MainOverlay, OrdinaryOverlay, TesterOverlay, TesterService } from "../../types/index.js";
export interface MeshSourceService { source: string; extends?: Record<string, MainOverlay | TesterOverlay | OrdinaryOverlay>; publish?: string[] }
export interface MeshSourceOverlay { source?: string; extends?: Record<string, MainOverlay | TesterOverlay | OrdinaryOverlay>; publish?: string[] }
export interface MeshStage { services?: Record<string, MeshSourceOverlay | TesterOverlay> }
export interface MeshConfig {
  $schema?: string; name: string;
  services: Record<string, MeshSourceService | TesterService> & { tester: TesterService };
  dev?: MeshStage; prod?: MeshStage; e2e?: MeshStage;
}
export const MESH_CONFIG_STAGES = ["dev", "prod", "e2e"] as const;
export type MeshConfigStage = (typeof MESH_CONFIG_STAGES)[number];
export type MeshCompositionStage = MeshConfigStage;
export const MESH_COMMAND_STAGES = ["dev", "prod", "test"] as const;
export type MeshCommandStage = (typeof MESH_COMMAND_STAGES)[number];
export interface MeshUpOptions { projectDir?: string; debug?: boolean; detach?: boolean; dryRun?: boolean; skipChecks?: boolean }
export const isMeshSourceEntry = (name: string): boolean => name !== "tester";
