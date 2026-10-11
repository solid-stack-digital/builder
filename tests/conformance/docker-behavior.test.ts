import { spawnSync } from "node:child_process";
import { afterEach, describe, expect, it } from "vitest";
import { compileMeshComposition } from "../../src/core/mesh/v2/compileMeshComposition.js";
import { cleanupFixtures } from "./fixture.js";
import { dockerCompose, dockerLog, down, emitCompose, runtimeMesh } from "./runtimeFixture.js";

afterEach(cleanupFixtures);
const endpoint = { compose: "d.yml", endpoints: { api: { service: "owner", port: 3000, primary: true, scheme: "http" } } };
const app = (env: Record<string, string> = {}, publicPort: number | "AUTO" | undefined = undefined) => ({ app: { env, endpoints: { http: { port: 3000, primary: true, scheme: "http", ...(publicPort === undefined ? {} : { publicPort }) } } } });
const docker = (args: string[]) => spawnSync("docker", args, { encoding: "utf8", timeout: 30000 });
function waitForLog(root: string, file: string, service: string, marker: string) {
  const until = Date.now() + 10000;
  while (Date.now() < until) {
    const logs = dockerLog(root, file, service);
    if (logs.includes(marker)) return logs;
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 200);
  }
  throw new Error(`Missing ${marker} in ${service}: ${dockerLog(root, file, service)}`);
}
function id(root: string, file: string, service: string) {
  return dockerCompose(root, file, ["ps", "-q", service]).stdout.trim();
}

describe("Docker behavior behind V2 compiler contracts", () => {
  it("isolates same-named dependency volumes and propagates env to every bundle service", () => {
    const command = `const fs=require('fs'),http=require('http');fs.writeFileSync('/data/id',process.env.INSTANCE);fs.writeFileSync('/tmp/ready','yes');http.createServer((q,r)=>r.end('ok')).listen(3000);`;
    const depBundle = { services: { owner: { image: "node:22-alpine", command: ["node", "-e", command], volumes: ["data:/data"], healthcheck: { test: ["CMD-SHELL", "test -f /tmp/ready"], interval: "500ms", timeout: "1s", retries: 10 } }, helper: { image: "node:22-alpine", command: ["node", "-e", "setInterval(()=>{},1000)"], volumes: ["data:/data"] } }, volumes: { data: {} } };
    const names = ["a", "b"];
    const root = runtimeMesh({ services: { a: { path: "a" }, b: { path: "b" } } }, Object.fromEntries(names.map(name => [name, { ...app({ PROBE_URL: "${dependencies.db.endpoints.api.network_url}" }), dependencies: { db: { ...endpoint, env: { INSTANCE: name } } } }])), Object.fromEntries(names.map(name => [`${name}/d.yml`, depBundle])));
    const c = compileMeshComposition("prod", root), file = emitCompose(root, c.compose);
    try {
      const up = dockerCompose(root, file, ["up", "-d", "--wait", "--build"], 60000);
      expect(up.status, `${up.stdout}${up.stderr}`).toBe(0);
      const volumes: string[] = [];
      for (const name of names) {
        expect(waitForLog(root, file, name, "PROBE_OK")).toContain("PROBE_OK");
        const owner = c.endpoints.dependencies[name]?.db?.api?.networkHost!;
        const helper = Object.keys(c.compose.services).find(key => key.includes(`svc--${name}--dep--db--helper`))!;
        const ownerId = id(root, file, owner), helperId = id(root, file, helper);
        const ownerEnv = docker(["inspect", "--format", "{{range .Config.Env}}{{println .}}{{end}}", ownerId]).stdout;
        const helperEnv = docker(["inspect", "--format", "{{range .Config.Env}}{{println .}}{{end}}", helperId]).stdout;
        expect(ownerEnv).toContain(`INSTANCE=${name}`); expect(helperEnv).toContain(`INSTANCE=${name}`);
        const ownerVolume = docker(["inspect", "--format", '{{range .Mounts}}{{if eq .Destination "/data"}}{{.Name}}{{end}}{{end}}', ownerId]).stdout.trim();
        const helperVolume = docker(["inspect", "--format", '{{range .Mounts}}{{if eq .Destination "/data"}}{{.Name}}{{end}}{{end}}', helperId]).stdout.trim();
        expect(ownerVolume).toBe(helperVolume); volumes.push(ownerVolume);
        expect(docker(["run", "--rm", "-v", `${ownerVolume}:/data:ro`, "node:22-alpine", "cat", "/data/id"]).stdout.trim()).toBe(name);
      }
      expect(volumes[0]).not.toBe(volumes[1]);
    } finally { down(root, file); }
  }, 90000);
  it("reaches substituted provider over mesh DNS and published loopback HTTP", async () => {
    const root = runtimeMesh({ services: { consumer: { path: "consumer", dependencies: { backend: "provider" } }, provider: { path: "provider", publish: ["app.endpoints.api"] } } }, { consumer: { ...app({ PROBE_URL: "${dependencies.backend.endpoints.api.network_url}" }), dependencies: { backend: endpoint } }, provider: { app: { endpoints: { api: { port: 3000, primary: true, scheme: "http", publicPort: "AUTO" } } } } }, { "consumer/d.yml": { services: { owner: { image: "node:22-alpine", healthcheck: { test: ["CMD", "true"] } } } } });
    const c = compileMeshComposition("prod", root), file = emitCompose(root, c.compose);
    try {
      const up = dockerCompose(root, file, ["up", "-d", "--wait", "--build"], 60000);
      expect(up.status, `${up.stdout}${up.stderr}`).toBe(0);
      expect(waitForLog(root, file, "consumer", "PROBE_OK")).toContain("PROBE_OK");
      expect(Object.keys(c.compose.services)).toEqual(["consumer", "provider"]);
      const res = await fetch(`http://127.0.0.1:${c.endpoints.app.provider?.api?.publicPort}/health`);
      expect(res.status).toBe(200);
    } finally { down(root, file); }
  }, 90000);
  it("applies all environment layers in the running mesh app", async () => {
    const root = runtimeMesh({ services: { api: { path: "api", publish: ["app.endpoints.http"], env: { VALUE: "mesh-base", MESH_BASE: "yes" } } }, dev: { services: { api: { env: { VALUE: "mesh-stage", MESH_STAGE: "yes" } } } } }, { api: { ...app({ VALUE: "build-base", BUILD_BASE: "yes" }, "AUTO"), dev: { app: { env: { VALUE: "build-stage", BUILD_STAGE: "yes" } }, "override-compose": "o.yml" } } }, { "api/.env.dev": "VALUE=dotenv\nDOTENV=yes\n", "api/o.yml": { services: { app: { environment: { VALUE: "override", OVERRIDE: "yes" } } } } });
    const c = compileMeshComposition("dev", root), file = emitCompose(root, c.compose);
    try {
      const up = dockerCompose(root, file, ["up", "-d", "--wait", "--build"], 60000);
      expect(up.status, `${up.stdout}${up.stderr}`).toBe(0);
      const res = await fetch(`http://127.0.0.1:${c.endpoints.app.api?.http?.publicPort}/env`);
      const values = await res.json() as Record<string, string>;
      expect(values).toMatchObject({ VALUE: "mesh-stage", DOTENV: "yes", BUILD_BASE: "yes", BUILD_STAGE: "yes", OVERRIDE: "yes", MESH_BASE: "yes", MESH_STAGE: "yes", EXEC_MODE: "dev", INFRA_MODE: "integrated" });
    } finally { down(root, file); }
  }, 90000);
});
