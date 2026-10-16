import { z } from "zod";
import { BUILDER_IDENTIFIER_PATTERN } from "../config/constants.js";
import { mainOverlaySchema, ordinaryOverlaySchema, testerOverlaySchema, testerServiceSchema } from "../buildSchema.js";
const identifier = z.string().regex(BUILDER_IDENTIFIER_PATTERN);
const nonblank = z.string().min(1).refine(value => value.trim().length > 0, "must not be blank");
const meshRequisites=z.record(z.string().regex(/^(?:source\.)?[a-z][a-z0-9-]*$/),z.union([z.enum(["requirement","dependency","prerequisite"]),z.literal(false)]));
const meshMainOverlay=mainOverlaySchema.extend({requisites:meshRequisites.optional()}).strict();
const meshOrdinaryOverlay=ordinaryOverlaySchema.extend({requisites:meshRequisites.optional()}).strict();
const extendsSchema = z.record(identifier, z.unknown()).superRefine((value, context) => {
  for (const [key, entry] of Object.entries(value)) {
    const parsed = (key === "main" ? meshMainOverlay : key === "tester" ? testerOverlaySchema : meshOrdinaryOverlay).safeParse(entry);
    if (!parsed.success) for (const issue of parsed.error.issues) context.addIssue({ ...issue, path: [key, ...issue.path] });
  }
});
export const meshSourceSchema = z.object({ source: nonblank, extends: extendsSchema.optional(), publish: z.array(z.string()).optional() }).strict();
export const meshSourceOverlaySchema = meshSourceSchema.partial().strict();
const services = (overlay: boolean) => z.record(identifier, z.unknown()).superRefine((value, context) => {
  if (!overlay) {
    if (!("tester" in value)) context.addIssue({ code: "custom", path: ["tester"], message: "tester is required" });
    if (!Object.keys(value).some(key => key !== "tester" && key !== "main")) context.addIssue({ code: "custom", message: "at least one source is required" });
  }
  for (const [key, entry] of Object.entries(value)) {
    if (key === "main") { context.addIssue({ code: "custom", path: [key], message: "main is reserved as a mesh source name" }); continue; }
    const parsed = (key === "tester" ? overlay ? testerOverlaySchema : testerServiceSchema : overlay ? meshSourceOverlaySchema : meshSourceSchema).safeParse(entry);
    if (!parsed.success) for (const issue of parsed.error.issues) context.addIssue({ ...issue, path: [key, ...issue.path] });
  }
});
const stage = z.object({ services: services(true).optional() }).strict();
export const meshSchema = z.object({ $schema: z.string().optional(), name: nonblank, services: services(false), dev: stage.optional(), prod: stage.optional(), e2e: stage.optional() }).strict();
