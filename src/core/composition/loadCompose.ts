import { existsSync, readFileSync, statSync } from "node:fs";
import { parse, parseAllDocuments } from "yaml";
import { ConfigError } from "../../errors/ConfigError.js";
import type { ComposeDocument } from "./types.js";
export function loadComposeDocument(absolutePath:string, context:{sourceFile:string;configPath:string;stage:string;composition:"service"|"mesh"}):ComposeDocument {
 const fail=(reason:string,value?:unknown):never=>{throw new ConfigError({...context,sourceFile:absolutePath,...(value===undefined?{}:{value}),reason});};
 if(!existsSync(absolutePath)||!statSync(absolutePath).isFile()) fail("Compose file does not exist or is not a regular file");
 let text=""; try{text=readFileSync(absolutePath,"utf8")}catch(e){fail(`Failed to read Compose file: ${String(e)}`)}
 let docs:ReturnType<typeof parseAllDocuments>=[]; try{docs=parseAllDocuments(text,{prettyErrors:true});}catch(e){fail(`Invalid Compose YAML: ${String(e)}`)}
 if(docs.length!==1) fail("Compose file must contain exactly one YAML document");
 const errors=docs[0]!.errors; if(errors.length) fail(`Invalid Compose YAML: ${errors.map(e=>e.message).join("; ")}`);
 let parsed:unknown; try{parsed=parse(text)}catch(e){fail(`Invalid Compose YAML: ${String(e)}`)}
 if(!parsed||typeof parsed!=="object"||Array.isArray(parsed)) fail("Compose root must be an object");
 return parsed as ComposeDocument;
}
