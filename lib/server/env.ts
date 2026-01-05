import "server-only";

import { z } from "zod";

const EnvSchema = z.object({
  SUPABASE_URL: z.string().url(),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(20),
  OPENAI_API_KEY: z.string().min(20),
  OPENAI_CHAT_MODEL: z.string().optional(),
});

export type ServerEnv = z.infer<typeof EnvSchema>;

export function getServerEnv(): ServerEnv {
  const parsed = EnvSchema.safeParse(process.env);
  if (!parsed.success) {
    const msg = parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ");
    throw new Error(`Missing/invalid server env: ${msg}`);
  }
  return parsed.data;
}


