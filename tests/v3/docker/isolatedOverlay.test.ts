import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { stringify } from "yaml";
import { afterEach, describe, expect, it } from "vitest";
import { compileServiceComposition } from "../../../src/core/composition/compileServiceComposition.js";
import { runTestUnit } from "../../../src/core/runners/runTestUnit.js";
import { teardownCompose } from "../../../src/core/teardownCompose.js";
import { deriveProjectName } from "../../../src/utils/projectName.js";
import { dockerFixture, statusByProject, write, type DockerFixture } from "./support.js";

const KEY="on-inframode-isolated";
let current:DockerFixture|undefined;
afterEach(async()=>{if(!current)return;for(const stage of ["dev","test"]){const projectName=deriveProjectName(current.name,stage);const leftovers=statusByProject(projectName);if([...leftovers.containers,...leftovers.networks,...leftovers.volumes].length)await teardownCompose("",current.root,{projectName,removeVolumes:true,silent:true});}current=undefined;});
function isolatedFixture(label:string,stage:"dev"|"test",mainEnv:Record<string,string>={}):DockerFixture{
  const f=current=dockerFixture(label);
  const build={name:f.name,services:{
    main:{endpoints:{http:{port:3100,primary:true,scheme:"http"}},env:{ROLE:"main",NONCE:f.nonce,MARKER_DIR:"/markers"},"override-compose":"override.yml"},
    devstore:{compose:"devstore.yml",endpoints:{http:{service:"devstore",port:3002,primary:true,scheme:"http"}}},
    tester:{compose:"e2e/tester.yml",service:"runner"}},
    [stage]:{[KEY]:{services:{main:{requisites:{devstore:"dependency"},env:{CHECK_INTERNAL_URL:"${devstore.endpoints.http.network_url}/health",...mainEnv}}}}}};
  write(f,"build.json",JSON.stringify(build));
  write(f,"override.yml","services:\n  main:\n    volumes:\n      - ./markers:/markers\n");
  write(f,"devstore.yml",`services:\n  devstore:\n    image: ${f.image}\n    command: ["python", "/runtime/serve.py"]\n    environment:\n      ROLE: devstore\n      PORT: "3002"\n      NONCE: ${f.nonce}\n      MARKER_DIR: /markers\n    volumes: ["./markers:/markers"]\n    healthcheck:\n      test: ["CMD", "python", "-c", "import urllib.request; urllib.request.urlopen('http://127.0.0.1:3002/health',timeout=1)"]\n      interval: 1s\n      timeout: 1s\n      retries: 15\n`);
  write(f,"e2e/tester.yml",`services:\n  runner:\n    image: ${f.image}\n    command: ["python", "/runtime/runner.py"]\n`);
  return f;
}
describe("real V3.2 isolated overlay",()=>{
  it("[ISO23] isolated dev starts the block module healthy before main and main reaches it",()=>{
    const f=isolatedFixture("iso23","dev");
    const compiled=compileServiceComposition("dev",f.root,{validationMode:true});
    const file=path.join(f.root,"compiled.yml");fs.writeFileSync(file,stringify(compiled.compose));
    const compose=(...args:string[])=>spawnSync("docker",["compose","--project-directory",f.root,"-f",file,...args],{cwd:f.root,encoding:"utf8",timeout:90_000});
    try{
      const up=compose("up","--build","--detach","--wait","main");expect(up.status,`${up.stdout}\n${up.stderr}`).toBe(0);
      for(const marker of ["started-devstore.json","internal-main.json"])expect(fs.existsSync(path.join(f.markers,marker)),marker).toBe(true);
      expect(compose("exec","-T","main","printenv","INFRA_MODE").stdout.trim()).toBe("isolated");
    }finally{compose("down","--volumes","--remove-orphans");}
    expect(statusByProject(compiled.projectName)).toEqual({containers:[],networks:[],volumes:[]});
  },120_000);
  it("[ISO24] test-unit with a block module exits 0 and removes every resource",async()=>{
    const f=isolatedFixture("iso24","test");
    expect(await runTestUnit({projectDir:f.root,debug:false,detach:false})).toBe(0);
    for(const marker of ["started-devstore.json","unit-completed.json"])expect(fs.existsSync(path.join(f.markers,marker)),marker).toBe(true);
    expect(statusByProject(deriveProjectName(f.name,"test"))).toEqual({containers:[],networks:[],volumes:[]});
  },120_000);
  it("[ISO25] test-unit with a block module propagates main's exit status",async()=>{
    const f=isolatedFixture("iso25","test",{EXIT_STATUS:"7"});
    expect(await runTestUnit({projectDir:f.root,debug:false,detach:false})).toBe(7);
    expect(statusByProject(deriveProjectName(f.name,"test"))).toEqual({containers:[],networks:[],volumes:[]});
  },120_000);
});
