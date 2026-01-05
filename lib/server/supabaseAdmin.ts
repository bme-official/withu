import "server-only";

import { createClient } from "@supabase/supabase-js";
import { getServerEnv } from "./env";

let _client: ReturnType<typeof createClient<any>> | null = null;

export function getSupabaseAdmin(): ReturnType<typeof createClient<any>> {
  if (_client) return _client;
  const env = getServerEnv();
  _client = createClient<any>(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
  return _client!;
}


