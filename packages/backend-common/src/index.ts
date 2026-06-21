import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({
  path: path.resolve(__dirname, "../.env"),
});

export const JWT_SECRET = process.env.JWT_SECRET || "";

if (!JWT_SECRET) {
  if (process.env.NODE_ENV === "production") {
    throw new Error("FATAL: JWT_SECRET environment variable is missing or empty in production.");
  }
  console.warn("WARNING: JWT_SECRET environment variable is not defined. Defaulting to insecure fallback.");
}
