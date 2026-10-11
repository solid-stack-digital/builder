import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { resolveBuildStage } from "../../src/core/config/resolveBuildStage.js";
import { resolveMeshStage } from "../../src/core/config/resolveMeshStage.js";
import { buildJsonSchema } from "../../src/core/buildSchema.js";
import { getDockerfilePolicyDir } from "../../src/core/templates.js";
import { CONFTEST_IMAGE } from "../../src/core/checkers/constants.js";
import { cleanupFixtures, compileMesh, compileService, dep, env, fixture, http, meshFixture, ownerBundle, write } from "../conformance/fixture.js";

afterEach(cleanupFixtures);
const goodDockerfile = `FROM alpine AS base
CMD ["sh", "-c", "exec sleep 30"]
HEALTHCHECK CMD true
FROM base AS dev
FROM base AS test
FROM base AS test-e2e
FROM alpine AS builder
RUN echo data > /artifact
FROM alpine AS prod
COPY --from=builder /artifact /artifact
HEALTHCHECK CMD true
CMD ["sh", "-c", "exec sleep 30"]
`;
function policy(dockerfile: string) {
  const root = mkdtempSync(path.join(os.tmpdir(), "builder-conformance-policy-"));
  try {
    writeFileSync(path.join(root, "Dockerfile"), dockerfile);
    return spawnSync("docker", ["run", "--rm", "--network", "none", "--mount", `type=bind,src=${root},dst=/project,readonly`, "--mount", `type=bind,src=${getDockerfilePolicyDir()},dst=/policy,readonly`, "-w", "/project", CONFTEST_IMAGE, "test", "Dockerfile", "-p", "/policy"], { encoding: "utf8", timeout: 30000 });
  } finally { rmSync(root, { recursive: true, force: true }); }
}
describe("real Dockerfile policy semantics",()=>{
  it("STG-030 requires every Dockerfile target alias", () => {
    expect(policy(goodDockerfile).status).toBe(0);
    for (const target of ["dev", "test", "test-e2e", "prod"]) {
      const bad = goodDockerfile.replace(new RegExp(`FROM [^\\n]+ AS ${target}\\n`), "");
      expect(policy(bad).status, target).not.toBe(0);
    }
  });
  it("STG-031 requires foreground dev CMD", () => {
    expect(policy(goodDockerfile.replace('CMD ["sh", "-c", "exec sleep 30"]\n', "")).status).not.toBe(0);
  });
  it("STG-032 accepts finite test targets without healthchecks", () => {
    const finite = goodDockerfile.replace("FROM base AS test\nFROM base AS test-e2e", "FROM alpine AS test\nCMD [\"sh\",\"-c\",\"exit 0\"]\nFROM alpine AS test-e2e\nCMD [\"sh\",\"-c\",\"exit 1\"]");
    expect(policy(finite).status).toBe(0);
  });
  it("STG-033 requires dev and prod healthchecks while accepting inherited dev check", () => {
    expect(policy(goodDockerfile).status).toBe(0);
    expect(policy(goodDockerfile.replace("HEALTHCHECK CMD true\nFROM base AS dev", "FROM base AS dev")).status).not.toBe(0);
    expect(policy(goodDockerfile.replace("HEALTHCHECK CMD true\nCMD [\"sh\", \"-c\", \"exec sleep 30\"]\n", "CMD [\"sh\", \"-c\", \"exec sleep 30\"]\n")).status).not.toBe(0);
  });
  it("STG-034 rejects EXPOSE", () => expect(policy(goodDockerfile + "EXPOSE 3000\n").status).not.toBe(0));
  it("STG-035 requires prod to copy built artifacts", () => {
    expect(policy(goodDockerfile).status).toBe(0);
    expect(policy(goodDockerfile.replace("COPY --from=builder /artifact /artifact\n", "")).status).not.toBe(0);
  });
  it("STG-036 rejects daemonizing runtime command", () => {
    expect(policy(goodDockerfile.replaceAll('CMD ["sh", "-c", "exec sleep 30"]', 'CMD ["sh", "-c", "sleep 30 &"]')).status).not.toBe(0);
  });
});
