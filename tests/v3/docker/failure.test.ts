import fs from "node:fs";
import { afterEach,describe,expect,it } from "vitest";
import { deriveProjectName } from "../../../src/utils/projectName.js";
import { teardownCompose } from "../../../src/core/teardownCompose.js";
import { runTestE2e } from "../../../src/core/runners/runTestE2e.js";
import { dockerFixture,statusByProject,write,type DockerFixture } from "./support.js";
let current:DockerFixture|undefined;
afterEach(async()=>{if(!current)return;const projectName=deriveProjectName(current.name,"e2e");const leftovers=statusByProject(projectName);if([...leftovers.containers,...leftovers.networks,...leftovers.volumes].length)await teardownCompose("",current.root,{projectName,removeVolumes:true,silent:true});current=undefined;});
describe("real V3 failed prerequisite",()=>{
 it("[DOC02] exit 9 blocks main and tester, then strict cleanup removes owned resources",async()=>{
  const f=current=dockerFixture("doc02");
  const build={name:f.name,services:{main:{endpoints:{http:{port:3100,primary:true,scheme:"http"}},requisites:{job:"prerequisite"},env:{ROLE:"main",NONCE:f.nonce,MARKER_DIR:"/markers"},"override-compose":"override.yml"},job:{compose:"job.yml",service:"migrate"},tester:{compose:"e2e/tester.yml",service:"runner"}}};
  write(f,"build.json",JSON.stringify(build));
  write(f,"override.yml",'services:\n  main:\n    volumes: ["./markers:/markers"]\n');
  write(f,"job.yml",`services:\n  migrate:\n    image: ${f.image}\n    command: ["python", "/runtime/job.py"]\n    environment:\n      ROLE: migration\n      NONCE: ${f.nonce}\n      EXIT_STATUS: "9"\n      MARKER_DIR: /markers\n    volumes: ["./markers:/markers"]\n`);
  write(f,"e2e/tester.yml",`services:\n  runner:\n    image: ${f.image}\n    command: ["python", "/runtime/runner.py"]\n    network_mode: host\n    environment:\n      NONCE: ${f.nonce}\n      MARKER_DIR: /markers\n    volumes: ["../markers:/markers"]\n`);
  const status=await runTestE2e({projectDir:f.root,debug:false,detach:false});expect(status).not.toBe(0);
  expect(fs.existsSync(`${f.markers}/started-main.json`)).toBe(false);expect(fs.existsSync(`${f.markers}/tester-started.json`)).toBe(false);
  expect(statusByProject(deriveProjectName(f.name,"e2e"))).toEqual({containers:[],networks:[],volumes:[]});
 },30000);
});
