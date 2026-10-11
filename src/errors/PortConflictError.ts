import { ConfigError } from "./ConfigError.js";
export class PortConflictError extends ConfigError {
  readonly port: number; readonly firstOwner: string; readonly secondOwner: string;
  constructor(port: number, firstOwner: string, secondOwner: string, stage: string) {
    super({ sourceFile: "Builder effective composition", configPath: "publicPort", value: port, stage, reason: `Host port ${port} is claimed by both ${firstOwner} and ${secondOwner}. Builder does not remap fixed public ports.` });
    this.name = "PortConflictError"; this.port = port; this.firstOwner = firstOwner; this.secondOwner = secondOwner;
  }
}
