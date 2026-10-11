import { spawnSync } from "node:child_process";
import { parse } from "yaml";
vi.mock("node:child_process",()=>({spawnSync:vi.fn()}));
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { compileApplicationEnv, serializeApplicationEnv } from "../src/core/compileApplicationEnv.js";

describe("application environment compilation", () => {
  let dir: string;
  beforeEach(() => {
    vi.mocked(spawnSync).mockReset();
    dir = fs.mkdtempSync(path.join(os.tmpdir(), "builder-application-env-"));
    fs.copyFileSync(path.resolve("tests/fixtures/v2/service-basic/Dockerfile"), path.join(dir,"Dockerfile"));
    fs.writeFileSync(path.join(dir, "build.json"), JSON.stringify({
      name: "env-test", app: { endpoints: { http: { port: 8080, publicPort: 8080, primary: true, scheme: "http" } }, env: { APP_URL: "${app.endpoints.http.public_url}/api", PRIORITY: "build-json" } },
      dev: { "override-compose": "dev.yml" },
      tester: { env: { TESTER_ONLY: "yes" } },
    }));
    fs.writeFileSync(path.join(dir, "dev.yml"), 'services:\n  app:\n    environment:\n      FROM_DEFAULT: base\n      PRIORITY: compose\n');
    fs.writeFileSync(path.join(dir, ".env"), "FROM_DEFAULT=base\nINTERPOLATION_ONLY=hidden\n");
    for (const stage of ["dev", "prod", "test", "e2e"]) {
      fs.writeFileSync(path.join(dir, `.env.${stage}`), `STAGE_FILE=${stage}\nPRIORITY=env-file\nSECRET='literal$money'\n`);
    }
  });
  afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));

  it("passes compiled overrides, env files, URL templates and runtime values to Compose", () => {
    vi.mocked(spawnSync).mockReturnValue({status:0,pid:1,output:[],signal:null,stderr:"",stdout:JSON.stringify({services:{app:{environment:{SECRET:"literal$$money",NUMBER:42,UNSET:null}}}})});
    expect(compileApplicationEnv("dev",dir)).toEqual({SECRET:"literal$money",NUMBER:"42"});
    expect(spawnSync).toHaveBeenCalledWith("docker",["compose","--project-directory",dir,"-f","-","config","--format","json"],expect.objectContaining({cwd:dir}));
    const c=parse(vi.mocked(spawnSync).mock.lastCall![2]!.input as string);
    expect(c.services.app.env_file).toEqual([{path:".env.dev",required:false}]);
    expect(c.services.app.environment).toMatchObject({PRIORITY:"compose",APP_URL:"http://127.0.0.1:8080/api",EXEC_MODE:"dev",INFRA_MODE:"isolated"});
  });

  it("sends E2E overlay with prod app target and keeps tester settings separate", () => {
    vi.mocked(spawnSync).mockReturnValue({status:0,pid:1,output:[],signal:null,stderr:"",stdout:JSON.stringify({services:{app:{environment:{EXEC_MODE:"e2e"}}}})});
    expect(compileApplicationEnv("e2e",dir)).toEqual({EXEC_MODE:"e2e"});
    const c=parse(vi.mocked(spawnSync).mock.lastCall![2]!.input as string);
    expect(c.services.app.build.target).toBe("prod");expect(c.services.app.env_file).toEqual([{path:".env.e2e",required:false}]);expect(c.services.app.environment.TESTER_ONLY).toBeUndefined();
  });

  it("propagates Compose config failures",()=>{
    vi.mocked(spawnSync).mockReturnValue({status:1,pid:1,output:[],signal:null,stderr:"invalid config",stdout:""});
    expect(()=>compileApplicationEnv("dev",dir)).toThrow(/invalid config/);
  });

  it("serializes literal values without losing quotes, dollars or newlines", () => {
    expect(serializeApplicationEnv({EMPTY:"", DOLLARS:"$literal", MULTILINE:"one\ntwo"})).toBe("DOLLARS='$literal'\nEMPTY=''\nMULTILINE='one\ntwo'\n");
  });

  it("rejects values that cannot be represented as environment assignments", () => {
    expect(() => serializeApplicationEnv({ "BAD\nNAME": "value" })).toThrow("invalid environment variable name");
    expect(() => serializeApplicationEnv({ BAD: "contains\0nul" })).toThrow("NUL");
  });
});
