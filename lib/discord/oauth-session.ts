import { Buffer } from "node:buffer";
import { cookies } from "next/headers";
import type { Session } from "@supabase/supabase-js";
import { DiscordApiError, fetchDiscordGuilds } from "@/lib/discord/guilds";

const accessTokenCookie = "watchlist-discord-access-token";
const refreshTokenCookie = "watchlist-discord-refresh-token";
const discordTokenLifetimeSeconds = 7 * 24 * 60 * 60;
const refreshTokenLifetimeSeconds = 400 * 24 * 60 * 60;

type CookieOptions = {
  httpOnly: boolean;
  maxAge: number;
  path: string;
  sameSite: "lax";
  secure: boolean;
};

type CookieTarget = {
  set(name: string, value: string, options: CookieOptions): void;
};

type DiscordTokenResponse = {
  access_token?: unknown;
  expires_in?: unknown;
  refresh_token?: unknown;
};

export async function fetchDiscordGuildsForSession(session: Session) {
  const cookieStore = await cookies();
  let accessToken = session.provider_token ?? cookieStore.get(accessTokenCookie)?.value;
  let refreshToken = session.provider_refresh_token ?? cookieStore.get(refreshTokenCookie)?.value;

  if (session.provider_token || session.provider_refresh_token) {
    persistDiscordOAuthSession(cookieStore, {
      accessToken: session.provider_token ?? undefined,
      refreshToken: session.provider_refresh_token ?? undefined
    });
  }

  if (accessToken) {
    try {
      return await fetchDiscordGuilds(accessToken);
    } catch (error) {
      if (!(error instanceof DiscordApiError) || error.status !== 401) {
        throw error;
      }
    }
  }

  if (!refreshToken) {
    throw new Error("Discord認証の更新情報がありません。もう一度Discordでログインしてください。");
  }

  const refreshed = await refreshDiscordOAuthToken(refreshToken);
  accessToken = refreshed.accessToken;
  refreshToken = refreshed.refreshToken;
  persistDiscordOAuthSession(cookieStore, {
    accessToken,
    refreshToken,
    expiresIn: refreshed.expiresIn
  });

  return fetchDiscordGuilds(accessToken);
}

export function persistDiscordOAuthSession(
  target: CookieTarget,
  tokens: { accessToken?: string; refreshToken?: string; expiresIn?: number }
) {
  if (tokens.accessToken) {
    target.set(
      accessTokenCookie,
      tokens.accessToken,
      cookieOptions(tokens.expiresIn ?? discordTokenLifetimeSeconds)
    );
  }
  if (tokens.refreshToken) {
    target.set(refreshTokenCookie, tokens.refreshToken, cookieOptions(refreshTokenLifetimeSeconds));
  }
}

export function clearDiscordOAuthSession(target: CookieTarget) {
  target.set(accessTokenCookie, "", cookieOptions(0));
  target.set(refreshTokenCookie, "", cookieOptions(0));
}

async function refreshDiscordOAuthToken(refreshToken: string) {
  const clientId = process.env.DISCORD_CLIENT_ID?.trim();
  const clientSecret = process.env.DISCORD_CLIENT_SECRET?.trim();

  if (!clientId || !clientSecret) {
    throw new Error("Discord認証の自動更新設定がありません。管理者に連絡してください。");
  }

  const response = await fetch("https://discord.com/api/v10/oauth2/token", {
    method: "POST",
    headers: {
      Authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString("base64")}`,
      "Content-Type": "application/x-www-form-urlencoded"
    },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: refreshToken
    }),
    cache: "no-store"
  });

  if (!response.ok) {
    throw new Error("Discord認証を自動更新できませんでした。もう一度Discordでログインしてください。");
  }

  const body = (await response.json()) as DiscordTokenResponse;
  if (typeof body.access_token !== "string" || !body.access_token) {
    throw new Error("Discord認証の更新結果が不正です。もう一度Discordでログインしてください。");
  }

  return {
    accessToken: body.access_token,
    refreshToken: typeof body.refresh_token === "string" && body.refresh_token
      ? body.refresh_token
      : refreshToken,
    expiresIn: typeof body.expires_in === "number" && body.expires_in > 0
      ? body.expires_in
      : discordTokenLifetimeSeconds
  };
}

function cookieOptions(maxAge: number): CookieOptions {
  return {
    httpOnly: true,
    maxAge,
    path: "/",
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production"
  };
}
