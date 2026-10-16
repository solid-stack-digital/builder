import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { stringify } from "yaml";
import { describe, expect, it } from "vitest";
import { compileServiceComposition } from "../../../src/core/composition/compileServiceComposition.js";
import { basicBuild } from "../support/fixtures.js";
import { dockerFixture, write } from "./support.js";

describe("real Docker build arguments",()=>{
  it("[BAR25] passes effective buildArgs through Compose to Dockerfile ARG",()=>{
    const f=dockerFixture("bar25"),build=basicBuild();build.name=f.name;
    build.services.main.buildArgs={BUILD_FEATURE_FLAG:"v3.1-verified"};
    write(f,"build.json",JSON.stringify(build));
    write(f,"Dockerfile",`FROM ${f.image} AS dev\nARG BUILD_FEATURE_FLAG\nRUN test "$BUILD_FEATURE_FLAG" = "v3.1-verified"\nCMD ["python", "/runtime/serve.py"]\nHEALTHCHECK CMD true\nFROM dev AS test\nFROM dev AS prod\n`);
    const compiled=compileServiceComposition("prod",f.root,{validationMode:true});
    const composeFile=path.join(f.root,"compiled.yml");fs.writeFileSync(composeFile,stringify(compiled.compose));
    const imageName=`${compiled.projectName}-main`;
    try{
      const result=spawnSync("docker",["compose","-f",composeFile,"build","main"],{cwd:f.root,encoding:"utf8",timeout:90_000});
      expect(result.status,`${result.stdout}\n${result.stderr}`).toBe(0);
      const inspect=spawnSync("docker",["image","inspect",imageName,"--format","{{.Id}}"],{encoding:"utf8"});
      expect(inspect.status,inspect.stderr).toBe(0);
    }finally{spawnSync("docker",["image","rm","-f",imageName],{encoding:"utf8"});}
  },120_000);
});
