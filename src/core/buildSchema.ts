import { z } from "zod";
import { BUILDER_IDENTIFIER_PATTERN, ENDPOINT_SCHEME_PATTERN } from "./config/constants.js";

const identifier = z.string().regex(BUILDER_IDENTIFIER_PATTERN);
const nonblank = z.string().min(1).refine(value => value.trim().length > 0, "must not be blank");
const env = z.record(z.string(), z.string());
const buildArgs = z.record(z.string(), z.string());
const port = z.number().int().min(1).max(65535);
const publicPort = z.union([port, z.literal("AUTO")]);
const requisite = z.enum(["requirement", "dependency", "prerequisite"]);
const requisites = z.record(identifier, requisite);
const requisiteOverlay = z.record(identifier, z.union([requisite, z.literal(false)]));
export const mainEndpointSchema = z.object({ port, publicPort: publicPort.optional(), primary: z.boolean().optional(), scheme: z.string().regex(ENDPOINT_SCHEME_PATTERN).optional() }).strict();
export const serviceEndpointSchema = mainEndpointSchema.extend({ service: nonblank }).strict();
export const mainServiceSchema = z.object({ env: env.optional(), buildArgs: buildArgs.optional(), endpoints: z.record(identifier, mainEndpointSchema).optional(), requisites: requisites.optional(), "override-compose": nonblank.optional() }).strict();
export const testerServiceSchema = z.object({ compose: nonblank, service: nonblank, env: env.optional() }).strict();
export const ordinaryServiceSchema = z.object({ compose: nonblank, service: nonblank.optional(), env: env.optional(), endpoints: z.record(identifier, serviceEndpointSchema).optional(), requisites: requisites.optional() }).strict().refine(value => Boolean(value.service) || Boolean(value.endpoints && Object.keys(value.endpoints).length), "endpoint-less service requires service");
export const mainOverlaySchema = z.object({ env: env.optional(), buildArgs: buildArgs.optional(), endpoints: z.record(identifier, mainEndpointSchema.partial().strict()).optional(), requisites: requisiteOverlay.optional(), "override-compose": nonblank.optional() }).strict();
export const testerOverlaySchema = testerServiceSchema.partial().strict();
export const ordinaryOverlaySchema = z.object({ compose: nonblank.optional(), service: nonblank.optional(), env: env.optional(), endpoints: z.record(identifier, serviceEndpointSchema.partial().strict()).optional(), requisites: requisiteOverlay.optional() }).strict();
export const buildServicesSchema = z.record(identifier, z.unknown()).superRefine((value, context) => {
  for (const required of ["main", "tester"]) if (!(required in value)) context.addIssue({ code: "custom", path: [required], message: `${required} is required` });
  for (const [key, entry] of Object.entries(value)) {
    const schema = key === "main" ? mainServiceSchema : key === "tester" ? testerServiceSchema : ordinaryServiceSchema;
    const parsed = schema.safeParse(entry);
    if (!parsed.success) for (const issue of parsed.error.issues) context.addIssue({ ...issue, path: [key, ...issue.path] });
  }
});
export const buildStageSchema = z.object({ services: z.record(identifier, z.unknown()).superRefine((value, context) => {
  for (const [key, entry] of Object.entries(value)) {
    const schema = key === "main" ? mainOverlaySchema : key === "tester" ? testerOverlaySchema : ordinaryOverlaySchema;
    const parsed = schema.safeParse(entry);
    if (!parsed.success) for (const issue of parsed.error.issues) context.addIssue({ ...issue, path: [key, ...issue.path] });
  }
}).optional() }).strict();
export const buildJsonSchema = z.object({ $schema: z.string().optional(), name: nonblank, services: buildServicesSchema, dev: buildStageSchema.optional(), prod: buildStageSchema.optional(), test: buildStageSchema.optional(), e2e: buildStageSchema.optional() }).strict();
