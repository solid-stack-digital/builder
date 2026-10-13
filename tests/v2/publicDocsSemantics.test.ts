import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

function markdownFiles(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
    const file = path.join(dir, entry.name);
    if (entry.isDirectory()) return markdownFiles(file);
    return entry.isFile() && file.endsWith(".md") ? [file] : [];
  });
}

describe("public documentation architecture", () => {
  it("does not state superseded E2E or mesh test semantics", () => {
    const files = [path.resolve("README.md"), ...markdownFiles(path.resolve("docs"))];
    const forbidden: Array<[RegExp, string]> = [
      [/remains (?:an? )?explicit[^\n]*mesh[^\n]*test[^\n]*stage/i, "mesh test topology was removed"],
      [/test-unit[^\n]*explicitly exercises[^\n]*mesh[^\n]*test[^\n]*overlay/i, "mesh test topology was removed"],
      [/test-unit uses mesh\/build test/i, "mesh test topology was removed"],
      [/E2E[^\n]*does not inherit[^\n]*prod[^\n]*(JSON|overlay)/i, "E2E inherits the prod structured overlay"],
      [/mesh[^\n]*test[^\n]*(only|first runs)[^\n]*unit[^\n]*then[^\n]*global E2E/i, "canonical mesh test includes service E2E in Phase 1"],
      [/E2E\s+(?:app|application)[^.;\n]*EXEC_MODE[^.;\n]*\be2e\b/i, "E2E apps use EXEC_MODE=prod; testers use e2e"],
      [/does not run each service[^\n]*E2E/i, "canonical mesh test runs each root service E2E"],
    ];
    const failures: string[] = [];
    for (const file of files) {
      const lines = fs.readFileSync(file, "utf8").split(/\r?\n/);
      lines.forEach((line, index) => forbidden.forEach(([pattern, message]) => { if (pattern.test(line)) failures.push(`${path.relative(process.cwd(), file)}:${index + 1}: ${message}`); }));
    }
    expect(failures).toEqual([]);
  });
});
