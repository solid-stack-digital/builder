I re-audited the updated snapshot against the normative `SPECS_V2.md`, `BUILD_JSON_DOCS.md`, and `MESH_JSON_DOCS.md`.

The previous round of fixes is materially present. In particular, I no longer see the earlier defects around missing-Dockerfile fail-fast, symlink path escape, Windows host-root mounts, override volume source parsing, override/mesh network union, same-file `extends`/`ipc`/`pid` renaming, customized dependency default networks, or mesh anonymous-volume cleanup.

However, the implementation is **still not fully V2-conformant**. I found **13 remaining concrete bugs** that I would treat as real defects rather than stylistic concerns.

This is a static audit of the supplied updated repository snapshot; the pasted repository does not contain its installed dependency tree, so I did not execute Vitest. The tests below are specifically constructed to fail against the code as currently written.

## Remaining bug report

1. **HIGH — Nested `override-compose` files use the wrong base directory for app-relative paths and can reject the canonical build-args pattern.**

   **Bug:** `rebaseComposePaths()` resolves relative paths using `dirname(override-compose)`. It also injects a `build.context` of `"."` whenever `services.app.build` is an object, even when the override only contains `build.args`. Pasted text(3)

   That is incompatible with the documented form:
   ```json
   "override-compose": ".docker/overrides/docker-compose.dev.override.yml"
   ```
   together with an override containing `.:/app` and `build.args`. Pasted text(3)

   For a nested override with only:
   ```yaml
   services:
     app:
       build:
         args:
           MODE: development
   ```
   the rebasing code synthesizes approximately:
   ```yaml
   build:
     context: ./.docker/overrides
   ```
   and `validateAndPrepareAppOverride()` subsequently rejects it because the Builder-owned context is `"."`. Pasted text(3)

   **Failing test:** add a regression to `tests/conformance/03-stages.test.ts`:
   ```ts
   it("accepts build args from a nested override without changing build context", () => {
     const root = fixture(
       {
         app: {},
         dev: {
           "override-compose": ".docker/overrides/dev.yml",
         },
       },
       {
         ".docker/overrides/dev.yml": {
           services: {
             app: {
               build: {
                 args: { MODE: "development" },
               },
             },
           },
         },
       },
     );

     const c = compileService("dev", root);

     expect((c.compose.services.app?.build as any).context).toBe(".");
     expect((c.compose.services.app?.build as any).args.MODE).toBe("development");
   });
   ```
   It currently throws.

   Add a second assertion using `volumes: [".:/app"]`; it should refer to the service project root, not `.docker/overrides`.

   **Expected behavior:** merely locating an override under `.docker/overrides/` must not change the app's project-relative runtime/build context.

   **Fix:** don't run ordinary dependency-Compose rebasing semantics over app overrides. Create an override-specific path rebaser whose base is the **service project directory**, not the override file directory. Also never synthesize `build.context` when the override did not explicitly declare one.

2. **HIGH — Compose `${VAR}` interpolation inside `override-compose` environment is incorrectly treated as Builder endpoint-reference syntax.**

   **Bug:** Builder references are normatively defined for `build.json` and `mesh.json`. Pasted text(3) An override is an actual Compose file, not another Builder JSON document. Pasted text(3)

   Current compilation nevertheless sends override environment values through `resolveEnv()`, which parses `${...}` using the **build.json Builder reference grammar**. Pasted text(3)

   Therefore a perfectly ordinary Compose expression:
   ```yaml
   environment:
     API_TOKEN: ${API_TOKEN}
   ```
   throws `Invalid build endpoint reference`.

   **Failing test:**
   ```ts
   it("preserves Compose interpolation in override environment", () => {
     const root = fixture(
       {
         app: {},
         dev: { "override-compose": "override.yml" },
       },
       {
         "override.yml": {
           services: {
             app: {
               environment: {
                 API_TOKEN: "${API_TOKEN}",
               },
             },
           },
         },
       },
     );

     const c = compileService("dev", root);

     expect(env(c.compose.services.app).API_TOKEN).toBe("${API_TOKEN}");
   });
   ```
   Current behavior is an exception.

   **Expected behavior:** Builder endpoint interpolation applies to Builder-managed JSON env. Normal Compose interpolation inside an override remains Compose syntax.

   **Fix:** keep override environment separate from `build.json app.env`. Do not run `collectBuilderReferences()` / `interpolateBuilderReferences()` on override Compose environment. In mesh mode, resolve build JSON env first, then merge raw override environment, then resolved mesh JSON env, then Builder internal env.

3. **HIGH — `override-compose` validation is not fail-closed; several Compose escape hatches bypass V2 ownership.**

   **Bug:** the validator rejects `ports`, `depends_on`, `network_mode`, `container_name`, `privileged`, selected healthcheck fields and object-form build target/dockerfile/context. Pasted text(3) But several declarations remain reachable:

   - string-form `build: ./other-context`;
   - `extends.file`;
   - top-level `include`;
   - `profiles`.

   V2 explicitly says the override is not a generic service-definition escape hatch and cannot take endpoint, lifecycle, build-target, Dockerfile, or readiness ownership. Pasted text(3) V2 is also explicitly fail-fast and forbids silently omitting unsupported declared configuration. Pasted text(3)

   The string-form `build` case is especially clear: it bypasses the object validation and is later silently replaced by Builder's own build object.

   `extends.file` is worse: an externally extended service can reintroduce `ports`, `depends_on`, `privileged`, a different build context, etc. after Builder has validated only the visible override.

   **Failing test:** parameterize these:
   ```ts
   it.each([
     { services: { app: { build: "./other" } } },
     { services: { app: { extends: { file: "base.yml", service: "app" } } } },
     { services: { app: { profiles: ["debug"] } } },
     { include: ["other.yml"], services: { app: {} } },
   ])("rejects override escape hatch %#", (override) => {
     const root = fixture(
       {
         app: {},
         dev: { "override-compose": "o.yml" },
       },
       {
         "o.yml": override,
         "base.yml": {
           services: {
             app: { ports: ["3000:3000"] },
           },
         },
       },
     );

     expect(() => compileService("dev", root)).toThrow();
   });
   ```

   At least the string build, `profiles`, and root `include` currently do not fail according to V2 semantics.

   **Expected behavior:** any override declaration Builder cannot safely merge while preserving ownership is rejected before composition.

   **Fix:** explicitly reject root `include`, external `extends`, app `profiles`, string-form build contexts that differ from Builder's context, and every unsupported `build.*` field rather than silently discarding it. Alternatively fully expand and validate them, but rejection is substantially simpler and safer.

4. **HIGH — Override-owned resources are not namespaced by mesh service, so two valid services can collide.**

   **Bug:** override resources are named only using:
   ```text
   app-override--<stage>--<kind>--<name>
   ```
   with no service identity. Pasted text(3)

   Therefore these two independently runnable mesh services:
   ```text
   frontend -> dev override volume "cache"
   backend  -> dev override volume "cache"
   ```
   both emit:
   ```text
   app-override--dev--volume--cache
   ```

   The mesh merge then deliberately throws on the second name. Pasted text(3) Mesh services are supposed to be independently runnable projects composed together. Pasted text(3)

   **Failing test:**
   ```ts
   it("isolates same-named override resources across mesh services", () => {
     const root = meshFixture(
       {
         services: {
           a: { path: "a" },
           b: { path: "b" },
         },
       },
       {
         a: {
           app: {},
           dev: { "override-compose": "o.yml" },
         },
         b: {
           app: {},
           dev: { "override-compose": "o.yml" },
         },
       },
       {
         "a/o.yml": {
           services: { app: { volumes: ["cache:/cache"] } },
           volumes: { cache: {} },
         },
         "b/o.yml": {
           services: { app: { volumes: ["cache:/cache"] } },
           volumes: { cache: {} },
         },
       },
     );

     const c = compileMesh("dev", root);

     expect(Object.keys(c.compose.volumes ?? {})).toHaveLength(2);
   });
   ```
   Current compilation throws a mesh composition collision.

   **Expected behavior:** each service's app override resources remain independent unless they explicitly use an external resource.

   **Fix:** in mesh mode include the mesh service identity:
   ```text
   svc--frontend--app-override--dev--volume--cache
   svc--backend--app-override--dev--volume--cache
   ```
   Pass an internal override namespace into `validateAndPrepareAppOverride()`.

5. **HIGH — Generated dependency names are delimiter-ambiguous, and mesh code later parses them with `startsWith()`.**

   **Bug:** generated names are plain concatenations such as:
   ```ts
   `${prefix}--${originalName}`
   ```
   and resources similarly concatenate raw values. Pasted text(3)

   Since Builder identifiers themselves permit repeated hyphens, these tuples are not injective:

   ```text
   dependency "a--b", service "c"
   dependency "a",    service "b--c"

   both -> dep--a--b--c
   ```

   V2 requires namespace collision isolation. Pasted text(3)

   There is a second bug caused by the same assumption. Mesh dependency env injection identifies implementation ownership with:
   ```ts
   serviceName.startsWith(
     `svc--${service}--dep--${dependency}--`
   )
   ```
   Pasted text(3)

   So dependency `a` also matches generated services belonging to dependency `a--b`. Environment values from one module leak into another.

   **Failing tests:** first test collision:
   ```ts
   dependencies: {
     "a":    endpointDep("a.yml", "b--c"),
     "a--b": endpointDep("ab.yml", "c"),
   }
   ```
   Compilation should succeed with distinct generated owners; it currently collides.

   Then test env leakage in a mesh:
   ```text
   dependency a      env ONLY_A=yes
   dependency a--b   env {}
   ```
   Assert the services belonging to `a--b` do **not** contain `ONLY_A`. They currently match the `a` prefix.

   **Expected behavior:** generated identity must be unambiguous and no code should reverse-engineer ownership from generated-name string prefixes.

   **Fix:** use an injective private naming function, preferably tuple → deterministic hash/encoded segments. More importantly, keep explicit metadata:
   ```ts
   dependencyServices: Record<dependencyKey, string[]>
   ```
   and use that for env propagation/private network attachment instead of `startsWith()`.

6. **HIGH — Mesh compilation corrupts valid companion services using `network_mode`.**

   **Bug:** V2 explicitly supports internal dependency relationships such as:
   ```text
   network_mode: service:<name>
   ```
   and requires them to be rewritten consistently. Pasted text(3)

   The updated namespacer correctly rewrites `service:<name>`. Pasted text(3)

   But when composing a mesh, Builder then unconditionally attaches the consumer's private network to **every generated service in the dependency bundle**. Pasted text(3)

   A valid companion:
   ```yaml
   helper:
     network_mode: service:owner
   ```
   consequently ends up with both:
   ```yaml
   network_mode: service:svc--...
   networks:
     mesh--consumer: null
   ```
   which is invalid Compose.

   **Failing test:**
   ```ts
   it("does not attach mesh networks to network_mode companions", () => {
     const dep = {
       services: {
         owner: {
           image: "alpine",
           healthcheck: { test: ["CMD", "true"] },
         },
         helper: {
           image: "alpine",
           network_mode: "service:owner",
         },
       },
     };

     // consumer has an endpoint owned by owner
     const c = compileMesh("prod", ...);

     const helper = c.compose.services[
       "svc--consumer--dep--db--helper"
     ];

     expect(helper?.network_mode)
       .toBe("service:svc--consumer--dep--db--owner");

     expect(helper?.networks).toBeUndefined();
   });
   ```

   **Expected behavior:** endpoint owners join the Builder communication network. A companion whose network namespace is governed by `network_mode` retains that mode and is not simultaneously given `networks`.

   **Fix:** skip Builder network attachment whenever `service.network_mode !== undefined`. For `network_mode: service:<owner>`, ensure the referenced owner has the required network instead.

7. **HIGH — Dependency healthcheck validation accepts structurally invalid healthchecks.**

   **Bug:** the current validator essentially checks that `healthcheck.test` is truthy/nonempty. A number, object, or arbitrary array can pass. Pasted text(3)

   V2 requires a **valid Compose healthcheck** on every endpoint-owning service. Pasted text(3)

   For example:
   ```yaml
   healthcheck:
     test: 123
   ```
   passes Builder's current healthcheck validator and only fails later when Compose consumes it.

   **Failing test:**
   ```ts
   it("rejects structurally invalid endpoint-owner healthcheck", () => {
     expect(() =>
       validateDependencyCompose(
         "db",
         {
           compose: "db.yml",
           env: {},
           dependsOn: [],
           endpoints: {
             db: {
               service: "owner",
               port: 5432,
               primary: true,
             },
           },
         },
         {
           services: {
             owner: {
               image: "postgres",
               healthcheck: {
                 test: 123,
               },
             },
           },
         },
         {
           composePath: "db.yml",
           stage: "prod",
         },
       ),
     ).toThrow(/healthcheck/i);
   });
   ```
   It currently passes validation.

   **Expected behavior:** reject before final Compose execution.

   **Fix:** validate `test` as either:
   - a non-empty string; or
   - a valid array beginning with `CMD` or `CMD-SHELL`, with a usable command;
   and reject `NONE`, invalid scalar/object values, and malformed arrays.

8. **HIGH — Compose `profiles` can defeat V2 atomic dependency materialization.**

   **Bug:** V2 says that when a dependency is materialized, **all Compose services in that implementation are materialized**. Pasted text(3)

   Current dependency validation rejects several runtime escape hatches, but does not reject or normalize `profiles`. Pasted text(3) The namespacer clones unknown service fields unchanged. Pasted text(3)

   Thus:
   ```yaml
   services:
     owner:
       image: redis
       profiles: ["optional"]
       healthcheck:
         test: ["CMD", "true"]
   ```
   can compile successfully but `docker compose up` without that profile does not materialize the owner.

   That directly contradicts the atomic dependency rule.

   **Failing test:**
   ```ts
   it("rejects profile-gated services in an atomic dependency bundle", () => {
     const root = fixture(
       {
         app: {},
         dependencies: {
           db: dep("db.yml"),
         },
       },
       {
         "db.yml": {
           services: {
             owner: {
               image: "alpine",
               profiles: ["optional"],
               healthcheck: {
                 test: ["CMD", "true"],
               },
             },
           },
         },
       },
     );

     expect(() => compileService("prod", root))
       .toThrow(/profile|atomic|material/i);
   });
   ```
   It currently compiles.

   **Expected behavior:** a dependency declared materialized by Builder cannot then be disabled by native Compose profile selection.

   **Fix:** simplest is to reject `profiles` inside dependency implementations. Alternatively Builder would have to explicitly activate every relevant profile, which is more complex and weakens deterministic composition.

9. **HIGH — Dependency `extends` is renamed but not semantically resolved before endpoint-owner validation.**

   The earlier fix correctly rewrites same-file `extends.service`. But there is still a second-order defect.

   Consider:
   ```yaml
   services:
     base:
       image: alpine
       network_mode: none

     owner:
       extends:
         service: base
       healthcheck:
         test: ["CMD", "true"]
   ```

   The endpoint points to `owner`.

   Current validation checks `owner.network_mode`, sees `undefined`, and accepts it. At Compose resolution time, `owner` inherits `network_mode: none`, making the endpoint owner unreachable through Builder's network.

   The reverse is also broken: if `base` supplies a valid healthcheck and `owner` inherits it, Builder currently sees no direct `owner.healthcheck` and rejects a configuration whose effective Compose service is healthy.

   The code now handles the **reference rename** but not inherited semantics. Pasted text(3) V2 requires endpoint owners to be reachable and to have a valid effective healthcheck. Pasted text(3)

   **Failing tests:** add both:
   - owner inherits `network_mode: none` → expect failure;
   - owner inherits valid healthcheck → expect success.

   Current behavior is reversed/incomplete in both cases.

   **Expected behavior:** validation is based on the effective Compose service after same-file `extends` inheritance.

   **Fix:** resolve/flatten same-file `extends` before endpoint-owner validation and before namespacing. Detect extends cycles while doing so. Then validate the effective service model.

10. **MEDIUM-HIGH — Remote Docker build contexts are incorrectly rewritten as local filesystem paths.**

   **Bug:** the path rebaser treats every string `build` or `build.context` as a local path. Pasted text(3)

   A valid Compose dependency:
   ```yaml
   services:
     owner:
       build:
         context: https://github.com/example/repository.git
   ```
   becomes a local path under the dependency Compose directory.

   The V2 dependency contract explicitly allows dependencies to use `build:` internally. Pasted text(3)

   **Failing unit test:**
   ```ts
   it("preserves remote build contexts", () => {
     const result = rebaseComposePaths(
       {
         services: {
           owner: {
             build: {
               context: "https://github.com/acme/example.git",
             },
           },
         },
       },
       "/project/.docker/dependency.yml",
       "/project",
     );

     expect((result.services.owner?.build as any).context)
       .toBe("https://github.com/acme/example.git");
   });
   ```
   Current result is filesystem-rebased.

   **Expected behavior:** only relative filesystem paths are rebased.

   **Fix:** classify build contexts first. Preserve URL/Git/URI contexts such as `https://`, `git://`, `ssh://`, and supported Git SCP forms. Rebase only actual filesystem paths.

11. **HIGH — Build-time Compose resource references are not namespaced, and global tester resource discovery misses them.**

   **Bug:** dependency namespacing rewrites runtime `volumes`, `configs`, `secrets`, networks, lifecycle refs, etc., but never traverses `service.build`. Pasted text(3)

   For:
   ```yaml
   services:
     owner:
       build:
         context: .
         secrets:
           - npm-token

   secrets:
     npm-token:
       file: ./npm-token.txt
   ```
   the top-level secret becomes something like:
   ```text
   dep--db--secret--npm-token
   ```
   while:
   ```yaml
   build.secrets:
     - npm-token
   ```
   remains unchanged.

   That breaks the final Compose build. V2 permits dependency Compose to use both `build:` and secrets and requires relevant internal references to be rewritten consistently. Pasted text(3)

   The same problem exists in the global tester. Its resource collector checks service volumes, networks, runtime configs and runtime secrets, but not `build.secrets`. Pasted text(3) The tester contract explicitly says the tester Compose owns its Docker build configuration. Pasted text(3)

   **Failing tests:** one for dependency namespacing:
   ```ts
   expect(
     (out.document.services["dep--db--owner"]!.build as any)
       .secrets,
   ).toEqual(["dep--db--secret--npm-token"]);
   ```
   and one tester test asserting the selected tester result still contains the top-level secret required by `runner.build.secrets`.

   Both currently fail.

   **Expected behavior:** any namespaced top-level resource referenced from a service build remains resolvable after composition.

   **Fix:** add a shared `rewriteBuildReferences()` covering at least:
   - `build.secrets`;
   - long-form build secret `source`;
   - service-valued `additional_contexts` if supported.

   The tester's referenced-resource collector must inspect those same fields before reducing the tester Compose implementation.

12. **HIGH — Global tester dependency closure is incomplete, and array-form runner `depends_on` is later discarded.**

   There are actually two directly related tester defects.

   First, tester closure discovery considers only:
   - `depends_on`;
   - `links`;
   - `volumes_from`;
   - `network_mode: service:...`.

   Pasted text(3)

   It misses references such as:
   ```yaml
   ipc: service:browser
   pid: service:browser
   extends:
     service: base
   ```
   even though the shared dependency namespace implementation now understands those forms.

   Second, if the selected runner uses normal short-form:
   ```yaml
   depends_on:
     - browser
   ```
   it is correctly used during closure discovery, but after namespacing this code creates a fresh object whenever `depends_on` is an array, thereby throwing away the browser edge before adding top-level-app health edges. Pasted text(3)

   The tester spec requires Builder to materialize the tester implementation needed by the selected runner. Pasted text(3)

   **Failing test A:**
   ```yaml
   services:
     runner:
       image: test-runner
       ipc: service:browser
     browser:
       image: browser
   ```
   Assert browser is present and `runner.ipc` points to its generated name. Current closure omits browser.

   **Failing test B:**
   ```yaml
   services:
     runner:
       image: test-runner
       depends_on:
         - browser
     browser:
       image: browser
   ```
   After compile, assert runner has both:
   ```text
   browser -> original user dependency semantics
   app(s)  -> service_healthy
   ```
   Current code loses the browser relationship.

   **Expected behavior:** user-defined tester-internal relationships survive; Builder only adds its top-level health edges.

   **Fix:** create one shared internal-service-reference collector used by dependency validation, dependency namespacing, and tester closure. Normalize array-form runner `depends_on` into long form before adding Builder health edges, preserving the original short-form semantics.

13. **MEDIUM — The bundled Dockerfile policy incorrectly rejects `HEALTHCHECK NONE` in finite test stages.**

   **Bug:** V2 specifically requires healthchecks for `dev` and `prod`, while `test` and `test-e2e` **do not require healthchecks because they are finite runners**. Pasted text(3)

   The bundled Rego policy has an unconditional rule rejecting every `HEALTHCHECK NONE` instruction in the Dockerfile, regardless of stage. Pasted text(3)

   That prevents a legitimate Dockerfile from disabling an inherited runtime healthcheck in its finite `test` target.

   **Failing policy test:** construct:
   ```dockerfile
   FROM alpine AS base
   HEALTHCHECK CMD true

   FROM base AS dev
   CMD ["sleep", "infinity"]

   FROM base AS test
   HEALTHCHECK NONE
   CMD ["sh", "-c", "exit 0"]

   FROM base AS test-e2e
   HEALTHCHECK NONE
   CMD ["sh", "-c", "exit 0"]

   FROM alpine AS builder
   RUN mkdir -p /artifact && touch /artifact/app

   FROM base AS prod
   COPY --from=builder /artifact /artifact
   CMD ["sleep", "infinity"]
   ```
   Run the real bundled Conftest policy and assert exit 0. It currently fails because of the two `NONE` instructions.

   **Expected behavior:** `HEALTHCHECK NONE` is permitted when it affects only finite test targets; it must still be rejected when the **effective dev or prod healthcheck** becomes disabled.

   **Fix:** make healthcheck validation stage-effective rather than global. Determine the last effective healthcheck in the lineage of `dev` and `prod`; require it to be enabled. Do not globally reject `NONE` instructions belonging solely to `test`, `test-e2e`, or unrelated internal stages.

14. **MEDIUM — The generated `mesh-schema.json` does not enforce mesh service-name rules.**

   **Bug:** the runtime Zod schema correctly says mesh service names must match the Builder identifier grammar and rejects reserved names. Pasted text(3) The docs likewise explicitly require:
   ```text
   ^[a-z][a-z0-9-]*$
   ```
   and reserve `app`, `dependencies`, `tester`, `services`, `dev`, `prod`, `test`, and `e2e`. Pasted text(3)

   But the generated JSON Schema's top-level `services` object has only `additionalProperties`; it has **no `propertyNames` constraint at all**. Pasted text(3)

   The same loss happens for stage service keys. The likely cause is that `zod-to-json-schema` cannot serialize the `.refine()` applied to the record-key schema. The `$schema` field is specifically intended to provide editor/tooling validation. Pasted text(3)

   **Failing test:**
   ```ts
   it("generated mesh schema constrains service keys", () => {
     const schema = JSON.parse(
       readFileSync("schemas/mesh-schema.json", "utf8"),
     );

     const services =
       schema.definitions.MeshJsonV2.properties.services;

     expect(services.propertyNames).toBeDefined();
     expect(services.propertyNames.pattern)
       .toBe("^[a-z][a-z0-9-]*$");
   });
   ```
   It currently fails because `propertyNames` is undefined.

   Also validate reserved names with an actual JSON-Schema validator or explicit generated `not/enum` rules.

   **Expected behavior:** editor validation and runtime validation agree on mesh service identities.

   **Fix:** post-process the generated schema or represent the rule in a JSON-Schema-serializable form. Add explicit `propertyNames` to base/stage `services` and preserve the reserved-name exclusion for service keys and provider/dependsOn values.

## One additional defect I would fix with the above set

There is also a Compose environment-preservation problem worth addressing while touching the composition utilities. `normalizeComposeEnvironment()` converts a pass-through list entry such as:

```yaml
environment:
  - OPTIONAL_TOKEN
```

to the **current Builder process value**, or to the empty string when it is absent. Pasted text(3) Every materialized dependency is passed through that normalization even if its Builder-level dependency env overlay is empty. Pasted text(3)

V2 explicitly says a dependency Compose file may keep its own service environment configuration and Builder dependency env is merely an overlay. Pasted text(3)

I would add:

```ts
delete process.env.OPTIONAL_TOKEN;

const c = compileService("prod", fixtureWithDependency({
  environment: ["OPTIONAL_TOKEN"],
}));

// Must retain Compose pass-through semantics,
// not convert it to OPTIONAL_TOKEN="".
expect(
  c.compose.services["dep--db--owner"]!.environment,
).not.toMatchObject({ OPTIONAL_TOKEN: "" });
```

The fix is to preserve unresolved/pass-through values as Compose values (`null`/bare-list representation) instead of eagerly reading `process.env`.

## Overall status

The implementation is considerably closer than in the previous audit. The core V2 model is now largely correct:

- strict V2 JSON configuration;
- effective-stage resolution;
- explicit endpoint ownership;
- inert dependency semantics;
- atomic local dependency bundles;
- mesh provider substitution;
- provider-reference compatibility;
- private-by-default mesh publication;
- deterministic host-port allocation;
- `service_healthy` Builder lifecycle edges;
- stage-specific E2E runtime;
- service/global tester split;
- symlink-safe Builder-managed paths.

The remaining defects cluster in **advanced Compose preservation and namespacing**, rather than the central V2 architecture.

I would prioritize the remaining work in this order: **#1–#3 override semantics → #5–#9 dependency atomicity/namespacing → #11–#12 tester closure → #13 Dockerfile policy → #14 generated schema**. The override bugs are especially important because #1 means a configuration essentially identical to the documented nested override + build-args example can currently fail.