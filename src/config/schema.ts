// @ts-check
import { z } from "zod";

/**
 * Specify your server-side environment variables schema here.
 * This way you can ensure the app isn't built with invalid env vars.
 */
export const serverSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]),
  PGUSER: z.string().min(1),
  POSTGRES_USER: z.string().min(1),
  POSTGRES_PASSWORD: z.string().min(1),
  POSTGRES_DB: z.string().min(1),
  PGPORT: z.coerce.number().default(5432),
  DB_HOST: z.string().min(1),
  PROD_URL: z.string().url().min(1),
  FRONTEND_URL: z.string().url().min(1),
  PORT: z.coerce.number().default(3000),
  GOOGLE_CLIENT_ID: z
    .string()
    .regex(/^\d+-[a-z0-9]+\.apps\.googleusercontent\.com$/),
  GOOGLE_CLIENT_SECRET: z.string().min(1),
});
