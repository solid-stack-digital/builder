import { describe, expect, it } from "vitest";
import fs from "node:fs";
import { getDockerComposeTemplate, getTemplatesDir, getDockerfilePolicyDir } from "../src/core/templates.js";

describe("templates resolution", () => {
  it("resolves the templates directory", () => {
    const dir = getTemplatesDir();
    expect(fs.existsSync(dir)).toBe(true);
    expect(fs.existsSync(`${dir}/docker`)).toBe(true);
  });

  it("resolves specific docker compose templates", () => {
    const base = getDockerComposeTemplate("docker-compose.base.yml");
    expect(fs.existsSync(base)).toBe(true);

    const dev = getDockerComposeTemplate("docker-compose.dev.yml");
    expect(fs.existsSync(dev)).toBe(true);

    const prod = getDockerComposeTemplate("docker-compose.prod.yml");
    expect(fs.existsSync(prod)).toBe(true);

    const test = getDockerComposeTemplate("docker-compose.test.yml");
    expect(fs.existsSync(test)).toBe(true);

    const e2e = getDockerComposeTemplate("docker-compose.e2e.yml");
    expect(fs.existsSync(e2e)).toBe(true);

    expect(fs.existsSync(`${getDockerfilePolicyDir()}/dockerfile.rego`)).toBe(true);
    for (const file of [base, dev, prod, test, e2e]) {
      const content = fs.readFileSync(file,"utf8");
      expect(content).not.toContain("PUBLIC_PORT");
      expect(content).not.toMatch(/3000:3000/);
    }
    expect(fs.readFileSync(e2e,"utf8")).not.toContain("API_URL");
  });

  it("throws for non-existent template", () => {
    expect(() => getDockerComposeTemplate("non-existent.yml")).toThrow(
      "Docker compose template not found"
    );
  });
});
