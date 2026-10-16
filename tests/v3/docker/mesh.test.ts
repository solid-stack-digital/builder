import fs from "node:fs";
import { afterEach,describe,expect,it } from "vitest";
import { deriveProjectName } from "../../../src/utils/projectName.js";
import { teardownCompose } from "../../../src/core/teardownCompose.js";
import { runMeshTestE2e } from "../../../src/core/mesh/runners/runMeshTestE2e.js";
import { dockerFixture,statusByProject,write,type DockerFixture } from "./support.js";
let current:DockerFixture|undefined;
afterEach(async()=>{if(!current)return;const projectName=deriveProjectName(current.name,"e2e");const leftovers=statusByProject(projectName);if([...leftovers.containers,...leftovers.networks,...leftovers.volumes].length)await teardownCompose("",current.root,{projectName,removeVolumes:true,silent:true});current=undefined;});
describe("real V3 mesh graph",()=>{
 it("[DOC03] source rewrite, DNS, publication and runner exit 7",async()=>{
  const f=current=dockerFixture("doc03"),mount=`${f.markers}:/markers`;
  const dockerfile=fs.readFileSync(`${f.root}/Dockerfile`,"utf8");
  write(f,"backend/Dockerfile",dockerfile);write(f,"frontend/Dockerfile",dockerfile);
  const backend={name:`${f.name}-backend`,services:{main:{endpoints:{http:{port:3100,publicPort:"AUTO",primary:true,scheme:"http"}},requisites:{api:"requirement"},env:{ROLE:"backend",NONCE:f.nonce,MARKER_DIR:"/markers"},"override-compose":"override.yml"},api:{compose:"api.yml",endpoints:{http:{service:"api",port:3100,publicPort:"AUTO",primary:true,scheme:"http"}}},tester:{compose:"e2e/tester.yml",service:"runner",env:{POISON:"${missing.endpoints.http.network_url}"}}}};
  const frontend={name:`${f.name}-frontend`,services:{main:{endpoints:{http:{port:3100,publicPort:"AUTO",primary:true,scheme:"http"}},requisites:{backend:"dependency"},env:{ROLE:"frontend",NONCE:f.nonce,MARKER_DIR:"/markers"},"override-compose":"override.yml"},backend:{compose:"missing-local-backend.yml",service:"mock"},tester:{compose:"e2e/tester.yml",service:"runner"}}};
  write(f,"backend/build.json",JSON.stringify(backend));write(f,"frontend/build.json",JSON.stringify(frontend));
  write(f,"backend/override.yml",`services:\n  main:\n    volumes: ["${mount}"]\n`);write(f,"frontend/override.yml",`services:\n  main:\n    volumes: ["${mount}"]\n`);
  write(f,"backend/api.yml",`services:\n  helper:\n    image: ${f.image}\n    command: ["python", "/runtime/job.py"]\n    environment:\n      ROLE: helper\n      NONCE: ${f.nonce}\n      MARKER_DIR: /markers\n    volumes: ["${mount}"]\n  api:\n    image: ${f.image}\n    command: ["python", "/runtime/serve.py"]\n    depends_on:\n      helper:\n        condition: service_completed_successfully\n    environment:\n      ROLE: api\n      PORT: "3100"\n      NONCE: ${f.nonce}\n      MARKER_DIR: /markers\n    volumes: ["${mount}"]\n    healthcheck:\n      test: ["CMD", "python", "-c", "import urllib.request; urllib.request.urlopen('http://127.0.0.1:3100/health',timeout=1)"]\n      interval: 1s\n      timeout: 1s\n      retries: 3\n`);
  write(f,"tester.yml",`services:\n  runner:\n    image: ${f.image}\n    command: ["python", "/runtime/runner.py"]\n    network_mode: host\n    environment:\n      NONCE: ${f.nonce}\n      MARKER_DIR: /markers\n      REQUIRED_MARKERS: started-backend.json,started-frontend.json,started-api.json,completed-helper.json,internal-frontend.json\n      EXIT_STATUS: "7"\n    volumes: ["${mount}"]\n`);
  const mesh={name:f.name,services:{tester:{compose:"tester.yml",service:"runner",env:{CHECK_URLS:"${backend.source.main.endpoints.http.public_url}/health,${backend.source.api.endpoints.http.public_url}/health"}},backend:{source:"backend",publish:["main.endpoints.http","api.endpoints.http"],extends:{main:{requisites:{frontend:"requirement"}}}},frontend:{source:"frontend",extends:{main:{requisites:{"source.backend":false,backend:"requirement"},env:{CHECK_INTERNAL_URL:"${backend.source.main.endpoints.http.network_url}/health"}}}}}};
  write(f,"mesh.json",JSON.stringify(mesh));
  const status=await runMeshTestE2e({projectDir:f.root});expect(status).toBe(7);
  for(const marker of ["started-backend.json","started-frontend.json","started-api.json","completed-helper.json","internal-frontend.json","tester-completed.json"])expect(fs.existsSync(`${f.markers}/${marker}`),marker).toBe(true);
  expect(statusByProject(deriveProjectName(f.name,"e2e"))).toEqual({containers:[],networks:[],volumes:[]});
 },30000);
});
