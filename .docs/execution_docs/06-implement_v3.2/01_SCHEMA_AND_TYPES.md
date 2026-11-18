# 01 — Schema and types

Files touched: `src/types/index.ts`, `src/core/config/types.ts`, `src/core/buildSchema.ts`, `scripts/generate-schemas.ts`, `schemas/build-schema.json` (generated).

---

## Step 1.1 — Public types (`src/types/index.ts`)

Replace:

```ts
export interface BuildStage { services?: Record<string, MainOverlay | TesterOverlay | OrdinaryOverlay> }
export interface BuildJson {
  $schema?: string; name: string;
  services: Record<string, MainService | TesterService | OrdinaryService> & { main: MainService; tester: TesterService };
  dev?: BuildStage; prod?: BuildStage; test?: BuildStage; e2e?: BuildStage;
}
```

with:

```ts
export interface BuildStage { services?: Record<string, MainOverlay | TesterOverlay | OrdinaryOverlay> }
/** Overlay applied after `dev` or `test` only when the run's INFRA_MODE is isolated. */
export interface IsolatedInfraOverlay { services?: Record<string, MainOverlay | OrdinaryOverlay> }
export interface IsolatableBuildStage extends BuildStage { "on-inframode-isolated"?: IsolatedInfraOverlay }
export interface BuildJson {
  $schema?: string; name: string;
  services: Record<string, MainService | TesterService | OrdinaryService> & { main: MainService; tester: TesterService };
  dev?: IsolatableBuildStage; prod?: BuildStage; test?: IsolatableBuildStage; e2e?: BuildStage;
}
```

## Step 1.2 — Origin flag (`src/core/config/types.ts`)

Replace:

```ts
export type Origin = { sourceFile: string; configPath: string; projectDir: string; scope: "build" | "mesh"; meshRoot?: string; layer: "base" | ConfigStage };
```

with:

```ts
export type Origin = { sourceFile: string; configPath: string; projectDir: string; scope: "build" | "mesh"; meshRoot?: string; layer: "base" | ConfigStage; isolatedOverlay?: true };
```

## Step 1.3 — Zod schemas (`src/core/buildSchema.ts`)

Replace the whole `buildStageSchema` declaration:

```ts
export const buildStageSchema = z.object({ services: z.record(identifier, z.unknown()).superRefine((value, context) => {
  for (const [key, entry] of Object.entries(value)) {
    const schema = key === "main" ? mainOverlaySchema : key === "tester" ? testerOverlaySchema : ordinaryOverlaySchema;
    const parsed = schema.safeParse(entry);
    if (!parsed.success) for (const issue of parsed.error.issues) context.addIssue({ ...issue, path: [key, ...issue.path] });
  }
}).optional() }).strict();
```

with:

```ts
const overlayServices = (allowTester: boolean) => z.record(identifier, z.unknown()).superRefine((value, context) => {
  for (const [key, entry] of Object.entries(value)) {
    if (key === "tester" && !allowTester) { context.addIssue({ code: "custom", path: [key], message: "tester cannot be configured in on-inframode-isolated" }); continue; }
    const schema = key === "main" ? mainOverlaySchema : key === "tester" ? testerOverlaySchema : ordinaryOverlaySchema;
    const parsed = schema.safeParse(entry);
    if (!parsed.success) for (const issue of parsed.error.issues) context.addIssue({ ...issue, path: [key, ...issue.path] });
  }
});
export const buildStageSchema = z.object({ services: overlayServices(true).optional() }).strict();
export const isolatedInfraOverlaySchema = z.object({ services: overlayServices(false).optional() }).strict();
export const isolatableBuildStageSchema = z.object({ services: overlayServices(true).optional(), "on-inframode-isolated": isolatedInfraOverlaySchema.optional() }).strict();
```

Then, in `buildJsonSchema`, replace:

```ts
dev: buildStageSchema.optional(), prod: buildStageSchema.optional(), test: buildStageSchema.optional(), e2e: buildStageSchema.optional()
```

with:

```ts
dev: isolatableBuildStageSchema.optional(), prod: buildStageSchema.optional(), test: isolatableBuildStageSchema.optional(), e2e: buildStageSchema.optional()
```

Do not export the new schemas from `src/index.ts`.

## Step 1.4 — JSON schema generator (`scripts/generate-schemas.ts`)

Replace:

```js
const buildServices=(overlay=false)=>({type:"object",properties:{main:main(overlay),tester:tester(overlay)},patternProperties:{[servicePattern]:ordinary(overlay)},propertyNames:{pattern:id},required:overlay?[]:["main","tester"],additionalProperties:false});
const buildStage={type:"object",properties:{services:buildServices(true)},additionalProperties:false};
const buildRoot={type:"object",properties:{$schema:{type:"string"},name:string,services:buildServices(),dev:buildStage,prod:buildStage,test:buildStage,e2e:buildStage},required:["name","services"],additionalProperties:false};
```

with:

```js
const buildServices=(overlay=false,allowTester=true)=>({type:"object",properties:{main:main(overlay),...(allowTester?{tester:tester(overlay)}:{})},patternProperties:{[servicePattern]:ordinary(overlay)},propertyNames:{pattern:id},required:overlay?[]:["main","tester"],additionalProperties:false});
const buildStage={type:"object",properties:{services:buildServices(true)},additionalProperties:false};
const isolatedOverlay={type:"object",properties:{services:buildServices(true,false)},additionalProperties:false};
const isolatableBuildStage={type:"object",properties:{services:buildServices(true),"on-inframode-isolated":isolatedOverlay},additionalProperties:false};
const buildRoot={type:"object",properties:{$schema:{type:"string"},name:string,services:buildServices(),dev:isolatableBuildStage,prod:buildStage,test:isolatableBuildStage,e2e:buildStage},required:["name","services"],additionalProperties:false};
```

`tester` inside the block is rejected because it is neither in `properties` nor matched by `servicePattern`, and `additionalProperties` is `false`.

## Step 1.5 — Regenerate and check

```bash
pnpm build:schemas      # rewrites schemas/build-schema.json; mesh-schema.json must be unchanged
git diff --stat schemas # only build-schema.json changes
pnpm typecheck
```

`pnpm typecheck` will report one error in `resolveBuildStage.ts` only if chapter 02 has been partly applied; at this point it must pass.
