import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { afterEach, describe, expect, it } from "vitest";
import { deriveProjectName } from "../../../src/utils/projectName.js";
import { teardownCompose } from "../../../src/core/teardownCompose.js";
import { fixtureDir } from "../support/fixtures.js";
import { dockerFixture, statusByProject, write, type DockerFixture } from "./support.js";

let current: DockerFixture | undefined;
afterEach(async () => {
  if (!current) return;
  for (const stage of ["test", "e2e"]) {
    const projectName = deriveProjectName(current.name, stage), left = statusByProject(projectName);
    if ([...left.containers, ...left.networks, ...left.volumes].length) await teardownCompose("", current.root, { projectName, removeVolumes: true, silent: true });
  }
  current = undefined;
});

describe("real V3.3 output modes", () => {
  it("[OUT26] logfile captures real build and container output from a Docker run", () => {
    const f = current = dockerFixture("out26"), logs = fixtureDir("out26-logs");
    write(f, "build.json", JSON.stringify({ name: f.name, services: { main: { endpoints: { http: { port: 3100, publicPort: "AUTO", primary: true, scheme: "http" } } }, tester: { compose: "e2e/tester.yml", service: "runner" } } }));
    write(f, "e2e/tester.yml", `services:\n  runner:\n    image: ${f.image}\n    command: ["python", "-c", "print('tester-output-${f.nonce}', flush=True)"]\n`);
    const run = spawnSync("node", ["dist/bin.js", "service", "up", "test-e2e", "-C", f.root, "--skip-checks", "--logfile", logs], { encoding: "utf8", timeout: 170_000 });
    expect(run.stdout).toBe("success\n");
    expect(run.stderr).toBe("");
    expect(run.status).toBe(0);
    const files = fs.readdirSync(logs);
    expect(files).toHaveLength(1);
    const text = fs.readFileSync(path.join(logs, files[0]!), "utf8");
    expect(text).toMatch(/#\d+ |Built|Building/);
    expect(text).toContain(`tester-output-${f.nonce}`);
    expect(text.endsWith("success\n")).toBe(true);
    for (const stage of ["test", "e2e"]) expect(statusByProject(deriveProjectName(f.name, stage))).toEqual({ containers: [], networks: [], volumes: [] });
  }, 180_000);
});
