import "dotenv/config";
import { z } from "zod";
import { serverSchema } from "./schema.js";

const parsedEnv = serverSchema.safeParse(process.env);

if (!parsedEnv.success) {
  console.error(
    `❌ Invalid environment variables:\n${z.prettifyError(parsedEnv.error)}`,
  );
  throw new Error("Invalid environment variables");
}

export const env = parsedEnv.data;
