import fs from "node:fs";
import { ConfigError } from "../../errors/ConfigError.js";

export const EXEC_MODE_KEY = "EXEC_MODE" as const;
export const INFRA_MODE_KEY = "INFRA_MODE" as const;
export const PORT_KEY = "PORT" as const;
export interface BuilderEnvContext { sourceFile:string;configPath:string;stage:string;composition:"service"|"mesh"; }

export function assertNoBuilderOwnedEnvKeys(env:Record<string,unknown>,keys:readonly string[],context:BuilderEnvContext):void{
 for(const key of keys){if(!(key in env))continue;throw new ConfigError({sourceFile:context.sourceFile,configPath:`${context.configPath}.${key}`,stage:context.stage,composition:context.composition,value:env[key],reason:`User-controlled environment cannot set Builder-owned key "${key}"`});}
}

export function assertDotenvDoesNotDefineKeys(filePath:string,keys:readonly string[],context:Omit<BuilderEnvContext,"sourceFile">):void{
 if(!fs.existsSync(filePath))return;const forbidden=new Set(keys),lines=fs.readFileSync(filePath,"utf8").split(/\r?\n/);
 for(let index=0;index<lines.length;index+=1){const match=/^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*[:=]/.exec(lines[index]!);if(!match)continue;const key=match[1]!;if(!forbidden.has(key))continue;throw new ConfigError({sourceFile:filePath,configPath:`${context.configPath}.${key}`,stage:context.stage,composition:context.composition,value:`line ${index+1}`,reason:`Environment file cannot set Builder-owned key "${key}"`});}
}
