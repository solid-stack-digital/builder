import fs from "node:fs";
/** Parse Compose-style dotenv values needed for Builder precedence selection. */
export function readDotenvValues(file:string):Record<string,string> {
 if(!fs.existsSync(file))return {};
 const source=fs.readFileSync(file,"utf8"),result:Record<string,string>={};
 let offset=0;
 while(offset<source.length){
  const start=offset;while(offset<source.length&&source[offset]!=="\n")offset++;let line=source.slice(start,offset).replace(/\r$/,"");offset++;
  const match=/^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*[:=]\s*(.*)$/.exec(line);
  if(!match)continue;
  const key=match[1]!;let value=match[2]!;
  if(value.startsWith("'")||value.startsWith('"')){
    const quote=value[0]!;value=value.slice(1);
    const closingQuote=():number=>{for(let index=0;index<value.length;index++){if(value[index]!==quote)continue;if(quote==="'")return index;let backslashes=0;for(let cursor=index-1;cursor>=0&&value[cursor]==="\\";cursor--)backslashes++;if(backslashes%2===0)return index;}return -1;};
    let end=closingQuote();
    while(end<0&&offset<source.length){const nextStart=offset;while(offset<source.length&&source[offset]!=="\n")offset++;value+="\n"+source.slice(nextStart,offset).replace(/\r$/,"");offset++;end=closingQuote();}
    if(end>=0)value=value.slice(0,end);
    if(quote==='"')value=value.replace(/\\([nrt"\\])/g,(_all,char:string)=>char==="n"?"\n":char==="r"?"\r":char==="t"?"\t":char);
  }else value=value.replace(/\s+#.*$/,"").trim();
  result[key]=value;
 }
 return result;
}
