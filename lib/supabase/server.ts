import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";

function getSupabaseServerConfig() {
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

export function isSupabaseServerConfigured() {
  return Boolean(getSupabaseServerConfig());
}

export async function createSupabaseServerClient() {
  const config = getSupabaseServerConfig();

  if (!config) {
    throw new Error("Supabase is not configured.");
  }

  const cookieStore = await cookies();

  return createServerClient(
    config.supabaseUrl,
    config.supabaseAnonKey,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) => {
              cookieStore.set(name, value, options);
            });
          } catch {
            // Server Components cannot always mutate cookies. Route handlers can.
          }
        }
      }
    }
  );
}
