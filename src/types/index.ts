export type Environment = "dev" | "test" | "prod" | "e2e";
export type ExecutionMode = "dev" | "test" | "prod";
export type InfraMode = "isolated" | "integrated";
export const SERVICE_STAGES = ["dev", "prod", "test", "test-unit", "test-e2e"] as const;
export type ServiceStage = (typeof SERVICE_STAGES)[number];
export type Env = Record<string, string>;
export type PublicPort = number | "AUTO";
export type RequisiteKind = "requirement" | "dependency" | "prerequisite";
export type Requisites = Record<string, RequisiteKind>;
export type RequisiteOverlay = Record<string, RequisiteKind | false>;
export interface MainEndpoint { port: number; publicPort?: PublicPort; primary?: boolean; scheme?: string }
export interface ServiceEndpoint extends MainEndpoint { service: string }
export interface MainService { env?: Env; endpoints?: Record<string, MainEndpoint>; requisites?: Requisites; "override-compose"?: string }
export interface TesterService { compose: string; service: string; env?: Env }
export interface OrdinaryService { compose: string; service?: string; env?: Env; endpoints?: Record<string, ServiceEndpoint>; requisites?: Requisites }
export interface MainOverlay { env?: Env; endpoints?: Record<string, Partial<MainEndpoint>>; requisites?: RequisiteOverlay; "override-compose"?: string }
export interface TesterOverlay { compose?: string; service?: string; env?: Env }
export interface OrdinaryOverlay { compose?: string; service?: string; env?: Env; endpoints?: Record<string, Partial<ServiceEndpoint>>; requisites?: RequisiteOverlay }
export interface BuildStage { services?: Record<string, MainOverlay | TesterOverlay | OrdinaryOverlay> }
export interface BuildJson {
  $schema?: string; name: string;
  services: Record<string, MainService | TesterService | OrdinaryService> & { main: MainService; tester: TesterService };
  dev?: BuildStage; prod?: BuildStage; test?: BuildStage; e2e?: BuildStage;
}
export interface ServiceUpOptions { projectDir?: string; debug?: boolean; detach?: boolean; dryRun?: boolean; skipChecks?: boolean; silenceWarnings?: boolean; full?: boolean }
export interface ServiceDownOptions { projectDir?: string; volumes?: boolean; debug?: boolean }
export const isMainEntry = (name: string): name is "main" => name === "main";
export const isTesterEntry = (name: string): name is "tester" => name === "tester";
