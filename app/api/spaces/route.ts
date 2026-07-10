import { NextResponse, type NextRequest } from "next/server";
import { fetchDiscordGuilds } from "@/lib/discord/guilds";
import type { SpaceKind, SpaceSummary } from "@/lib/spaces/types";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";

type SpaceRow = {
  id: string;
  name: string;
  kind: SpaceKind;
  discord_guild_id: string | null;
  discord_guild_name: string | null;
  owner_id: string;
};

type CreateSpaceBody = { name?: unknown; kind?: unknown; guildId?: unknown };

export async function GET() {
  try {
    const context = await getSpaceRequestContext();
    const spaces = await syncAndListSpaces(context);
    return NextResponse.json({ spaces, guilds: context.guilds });
  } catch (error) {
    return spaceErrorResponse(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    const context = await getSpaceRequestContext();
    const body = (await request.json()) as CreateSpaceBody;
    const name = typeof body.name === "string" ? body.name.trim() : "";
    const kind = body.kind === "private" || body.kind === "discord_guild" ? body.kind : null;

    if (!kind || name.length < 1 || name.length > 60) {
      return NextResponse.json({ error: "スペース名は1〜60文字で入力してください。" }, { status: 400 });
    }

    const guild = kind === "discord_guild"
      ? context.guilds.find((item) => item.id === body.guildId)
      : null;

    if (kind === "discord_guild" && !guild) {
      return NextResponse.json({ error: "所属を確認できないDiscordサーバーです。" }, { status: 403 });
    }

    const { data: space, error: insertError } = await context.admin
      .from("spaces")
      .insert({
        name,
        kind,
        owner_id: context.userId,
        discord_guild_id: guild?.id ?? null,
        discord_guild_name: guild?.name ?? null
      })
      .select("id, name, kind, discord_guild_id, discord_guild_name, owner_id")
      .single<SpaceRow>();

    if (insertError || !space) {
      if (insertError?.code === "23505") {
        return NextResponse.json({ error: "同じ名前のスペースが既にあります。" }, { status: 409 });
      }
      throw insertError ?? new Error("スペースを作成できませんでした。");
    }

    try {
      const { error: memberError } = await context.admin.from("space_members").insert({
        space_id: space.id,
        user_id: context.userId,
        role: "owner"
      });
      if (memberError) throw memberError;

      const { error: stateError } = await context.admin.from("space_state").insert({
        space_id: space.id,
        updated_by: context.userId
      });
      if (stateError) throw stateError;
    } catch (error) {
      await context.admin.from("spaces").delete().eq("id", space.id);
      throw error;
    }

    return NextResponse.json({ space: toSpaceSummary(space, "owner") }, { status: 201 });
  } catch (error) {
    return spaceErrorResponse(error);
  }
}

async function getSpaceRequestContext() {
  const supabase = await createSupabaseServerClient();
  const [{ data: userData, error: userError }, { data: sessionData }] = await Promise.all([
    supabase.auth.getUser(),
    supabase.auth.getSession()
  ]);

  if (userError || !userData.user) {
    throw new SpaceApiError("Discordログインが必要です。", 401);
  }

  const providerToken = sessionData.session?.provider_token;
  if (!providerToken) {
    throw new SpaceApiError("Discordの認証情報を更新するため、再ログインしてください。", 401);
  }

  return {
    userId: userData.user.id,
    guilds: await fetchDiscordGuilds(providerToken),
    admin: createSupabaseAdminClient()
  };
}

async function syncAndListSpaces(context: Awaited<ReturnType<typeof getSpaceRequestContext>>) {
  const guildIds = new Set(context.guilds.map((guild) => guild.id));
  const { data: guildSpaces, error: guildSpaceError } = await context.admin
    .from("spaces")
    .select("id, name, kind, discord_guild_id, discord_guild_name, owner_id")
    .eq("kind", "discord_guild");
  if (guildSpaceError) throw guildSpaceError;

  const accessibleGuildSpaces = (guildSpaces as SpaceRow[]).filter(
    (space) => space.discord_guild_id && guildIds.has(space.discord_guild_id)
  );
  const accessibleIds = new Set(accessibleGuildSpaces.map((space) => space.id));

  const { data: currentGuildMemberships, error: membershipError } = await context.admin
    .from("space_members")
    .select("space_id, spaces!inner(kind)")
    .eq("user_id", context.userId)
    .eq("spaces.kind", "discord_guild");
  if (membershipError) throw membershipError;

  const revokedIds = (currentGuildMemberships ?? [])
    .map((membership) => membership.space_id as string)
    .filter((spaceId) => !accessibleIds.has(spaceId));

  if (revokedIds.length) {
    const { error } = await context.admin
      .from("space_members")
      .delete()
      .eq("user_id", context.userId)
      .in("space_id", revokedIds);
    if (error) throw error;
  }

  if (accessibleGuildSpaces.length) {
    const { error } = await context.admin.from("space_members").upsert(
      accessibleGuildSpaces.map((space) => ({
        space_id: space.id,
        user_id: context.userId,
        role: space.owner_id === context.userId ? "owner" : "member"
      })),
      { onConflict: "space_id,user_id" }
    );
    if (error) throw error;
  }

  const { data: memberships, error: listError } = await context.admin
    .from("space_members")
    .select("role, spaces!inner(id, name, kind, discord_guild_id, discord_guild_name, owner_id)")
    .eq("user_id", context.userId);
  if (listError) throw listError;

  return (memberships ?? [])
    .flatMap((membership) => {
      const joined = membership.spaces as unknown as SpaceRow | SpaceRow[];
      const space = Array.isArray(joined) ? joined[0] : joined;
      return space ? [toSpaceSummary(space, membership.role as "owner" | "member")] : [];
    })
    .sort((a, b) => {
      if (a.kind !== b.kind) return a.kind === "private" ? -1 : 1;
      return (a.guildName ?? a.name).localeCompare(b.guildName ?? b.name, "ja");
    });
}

function toSpaceSummary(space: SpaceRow, role: "owner" | "member"): SpaceSummary {
  return {
    id: space.id,
    name: space.name,
    kind: space.kind,
    guildId: space.discord_guild_id,
    guildName: space.discord_guild_name,
    role
  };
}

class SpaceApiError extends Error {
  constructor(message: string, readonly status: number) { super(message); }
}

function spaceErrorResponse(error: unknown) {
  const status = error instanceof SpaceApiError ? error.status : 500;
  const message = error instanceof Error ? error.message : "スペース情報を取得できませんでした。";
  return NextResponse.json({ error: message }, { status });
}
