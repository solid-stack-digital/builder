import fs from "node:fs";
import { afterEach,describe,expect,it } from "vitest";
import { deriveProjectName } from "../../../src/utils/projectName.js";
import { teardownCompose } from "../../../src/core/teardownCompose.js";
import { runTest } from "../../../src/core/runners/runTest.js";
import { dockerFixture,statusByProject,write,type DockerFixture } from "./support.js";
let current:DockerFixture|undefined;
afterEach(async()=>{if(!current)return;for(const stage of ["test","e2e"]){const projectName=deriveProjectName(current.name,stage);const leftovers=statusByProject(projectName);if([...leftovers.containers,...leftovers.networks,...leftovers.volumes].length)await teardownCompose("",current.root,{projectName,removeVolumes:true,silent:true});}current=undefined;});
describe("real V3 standalone graph",()=>{
 it("[DOC01] unit cleanup then complete E2E barrier and selected runner",async()=>{
  const f=current=dockerFixture("doc01");
  const build={name:f.name,services:{main:{endpoints:{http:{port:3100,publicPort:"AUTO",primary:true,scheme:"http"}},requisites:{db:"dependency",migration:"prerequisite",mail:"requirement"},env:{ROLE:"main",NONCE:f.nonce,MARKER_DIR:"/markers",READY_AFTER:"completed-migration.json"},"override-compose":"override.yml"},db:{compose:"db.yml",endpoints:{data:{service:"db",port:5432,primary:true,scheme:"http"}}},migration:{compose:"migration.yml",service:"migrate",requisites:{db:"dependency"},env:{WAIT_URL:"${db.endpoints.data.network_url}/health"}},mail:{compose:"mail.yml",endpoints:{http:{service:"mail",port:8025,publicPort:"AUTO",primary:true,scheme:"http"}}},tester:{compose:"e2e/tester.yml",service:"runner",env:{CHECK_URLS:"${main.endpoints.http.public_url}/health,${mail.endpoints.http.public_url}/health"}}}};
  write(f,"build.json",JSON.stringify(build));
  write(f,"override.yml",'services:\n  main:\n    volumes:\n      - ./markers:/markers\n      - scratch:/scratch\nvolumes:\n  scratch: {}\n');
  write(f,"db.yml",`services:\n  db:\n    image: ${f.image}\n    command: ["python", "/runtime/serve.py"]\n    environment:\n      ROLE: db\n      PORT: "5432"\n      NONCE: ${f.nonce}\n      MARKER_DIR: /markers\n    volumes: ["./markers:/markers"]\n    healthcheck:\n      test: ["CMD", "python", "-c", "import urllib.request; urllib.request.urlopen('http://127.0.0.1:5432/health',timeout=1)"]\n      interval: 1s\n      timeout: 1s\n      retries: 3\n`);
  write(f,"migration.yml",`services:\n  migrate:\n    image: ${f.image}\n    command: ["python", "/runtime/job.py"]\n    environment:\n      ROLE: migration\n      NONCE: ${f.nonce}\n      MARKER_DIR: /markers\n    volumes: ["./markers:/markers"]\n`);
  write(f,"mail.yml",`services:\n  mail:\n    image: ${f.image}\n    command: ["python", "/runtime/serve.py"]\n    environment:\n      ROLE: mail\n      PORT: "8025"\n      NONCE: ${f.nonce}\n      MARKER_DIR: /markers\n      READY_AFTER: started-main.json\n    volumes: ["./markers:/markers"]\n    healthcheck:\n      test: ["CMD", "python", "-c", "import urllib.request; urllib.request.urlopen('http://127.0.0.1:8025/health',timeout=1)"]\n      interval: 1s\n      timeout: 1s\n      retries: 3\n`);
  write(f,"e2e/tester.yml",`services:\n  runner:\n    image: ${f.image}\n    command: ["python", "/runtime/runner.py"]\n    network_mode: host\n    environment:\n      NONCE: ${f.nonce}\n      MARKER_DIR: /markers\n      REQUIRED_MARKERS: unit-completed.json,completed-migration.json,started-main.json,started-mail.json\n    volumes: ["../markers:/markers"]\n`);
  write(f,".env.e2e","APP_MARKER='app$quote\"'\n");write(f,".env.e2e-tester","TESTER_MARKER='tester$quote\"'\n");
  const status=await runTest({projectDir:f.root,debug:false,detach:false});expect(status).toBe(0);
  for(const marker of ["unit-completed.json","completed-migration.json","started-main.json","started-mail.json","tester-started.json","tester-completed.json"])expect(fs.existsSync(`${f.markers}/${marker}`),marker).toBe(true);
  for(const stage of ["test","e2e"])expect(statusByProject(deriveProjectName(f.name,stage))).toEqual({containers:[],networks:[],volumes:[]});
 },30000);
});
