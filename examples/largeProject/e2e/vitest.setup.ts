import dotenv from "dotenv";
import * as path from "node:path";

// Load environment variables from .env if present
dotenv.config({
  path: path.resolve(process.cwd(), ".env"),
});
