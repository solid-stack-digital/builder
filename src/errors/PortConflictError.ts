import { ConfigError } from "./ConfigError.js";
export class PortConflictError extends ConfigError {
  readonly port: number; readonly firstOwner: string; readonly secondOwner: string;
  constructor(port: number, firstOwner: string, secondOwner: string, stage: string, sourceFile = "Builder effective composition", composition?: "service" | "mesh") {
    super({ sourceFile, configPath: secondOwner, value: port, stage, ...(composition ? { composition } : {}), referencedObject: firstOwner, reason: `Host port ${port} is claimed by both ${firstOwner} and ${secondOwner}. Builder does not remap fixed public ports.` });
    this.name = "PortConflictError"; this.port = port; this.firstOwner = firstOwner; this.secondOwner = secondOwner;
  }
}
