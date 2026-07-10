export type SupabasePublicConfig = {
  supabaseUrl: string;
  supabaseKey: string;
};

export function getSupabasePublicConfig(): SupabasePublicConfig | null {
  const rawUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY?.trim();

  if (!rawUrl || !supabaseKey || supabaseKey.startsWith("sb_secret_")) {
    return null;
  }

  try {
    const url = new URL(rawUrl);

    if (
      (url.protocol !== "http:" && url.protocol !== "https:") ||
      url.username ||
      url.password ||
      url.search ||
      url.hash ||
      (url.pathname !== "/" && url.pathname !== "")
    ) {
      return null;
    }

    return { supabaseUrl: url.origin, supabaseKey };
  } catch {
    return null;
  }
}
