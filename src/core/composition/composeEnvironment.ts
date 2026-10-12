import { ConfigError } from "../../errors/ConfigError.js";
import type { ComposeService, ComposeEnvironmentMap } from "./types.js";
export function normalizeComposeEnvironment(value:unknown,context:string):ComposeEnvironmentMap{
 const result:ComposeEnvironmentMap={}; if(value==null)return result;
 if(Array.isArray(value)){for(const item of value){if(typeof item!=="string")throw new ConfigError({configPath:context,value:item,reason:"Compose environment entries must be strings"});const at=item.indexOf("=");if(at<0){result[item]=null;continue;}result[item.slice(0,at)]=item.slice(at+1);}return result;}
 if(typeof value!=="object")throw new ConfigError({configPath:context,value,reason:"Compose environment must be a map or list"});
 for(const [key,val] of Object.entries(value)){if(val===null||val===undefined){result[key]=null;continue;} if(typeof val==="object")throw new ConfigError({configPath:`${context}.${key}`,value:val,reason:"Compose environment value must be scalar"});result[key]=String(val);}return result;
}
export function mergeComposeEnvironment(service:ComposeService,overlay:Record<string,string>):void{service.environment={...normalizeComposeEnvironment(service.environment,"service.environment"),...overlay};}
