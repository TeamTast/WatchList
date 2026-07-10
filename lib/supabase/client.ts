import { createBrowserClient } from "@supabase/ssr";
import { getSupabasePublicConfig } from "@/lib/supabase/config";

export function isSupabaseBrowserConfigured() {
  return Boolean(getSupabasePublicConfig());
}

export function createSupabaseBrowserClient() {
  const config = getSupabasePublicConfig();

  if (!config) {
    return null;
  }

  return createBrowserClient(config.supabaseUrl, config.supabaseKey);
}
