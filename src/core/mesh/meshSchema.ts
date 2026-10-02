import { z } from "zod";

export const meshHealthcheckSchema = z.union([
  z
    .object({
      type: z.literal("tcp"),
      port: z.union([z.number(), z.string()]).optional(),
    })
    .strict(),
  z
    .object({
      test: z.union([z.string(), z.array(z.string())]),
      interval: z.string().optional(),
      timeout: z.string().optional(),
      retries: z.number().optional(),
      start_period: z.string().optional(),
      disable: z.boolean().optional(),
    })
    .passthrough(),
]);

export const meshServiceSchema = z
  .object({
    path: z.string({ required_error: 'Service "path" is required' }),
    port: z.union([z.number(), z.string()]).optional(),
    provideDependency: z.record(z.string(), z.string()).optional(),
    replaceMocks: z.record(z.string(), z.string()).optional(),
    envOverrides: z.record(z.string(), z.string()).optional(),
    healthcheck: meshHealthcheckSchema.optional(),
  })
  .strict();

export const meshTesterSchema = z
  .object({
    path: z.string({ required_error: 'Tester "path" is required' }),
    compose: z.string().optional(),
    dockerfile: z.string().optional(),
    policy: z
      .object({
        dockerfile: z.string().optional(),
        compose: z.string().optional(),
      })
      .strict()
      .optional(),
  })
  .strict();

export const meshServiceNameRegex = /^[a-zA-Z0-9][a-zA-Z0-9_.-]*$/;

export const meshSchema = z
  .object({
    name: z.string().optional(),
    services: z
      .record(
        z.string().regex(meshServiceNameRegex, {
          message:
            "Service name must start with a lowercase letter or digit and contain only lowercase letters, digits, '-', '_', or '.'",
        }),
        meshServiceSchema
      )
      .refine((services) => Object.keys(services).length > 0, {
        message: 'At least one service must be defined in "services".',
      }),
    dependencies: z
      .record(
        z.string(),
        z
          .object({
            path: z.string(),
            service: z.string().optional(),
          })
          .strict()
      )
      .optional(),
    tester: meshTesterSchema.optional(),
  })
  .strict();

