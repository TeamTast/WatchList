import { NextResponse, type NextRequest } from "next/server";
import { resolveRootRelativeRedirect } from "@/lib/http/safe-redirect";
import { persistDiscordOAuthSession } from "@/lib/discord/oauth-session";
import { createSupabaseServerClient, isSupabaseServerConfigured } from "@/lib/supabase/server";

export async function GET(request: NextRequest) {
  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get("code");
  const providerError = requestUrl.searchParams.get("error_description") ?? requestUrl.searchParams.get("error");
  const next = resolveRootRelativeRedirect(requestUrl, requestUrl.searchParams.get("next"));

  if (providerError) {
    return redirectWithError(request, providerError);
  }

  if (!isSupabaseServerConfigured()) {
    return redirectWithError(request, "Supabase is not configured on the server.");
  }

  if (code) {
    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase.auth.exchangeCodeForSession(code);

    if (error) {
      return redirectWithError(request, error.message);
    }

    const response = NextResponse.redirect(next);
    response.headers.set("Cache-Control", "private, no-store");
    persistDiscordOAuthSession(response.cookies, {
      accessToken: data.session?.provider_token ?? undefined,
      refreshToken: data.session?.provider_refresh_token ?? undefined
    });
    return response;
  }

  return redirectWithError(request, "Discord did not return an authorization code.");
}

function redirectWithError(request: NextRequest, message: string) {
  const destination = new URL("/", request.url);
  destination.searchParams.set("auth_error", message);
  return NextResponse.redirect(destination);
}
