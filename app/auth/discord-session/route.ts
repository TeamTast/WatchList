import { NextResponse } from "next/server";
import { clearDiscordOAuthSession } from "@/lib/discord/oauth-session";

export async function DELETE() {
  const response = new NextResponse(null, { status: 204 });
  clearDiscordOAuthSession(response.cookies);
  return response;
}
