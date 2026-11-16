import { createClient, type SupabaseClient } from "npm:@supabase/supabase-js@2.57.4";
import { getSupabaseEnv } from "./env.ts";

const baseOptions = {
  auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
} as const;

export function createServiceClient(): SupabaseClient {
  const env = getSupabaseEnv();
  return createClient(env.url, env.serviceRoleKey, baseOptions);
}

export function createUserClient(accessToken: string): SupabaseClient {
  const env = getSupabaseEnv();
  return createClient(env.url, env.anonKey, {
    ...baseOptions,
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
  });
}
