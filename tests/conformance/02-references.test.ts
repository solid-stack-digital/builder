import { afterEach, describe, expect, it } from "vitest";
import { cleanupFixtures, compileMesh, compileService, dep, env, fixture, http, meshFixture, ownerBundle, write } from "./fixture.js";

afterEach(cleanupFixtures);
const ref = (property: string, endpoint = "http") => `\${app.endpoints.${endpoint}.${property}}`;
const slot = (property: string, endpoint = "http") => `\${dependencies.backend.endpoints.${endpoint}.${property}}`;
const mref = (property: string, service = "backend", endpoint = "http") => `\${${service}.app.endpoints.${endpoint}.${property}}`;
const build = (property: string, endpoint: Record<string, unknown> = http()) => ({ app: { endpoints: { http: endpoint }, env: { VALUE: ref(property) } } });
function local(extra: Record<string, unknown> = {}) {
  return fixture({ app: { ...extra }, dependencies: { backend: { ...dep("backend.yml", "owner", 3000), endpoints: { http: { service: "owner", port: 3000, primary: true, scheme: "http" } } } } }, { "backend.yml": ownerBundle({ helper: { image: "alpine" } }) });
}
function substituted(value: string, providerEndpoint: Record<string, unknown> = http(8080), publish: string[] = []) {
  return meshFixture({ services: { frontend: { path: "frontend", dependencies: { backend: "backend" } }, backend: { path: "backend", publish } } }, {
    frontend: { app: { env: { VALUE: value } }, dependencies: { backend: { compose: "backend.yml", endpoints: { http: { service: "owner", port: 3000, primary: true, scheme: "http", publicPort: "AUTO" } } } } },
    backend: { app: { endpoints: { http: providerEndpoint } } },
  }, { "frontend/backend.yml": ownerBundle() });
}
const appEnv = (stage: "dev" | "prod" | "e2e", root: string, full = false) => env(compileService(stage, root, full).compose.services.app);

describe("catalog 02: endpoint references and env ownership", () => {
  it("REF-001 resolves app network_host to app DNS without a lifecycle edge", () => {
    const result = compileService("prod", fixture(build("network_host")));
    expect(env(result.compose.services.app).VALUE).toBe("app");
    expect(Object.keys((result.compose.services.app?.depends_on ?? {}) as object)).toHaveLength(0);
  });
  it("REF-002 resolves network_port without publication", () => {
    const result = compileService("prod", fixture(build("network_port")));
    expect(env(result.compose.services.app).VALUE).toBe("3000");
    expect(result.compose.services.app?.ports).toBeUndefined();
  });
  it("REF-003 resolves scheme-free network_address", () => expect(appEnv("prod", fixture(build("network_address"))).VALUE).toBe("app:3000"));
  it("REF-004 requires scheme only for URL", () => {
    expect(appEnv("prod", fixture(build("network_url"))).VALUE).toBe("http://app:3000");
    expect(() => compileService("prod", fixture(build("network_url", { port: 3000, primary: true })))).toThrow(/scheme/i);
    expect(appEnv("prod", fixture(build("network_address", { port: 3000, primary: true }))).VALUE).toBe("app:3000");
  });
  it("REF-005 resolves published public_host", () => expect(appEnv("prod", fixture(build("public_host", http(3000, { publicPort: 18080 })))).VALUE).toBe("127.0.0.1"));
  it("REF-006 resolves fixed public properties without changing network port", () => {
    const root = fixture({ app: { endpoints: { http: http(3000, { publicPort: 18080 }) }, env: { P: ref("public_port"), A: ref("public_address"), U: ref("public_url") } } });
    const result = compileService("prod", root);
    expect(env(result.compose.services.app)).toMatchObject({ P: "18080", A: "127.0.0.1:18080", U: "http://127.0.0.1:18080", PORT: "3000" });
  });
  it("REF-007 resolves AUTO before interpolation and reuses available allocation", () => {
    const root = fixture(build("public_url", http(3000, { publicPort: "AUTO" })));
    const first = compileService("prod", root), second = compileService("prod", root);
    expect(env(first.compose.services.app).VALUE).toMatch(/^http:\/\/127\.0\.0\.1:\d+$/);
    expect(env(second.compose.services.app).VALUE).toBe(env(first.compose.services.app).VALUE);
  });
  it("REF-008 rejects public properties on unpublished endpoints", () => {
    expect(() => compileService("prod", fixture(build("public_port")))).toThrow(/publication/i);
    const root = meshFixture({ services: { api: { path: "api", env: { VALUE: mref("public_host", "api") } } } }, { api: { app: { endpoints: { http: http(3000, { publicPort: "AUTO" }) } } } });
    expect(() => compileMesh("prod", root)).toThrow(/publication/i);
  });
  it("REF-009 resolves dependency host to explicit owner", () => {
    const root = local({ env: { VALUE: slot("network_host") } });
    const result = compileService("prod", root);
    const host = env(result.compose.services.app).VALUE;
    expect(result.compose.services[host!]).toBeDefined();
    expect(host).not.toBe("backend"); expect(host).not.toContain("helper");
  });
  it("REF-010 preserves separate ports on one dependency owner", () => {
    const root = fixture({ app: { env: { A: slot("network_host"), B: "${dependencies.backend.endpoints.metrics.network_host}", PA: slot("network_port"), PB: "${dependencies.backend.endpoints.metrics.network_port}" } }, dependencies: { backend: { compose: "d.yml", endpoints: { http: { service: "owner", port: 3000, primary: true }, metrics: { service: "owner", port: 9090 } } } } }, { "d.yml": ownerBundle() });
    const result = compileService("prod", root), values = env(result.compose.services.app);
    expect(values.A).toBe(values.B); expect(values.PA).toBe("3000"); expect(values.PB).toBe("9090");
  });
  it("REF-011 uses each dependency endpoint's explicit owner", () => {
    const root = fixture({ app: { env: { A: slot("network_host"), B: "${dependencies.backend.endpoints.metrics.network_host}" } }, dependencies: { backend: { compose: "d.yml", endpoints: { http: { service: "owner", port: 3000, primary: true }, metrics: { service: "metrics", port: 9090 } } } } }, { "d.yml": ownerBundle({ metrics: { image: "alpine", healthcheck: { test: ["CMD", "true"] } } }) });
    const result = compileService("prod", root), values = env(result.compose.services.app);
    expect(values.A).not.toBe(values.B); expect(result.compose.services[values.A!]).toBeDefined(); expect(result.compose.services[values.B!]).toBeDefined();
  });
  it("REF-012 requires dependency scheme only for URL", () => {
    const root = fixture({ app: { env: { VALUE: slot("network_url") } }, dependencies: { backend: { compose: "d.yml", endpoints: { http: { service: "owner", port: 1, primary: true } } } } }, { "d.yml": ownerBundle() });
    expect(() => compileService("prod", root)).toThrow(/scheme/i);
    write(root, "build.json", { app: { env: { VALUE: slot("network_host") } }, dependencies: { backend: { compose: "d.yml", endpoints: { http: { service: "owner", port: 1, primary: true } } } } });
    expect(appEnv("prod", root).VALUE).toContain("owner");
  });
  it("REF-013 preserves literal suffix around embedded reference", () => {
    const root = local({ env: { VALUE: `${slot("network_url")}/v1/resources?x=1` } });
    expect(appEnv("prod", root).VALUE).toMatch(/^http:\/\/.*:3000\/v1\/resources\?x=1$/);
  });
  it("REF-014 resolves multiple tokens and rejects any unresolved token", () => {
    const root = fixture({ app: { endpoints: { http: http() }, env: { VALUE: `${ref("network_host")}:${ref("network_port")}` } } });
    expect(appEnv("prod", root).VALUE).toBe("app:3000");
    write(root, "build.json", { app: { endpoints: { http: http() }, env: { VALUE: `${ref("network_host")}:${ref("missing")}` } } });
    expect(() => compileService("prod", root)).toThrow(/missing|property/i);
  });
  it("REF-015 rejects unsupported endpoint property aliases", () => {
    for (const property of ["hostname", "url", "host", "publicUrl"]) expect(() => compileService("prod", fixture(build(property)))).toThrow(/property|reference/i);
  });
  it("REF-016 does not fall back to primary for an unknown app endpoint", () => expect(() => compileService("prod", fixture({ app: { endpoints: { http: http() }, env: { VALUE: ref("network_host", "missing") } } }))).toThrow(/missing/i));
  it("REF-017 rejects unknown dependency and endpoint", () => {
    expect(() => compileService("prod", fixture({ app: { env: { VALUE: slot("network_host") } } }))).toThrow(/dependency/i);
    const root = local({ env: { VALUE: slot("network_host", "missing") } });
    expect(() => compileService("prod", root)).toThrow(/missing/i);
  });
  it("REF-018 preserves escaped dollars without reference resolution", () => {
    const root = fixture({ app: { env: { VALUE: "$${SHELL_VAR}" } } });
    expect(appEnv("prod", root).VALUE).toBe("$${SHELL_VAR}");
  });
  it("REF-019 resolves direct mesh app references", () => {
    const root = meshFixture({ services: { gateway: { path: "gateway", env: { VALUE: mref("network_url") } }, backend: { path: "backend" } } }, { gateway: { app: {} }, backend: { app: { endpoints: { http: http(8080) } } } });
    expect(env(compileMesh("prod", root).compose.services.gateway).VALUE).toBe("http://backend:8080");
  });
  it("REF-020 rejects services. mesh prefix", () => {
    const root = meshFixture({ services: { api: { path: "api", env: { VALUE: "${services.api.app.endpoints.http.network_url}" } } } }, { api: { app: { endpoints: { http: http() } } } });
    expect(() => compileMesh("prod", root)).toThrow(/reference|services/i);
  });
  it("REF-021 resolves local dependency slot in mesh env", () => {
    const root = meshFixture({ services: { frontend: { path: "frontend", env: { VALUE: "${frontend.dependencies.backend.endpoints.http.network_url}" } } } }, { frontend: { app: {}, dependencies: { backend: { compose: "d.yml", endpoints: { http: { service: "owner", port: 3000, primary: true, scheme: "http" } } } } } }, { "frontend/d.yml": ownerBundle() });
    const result = compileMesh("prod", root);
    expect(env(result.compose.services.frontend).VALUE).toMatch(/^http:\/\/.*owner:3000$/);
  });
  it("REF-022 resolves substituted slot from provider and suppresses local bundle", () => {
    const root = substituted(slot("network_url"));
    const result = compileMesh("prod", root);
    expect(env(result.compose.services.frontend).VALUE).toBe("http://backend:8080");
    expect(Object.keys(result.compose.services)).toEqual(["backend", "frontend"]);
  });
  it("REF-023 allows provider host without scheme", () => {
    const root = substituted(slot("network_host"), { port: 8080, primary: true });
    expect(env(compileMesh("prod", root).compose.services.frontend).VALUE).toBe("backend");
  });
  it("REF-024 rejects provider URL without provider scheme", () => {
    const root = substituted(slot("network_url"), { port: 8080, primary: true });
    expect(() => compileMesh("prod", root)).toThrow(/scheme/i);
  });
  it("REF-025 requires effective provider publication for logical public property", () => {
    const root = substituted(slot("public_port"), http(8080, { publicPort: "AUTO" }));
    expect(() => compileMesh("prod", root)).toThrow(/publication/i);
    write(root, "mesh.json", { services: { frontend: { path: "frontend", dependencies: { backend: "backend" } }, backend: { path: "backend", publish: ["app.endpoints.http"] } } });
    expect(env(compileMesh("prod", root).compose.services.frontend).VALUE).toMatch(/^\d+$/);
  });
  it("REF-026 requires exact provider endpoint name", () => {
    const root = substituted(slot("network_host"), { port: 8080, primary: true, scheme: "http" });
    write(root, "backend/build.json", { app: { endpoints: { api: http(8080) } } });
    expect(() => compileMesh("prod", root)).toThrow(/http|endpoint/i);
  });
  it("REF-027 lets provider port differ from local slot port", () => {
    const root = substituted(slot("network_url"));
    expect(env(compileMesh("prod", root).compose.services.frontend).VALUE).toBe("http://backend:8080");
  });
  it("REF-028 ignores unused local endpoints during compatibility", () => {
    const root = substituted(slot("network_host"));
    write(root, "frontend/build.json", { app: { env: { VALUE: slot("network_host") } }, dependencies: { backend: { compose: "backend.yml", endpoints: { http: { service: "owner", port: 3000, primary: true }, metrics: { service: "owner", port: 9000 } } } } });
    expect(env(compileMesh("prod", root).compose.services.frontend).VALUE).toBe("backend");
  });
  it("REF-029 creates no mesh lifecycle edge from env reference", () => {
    const root = meshFixture({ services: { gateway: { path: "gateway", env: { VALUE: mref("network_url") } }, backend: { path: "backend" } } }, { gateway: { app: {} }, backend: { app: { endpoints: { http: http() } } } });
    expect(Object.keys((compileMesh("prod", root).compose.services.gateway?.depends_on ?? {}) as object)).toHaveLength(0);
  });
  it("REF-030 creates no env URL from mesh dependsOn", () => {
    const root = meshFixture({ services: { gateway: { path: "gateway", dependsOn: ["backend"] }, backend: { path: "backend" } } }, { gateway: { app: {} }, backend: { app: { endpoints: { http: http() } } } });
    const result = compileMesh("prod", root);
    expect(result.compose.services.gateway?.depends_on).toEqual({ backend: { condition: "service_healthy" } });
    expect(env(result.compose.services.gateway)).toEqual({ EXEC_MODE: "prod", INFRA_MODE: "integrated" });
  });
  it("REF-031 applies dependency env to all services but not app", () => {
    const root = fixture({ app: {}, dependencies: { db: { ...dep("d.yml"), env: { PROJECT_ID: "demo" } } } }, { "d.yml": ownerBundle({ helper: { image: "alpine" } }) });
    const result = compileService("prod", root);
    for (const [name, service] of Object.entries(result.compose.services)) if (name !== "app") expect(env(service).PROJECT_ID).toBe("demo");
    expect(env(result.compose.services.app).PROJECT_ID).toBeUndefined();
  });
  it("REF-032 applies mesh service env only to app", () => {
    const root = meshFixture({ services: { api: { path: "api", env: { FEATURE: "x" } } } }, { api: { app: {}, dependencies: { db: dep("d.yml") } } }, { "api/d.yml": ownerBundle() });
    const result = compileMesh("prod", root);
    expect(env(result.compose.services.api).FEATURE).toBe("x");
    for (const [name, service] of Object.entries(result.compose.services)) if (name !== "api") expect(env(service).FEATURE).toBeUndefined();
  });
  it("REF-033 rejects user PORT when primary endpoint owns it", () => expect(() => compileService("prod", fixture({ app: { endpoints: { http: http() }, env: { PORT: "1" } } }))).toThrow(/PORT/));
  it("REF-034 rejects user EXEC_MODE and INFRA_MODE", () => {
    for (const key of ["EXEC_MODE", "INFRA_MODE"]) expect(() => compileService("prod", fixture({ app: { env: { [key]: "bad" } } }))).toThrow(new RegExp(key));
  });
  it("REF-035 keeps runtime env out of Docker build args", () => {
    const root = fixture({ app: { env: { FOO: "runtime" } } });
    const result = compileService("prod", root);
    expect(env(result.compose.services.app).FOO).toBe("runtime");
    expect((result.compose.services.app?.build as any).args?.FOO).toBeUndefined();
  });
  it("REF-036 resolves stage-only app endpoint only in active stage", () => {
    const root = fixture({ app: { endpoints: { http: http() } }, e2e: { app: { endpoints: { debug: { port: 4000 } }, env: { VALUE: ref("network_port", "debug") } } } });
    expect(appEnv("e2e", root).VALUE).toBe("4000");
    expect(appEnv("dev", root).VALUE).toBeUndefined();
  });
  it("REF-037 resolves E2E-only dependency without leaking to prod", () => {
    const root = fixture({ app: {}, e2e: { app: { env: { VALUE: "${dependencies.mail.endpoints.api.network_host}" } }, dependencies: { mail: dep("mail.yml") } } }, { "mail.yml": ownerBundle() });
    expect(appEnv("e2e", root).VALUE).toContain("owner");
    expect(Object.keys(compileService("prod", root).compose.services)).toEqual(["app"]);
  });
  it("REF-038 resolves provider after publication and AUTO allocation", () => {
    const root = substituted(slot("public_url"), http(8080, { publicPort: "AUTO" }), ["app.endpoints.http"]);
    const result = compileMesh("prod", root), value = env(result.compose.services.frontend).VALUE;
    expect(value).toBe(`http://127.0.0.1:${result.endpoints.app.backend?.http?.publicPort}`);
    expect(value).not.toContain("AUTO");
  });
  it("REF-039 requires scheme for published public_url but not public_address", () => {
    const root = fixture(build("public_url", { port: 3000, primary: true, publicPort: 18090 }));
    expect(() => compileService("prod", root)).toThrow(/scheme/i);
    write(root, "build.json", build("public_address", { port: 3000, primary: true, publicPort: 18090 }));
    expect(appEnv("prod", root).VALUE).toBe("127.0.0.1:18090");
  });
});
