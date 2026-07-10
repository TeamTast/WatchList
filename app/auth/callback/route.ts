import { NextResponse, type NextRequest } from "next/server";
import { createSupabaseServerClient, isSupabaseServerConfigured } from "@/lib/supabase/server";

export async function GET(request: NextRequest) {
  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get("code");
  const providerError = requestUrl.searchParams.get("error_description") ?? requestUrl.searchParams.get("error");
  const requestedNext = requestUrl.searchParams.get("next") ?? "/";
  const next = requestedNext.startsWith("/") && !requestedNext.startsWith("//") ? requestedNext : "/";

  if (providerError) {
    return redirectWithError(request, providerError);
  }

  if (!isSupabaseServerConfigured()) {
    return redirectWithError(request, "Supabase is not configured on the server.");
  }

  if (code) {
    const supabase = await createSupabaseServerClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);

    if (error) {
      return redirectWithError(request, error.message);
    }

    return NextResponse.redirect(new URL(next, request.url));
  }

  return redirectWithError(request, "Discord did not return an authorization code.");
}

function redirectWithError(request: NextRequest, message: string) {
  const destination = new URL("/", request.url);
  destination.searchParams.set("auth_error", message);
  return NextResponse.redirect(destination);
}
