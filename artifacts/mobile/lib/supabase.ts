import AsyncStorage from "@react-native-async-storage/async-storage";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { AppState, Platform } from "react-native";

import type { Database } from "@/types/database";

let client: SupabaseClient<Database> | null = null;
let lifecycleConfigured = false;

export function getSupabasePublicConfig() {
  const configuredUrl = process.env.EXPO_PUBLIC_SUPABASE_URL?.trim();
  const url =
    configuredUrl && !configuredUrl.includes("redacted")
      ? configuredUrl
      : undefined;
  const anonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY?.trim();
  return { url, anonKey };
}

export function isSupabaseConfigured(): boolean {
  const { url, anonKey } = getSupabasePublicConfig();
  return Boolean(url && anonKey);
}

function requirePublicConfig() {
  const { url, anonKey } = getSupabasePublicConfig();
  if (!url || !anonKey) {
    throw new Error(
      "Supabase is not configured. Set EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_ANON_KEY.",
    );
  }
  return { url, anonKey };
}

export function getOptionalSupabaseClient(): SupabaseClient<Database> | null {
  return isSupabaseConfigured() ? getSupabaseClient() : null;
}

export function getSupabaseClient(): SupabaseClient<Database> {
  if (client) return client;
  const { url, anonKey } = requirePublicConfig();
  client = createClient<Database>(url, anonKey, {
    auth: {
      storage: AsyncStorage,
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: false,
      flowType: "pkce",
    },
  });
  return client;
}

export function configureSupabaseLifecycle(): () => void {
  if (Platform.OS === "web" || lifecycleConfigured) return () => undefined;
  lifecycleConfigured = true;
  const supabase = getSupabaseClient();
  const subscription = AppState.addEventListener("change", (state) => {
    if (state === "active") supabase.auth.startAutoRefresh();
    else supabase.auth.stopAutoRefresh();
  });

  return () => {
    subscription.remove();
    lifecycleConfigured = false;
  };
}
