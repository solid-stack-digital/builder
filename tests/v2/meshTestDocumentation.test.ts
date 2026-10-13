import fs from "node:fs";
import path from "node:path";
import { Command } from "commander";
import { expect, it } from "vitest";
import { registerMeshUpCommand } from "../../src/commands/mesh/commands/up/command.js";
import { registerMeshDownCommand } from "../../src/commands/mesh/commands/down/command.js";
function help(register: (command: Command) => void, name: string) {
  let output = "";
  const command = new Command("mesh").exitOverride().configureOutput({ writeOut: text => { output += text; }, writeErr: text => { output += text; } });
  register(command);
  try { command.parse([name, "--help"], { from: "user" }); }
  catch (error) { expect(error).toMatchObject({ code: "commander.helpDisplayed" }); }
  return output.replace(/\s+/g, " ");
}
it("renders supported mesh help without advertising removed commands", () => {
  const up = help(registerMeshUpCommand, "up"), down = help(registerMeshDownCommand, "down");
  expect(up).toContain("dev, prod, test, test-e2e");
  expect(down).toContain("dev, prod, test, test-e2e");
  expect(up).not.toContain("builder mesh up test-unit");
  expect(down).not.toContain("builder mesh down test-unit");
  expect(up).toContain("builder service up test-unit");
});
it("keeps normative mesh shapes and execution rules consistent", () => {
  const mesh = fs.readFileSync(".docs/specs_v2/MESH_JSON_DOCS.md", "utf8");
  expect(mesh).not.toMatch(/test\??:\s*MeshStage/);
  expect(mesh).not.toContain("namespace retained");
  for (const file of [".docs/specs_v2/MESH_JSON_DOCS.md", ".docs/specs_v2/SPECS_V2.md", ".docs/EXECUTION_MODEL.md"]) {
    expect(fs.readFileSync(file, "utf8"), file).toContain("A root `test` field is rejected");
  }
  const build = fs.readFileSync(".docs/specs_v2/BUILD_JSON_DOCS.md", "utf8");
  expect(build).toContain("test?: BuildStage");
  expect(build).toContain("INFRA_MODE=isolated");
});
it("provides linked migration guidance and retains the service reference", () => {
  expect(fs.readFileSync("docs/README.md", "utf8")).toContain("migration/v2.1-to-v2.2.md");
  const migration = fs.readFileSync("docs/migration/v2.1-to-v2.2.md", "utf8");
  expect(migration).toContain("--skip-checks");
  expect(migration).toContain("build.json.test");
  expect(migration).toContain("mesh.json.e2e");
  expect(fs.readFileSync("docs/reference/build-json.md", "utf8")).toContain("test?: BuildStage");
  expect(fs.readFileSync(".changeset/remove-mesh-test-topology.md", "utf8")).toContain("legacy root test field");
});
it("resolves relative migration links", () => {
  function walk(dir: string): string[] { return fs.readdirSync(dir, { withFileTypes: true }).flatMap(e => e.isDirectory() ? walk(path.join(dir, e.name)) : e.name.endsWith(".md") ? [path.join(dir, e.name)] : []); }
  for (const file of ["README.md", ...walk("docs")]) {
    for (const match of fs.readFileSync(file, "utf8").matchAll(/\]\(([^)\s]*v2\.1-to-v2\.2\.md)\)/g)) {
      expect(fs.existsSync(path.resolve(path.dirname(file), match[1]!)), `${file}: ${match[1]}`).toBe(true);
    }
  }
});
