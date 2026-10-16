import { ConfigError } from "../../errors/ConfigError.js";
import type { ComposeService, ComposeEnvironmentMap } from "./types.js";
export function normalizeComposeEnvironment(value:unknown,context:string):ComposeEnvironmentMap{
 const result:ComposeEnvironmentMap={}; if(value==null)return result;
 if(Array.isArray(value)){for(const item of value){if(typeof item!=="string")throw new ConfigError({configPath:context,value:item,reason:"Compose environment entries must be strings"});const at=item.indexOf("=");if(at<0){result[item]=null;continue;}result[item.slice(0,at)]=item.slice(at+1);}return result;}
 if(typeof value!=="object")throw new ConfigError({configPath:context,value,reason:"Compose environment must be a map or list"});
 for(const [key,val] of Object.entries(value)){if(val===null||val===undefined){result[key]=null;continue;} if(typeof val==="object")throw new ConfigError({configPath:`${context}.${key}`,value:val,reason:"Compose environment value must be scalar"});result[key]=String(val);}return result;
}
export function mergeComposeEnvironment(service:ComposeService,overlay:Record<string,string>):void{service.environment={...normalizeComposeEnvironment(service.environment,"service.environment"),...overlay};}
export function normalizeComposeBuildArgs(value:unknown,context:string,sourceFile?:string):Record<string,string>{
 const result:Record<string,string>={};if(value==null)return result;
 const fail=(configPath:string,reason:string,item:unknown):never=>{throw new ConfigError({...sourceFile?{sourceFile}:{},configPath,value:item,reason});};
 if(Array.isArray(value)){for(const item of value){if(typeof item!=="string")fail(context,"Compose build arg entries must be strings",item);const at=item.indexOf("=");const key=at<0?item:item.slice(0,at);if(!key)fail(context,"Compose build arg key must not be empty",item);result[key]=at<0?"":item.slice(at+1);}return result;}
 if(typeof value!=="object")fail(context,"Compose build args must be a map or list",value);
 for(const [key,val] of Object.entries(value)){if(!key)fail(context,"Compose build arg key must not be empty",key);if(val===null||val===undefined){result[key]="";continue;}if(typeof val==="object")fail(`${context}.${key}`,"Compose build arg value must be scalar",val);result[key]=String(val);}
 return result;
}
