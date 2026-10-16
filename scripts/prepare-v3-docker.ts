import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
const source=path.resolve("tests/docker-acceptance/v3-runtime"),files=["Dockerfile","serve.py","job.py","runner.py","unit.py"];
const hash=createHash("sha256");for(const file of files)hash.update(fs.readFileSync(path.join(source,file)));
const tag=`builder-v3-test-runtime:${hash.digest("hex").slice(0,16)}`;
const existing=spawnSync("docker",["image","inspect",tag,"--format","{{.Id}}"],{encoding:"utf8"});
if(existing.status!==0){const built=spawnSync("docker",["build","--pull","-t",tag,source],{stdio:"inherit"});if(built.status!==0)process.exit(built.status??1);}
const inspected=spawnSync("docker",["image","inspect",tag,"--format","{{.Id}}"],{encoding:"utf8"});if(inspected.status!==0)process.exit(inspected.status??1);
fs.mkdirSync(".builder",{recursive:true});fs.writeFileSync(".builder/test-images.json",JSON.stringify({tag,imageId:inspected.stdout.trim(),files},null,2)+"\n");
console.log(`${tag} ${inspected.stdout.trim()}`);
