import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { compileApplicationEnv, serializeApplicationEnv } from "../src/core/compileApplicationEnv.js";

describe("application environment compilation", () => {
  let dir: string;
  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), "builder-application-env-"));
    fs.writeFileSync(path.join(dir, "build.json"), JSON.stringify({
      name: "env-test", port: 8080,
      overrides: { dev: { path: "dev.yml" } },
      envOverrides: { APP_URL: "${app.public_url}/api", PRIORITY: "build-json" },
      tester: { envOverrides: { TESTER_ONLY: "yes" } },
    }));
    fs.writeFileSync(path.join(dir, "dev.yml"), 'services:\n  app:\n    environment:\n      FROM_DEFAULT: ${FROM_DEFAULT}\n      PRIORITY: compose\n');
    fs.writeFileSync(path.join(dir, ".env"), "FROM_DEFAULT=base\nINTERPOLATION_ONLY=hidden\n");
    for (const stage of ["dev", "prod", "test", "e2e"]) {
      fs.writeFileSync(path.join(dir, `.env.${stage}`), `STAGE_FILE=${stage}\nPRIORITY=env-file\nSECRET='literal$money'\n`);
    }
  });
  afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));

  it("resolves stage files, overrides, URL templates and final runtime values", () => {
    const environment = compileApplicationEnv("dev", dir);
    expect(environment).toMatchObject({
      EXEC_MODE: "dev", INFRA_MODE: "isolated", STAGE_FILE: "dev",
      FROM_DEFAULT: "base", PRIORITY: "build-json", APP_URL: "http://localhost:8080/api",
      SECRET: "literal$money",
    });
    expect(environment.INTERPOLATION_ONLY).toBeUndefined();
    expect(compileApplicationEnv("dev", dir, { full: true }).INFRA_MODE).toBe("integrated");
  });

  it("exports the app's prod environment during E2E and does not mix in tester settings", () => {
    const environment = compileApplicationEnv("e2e", dir);
    expect(environment).toMatchObject({ EXEC_MODE: "prod", INFRA_MODE: "integrated", STAGE_FILE: "prod" });
    expect(environment.TESTER_ONLY).toBeUndefined();
  });

  it("round-trips quotes, dollars, backslashes, empty strings, spaces and multiline values through Compose", () => {
    const values = {
      EMPTY: "", DOLLARS: "$literal ${UNCHANGED} $$", SPACES: "  a # b  ",
      QUOTES: "it's \"quoted\"", BACKSLASH: "C:\\folder\\file", END_SLASH: "end\\",
      MULTILINE: "line one\nline two", ESCAPED_QUOTE: "backslash\\'quote",
    };
    fs.writeFileSync(path.join(dir, "export.env"), serializeApplicationEnv(values));
    const result = spawnSync("docker", ["compose", "-p", "roundtrip", "--project-directory", dir, "-f", "-", "config", "--format", "json"], {
      cwd: dir, encoding: "utf8", input: 'services:\n  app:\n    image: alpine\n    env_file: export.env\n',
    });
    expect(result.status, result.stderr).toBe(0);
    const environment = JSON.parse(result.stdout).services.app.environment;
    for (const [key, value] of Object.entries(values)) {
      expect(environment[key].replace(/\$\$/g, "$"), key).toBe(value);
    }
  });

  it("rejects values that cannot be represented as environment assignments", () => {
    expect(() => serializeApplicationEnv({ "BAD\nNAME": "value" })).toThrow("invalid environment variable name");
    expect(() => serializeApplicationEnv({ BAD: "contains\0nul" })).toThrow("NUL");
  });
});
