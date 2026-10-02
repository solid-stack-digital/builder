import { z } from "zod";

export const meshServiceSchema = z.object({
  path: z.string({ required_error: 'Service "path" is required' }),
  port: z.union([z.number(), z.string()]).optional(),
  provideDependency: z.record(z.string(), z.string()).optional(),
  replaceMocks: z.record(z.string(), z.string()).optional(),
  envOverrides: z.record(z.string(), z.string()).optional(),
  healthcheck: z.any().optional(),
});

export const meshTesterSchema = z.object({
  path: z.string({ required_error: 'Tester "path" is required' }),
  compose: z.string().optional(),
  dockerfile: z.string().optional(),
  policy: z
    .object({
      dockerfile: z.string().optional(),
      compose: z.string().optional(),
    })
    .optional(),
});

export const meshSchema = z.object({
  name: z.string().optional(),
  services: z
    .record(z.string(), meshServiceSchema)
    .refine((services) => Object.keys(services).length > 0, {
      message: 'At least one service must be defined in "services".',
    }),
  dependencies: z
    .record(
      z.string(),
      z.object({
        path: z.string(),
        service: z.string().optional(),
      })
    )
    .optional(),
  tester: meshTesterSchema.optional(),
});
