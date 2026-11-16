import { HttpError } from "./errors.ts";

export function requireEnv(name: string): string {
  const value = Deno.env.get(name)?.trim();
  if (!value) {
    throw new HttpError(500, "CONFIGURATION_ERROR", "A required server configuration is missing.");
  }
  return value;
}

export function getSupabaseEnv() {
  return {
    url: requireEnv("SUPABASE_URL"),
    anonKey: requireEnv("SUPABASE_ANON_KEY"),
    serviceRoleKey: requireEnv("SUPABASE_SERVICE_ROLE_KEY"),
  };
}
