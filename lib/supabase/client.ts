import { createBrowserClient } from "@supabase/ssr";

function getSupabaseBrowserConfig() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    return null;
  }

  try {
    const url = new URL(supabaseUrl);

    if (url.protocol !== "http:" && url.protocol !== "https:") {
      return null;
    }
  } catch {
    return null;
  }

  return { supabaseUrl, supabaseAnonKey };
}

export function isSupabaseBrowserConfigured() {
  return Boolean(getSupabaseBrowserConfig());
}

export function createSupabaseBrowserClient() {
  const config = getSupabaseBrowserConfig();

  if (!config) {
    return null;
  }

  return createBrowserClient(config.supabaseUrl, config.supabaseAnonKey);
}
