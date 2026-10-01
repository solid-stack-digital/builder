import { createRequire } from "node:module";
import { z } from "zod";

const require = createRequire(import.meta.url);
const pkg = require("../package.json");

// Define a schema that requires version to be a non-empty string
const packageSchema = z.object({
  version: z.string().min(1, "Version string cannot be empty"),
});

// This will throw a clear ZodError if version is missing or invalid
const parsedPkg = packageSchema.parse(pkg);

export const version = parsedPkg.version;