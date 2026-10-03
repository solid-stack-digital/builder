import { z } from "zod";

export const buildPolicyConfigSchema = z
  .object({
    dockerfile: z
      .string()
      .optional()
      .describe("Relative path to policy directory for Dockerfile checks"),
    compose: z
      .string()
      .optional()
      .describe("Relative path to policy directory for Compose contract checks"),
  })
  .strict()
  .describe("Policy configurations for infra/contract verification");

export const buildDependencySchema = z
  .object({
    path: z
      .string({ required_error: 'Dependency "path" is required' })
      .describe("Relative path to mock Docker Compose file"),
    service: z
      .string()
      .optional()
      .describe("Target service name in the mock compose file"),
    port: z
      .union([z.number(), z.string()])
      .optional()
      .describe("Host port to map to this dependency locally"),
  })
  .strict()
  .describe("Service dependency specification");

export const buildOverrideSchema = z
  .object({
    path: z
      .string({ required_error: 'Override "path" is required' })
      .describe("Relative path to the environment stage override file"),
  })
  .strict()
  .describe("Environment override specification");

export const buildTesterSchema = z
  .object({
    envOverrides: z
      .record(z.string(), z.string())
      .optional()
      .describe(
        "Environment variable overrides for the individual E2E tester with URL templating"
      ),
  })
  .strict()
  .describe("E2E tester configuration");

export const buildJsonSchema = z
  .object({
    $schema: z
      .string()
      .optional()
      .describe("JSON Schema URL or relative path"),
    name: z.string().optional().describe("Service project name"),
    dockerfile: z
      .string()
      .optional()
      .describe("Relative path to the Dockerfile (defaults to 'Dockerfile')"),
    port: z
      .union([z.number(), z.string()])
      .optional()
      .describe(
        "Host port exposed by this service when listening publicly"
      ),
    policy: buildPolicyConfigSchema.optional(),
    policies: buildPolicyConfigSchema.optional(),
    composeFiles: z
      .array(z.string())
      .optional()
      .describe("Additional compose files to merge"),
    dependencies: z
      .record(z.string(), buildDependencySchema)
      .optional()
      .describe("Service dependencies and mocks"),
    envOverrides: z
      .record(z.string(), z.string())
      .optional()
      .describe("Environment variable overrides for the app service with URL templating"),
    overrides: z
      .record(
        z.enum(["dev", "prod", "test", "e2e"]),
        buildOverrideSchema
      )
      .optional()
      .describe("Stage overrides (dev, prod, test, e2e)"),
    services: z
      .record(z.string(), z.any())
      .optional()
      .describe("Additional Docker Compose service overrides"),
    tester: buildTesterSchema.optional(),
  })
  .strict()
  .describe("Solid Stack service build and deployment configuration");
