import { NextResponse, type NextRequest } from "next/server";
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

type RouteContext = { params: Promise<{ spaceId: string }> };

export async function PATCH(request: NextRequest, { params }: RouteContext) {
  try {
    const { spaceId } = await params;
    const context = await getOwnerContext(spaceId);
    const body = (await request.json()) as { name?: unknown };
    const name = typeof body.name === "string" ? body.name.trim() : "";

    if (name.length < 1 || name.length > 60) {
      return NextResponse.json({ error: "スペース名は1〜60文字で入力してください。" }, { status: 400 });
    }

    const { data: space, error } = await context.admin
      .from("spaces")
      .update({ name })
      .eq("id", spaceId)
      .eq("owner_id", context.userId)
      .select("id, name, kind, discord_guild_id, discord_guild_name, owner_id")
      .single<SpaceRow>();

    if (error || !space) {
      if (error?.code === "23505") {
        return NextResponse.json({ error: "同じ名前のスペースが既にあります。" }, { status: 409 });
      }
      throw error ?? new Error("スペース名を変更できませんでした。");
    }

    return NextResponse.json({ space: toSpaceSummary(space) });
  } catch (error) {
    return spaceErrorResponse(error);
  }
}

export async function DELETE(request: NextRequest, { params }: RouteContext) {
  try {
    const { spaceId } = await params;
    const context = await getOwnerContext(spaceId);
    const body = (await request.json()) as { confirmationName?: unknown };
    const confirmationName = typeof body.confirmationName === "string" ? body.confirmationName : "";

    if (confirmationName !== context.space.name) {
      return NextResponse.json({ error: "確認用のスペース名が一致しません。" }, { status: 400 });
    }

    const { error } = await context.admin
      .from("spaces")
      .delete()
      .eq("id", spaceId)
      .eq("owner_id", context.userId);
    if (error) throw error;

    return NextResponse.json({ deletedSpaceId: spaceId });
  } catch (error) {
    return spaceErrorResponse(error);
  }
}

async function getOwnerContext(spaceId: string) {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.getUser();

  if (error || !data.user) {
    throw new SpaceApiError("Discordログインが必要です。", 401);
  }

  const admin = createSupabaseAdminClient();
  const { data: space, error: spaceError } = await admin
    .from("spaces")
    .select("id, name, kind, discord_guild_id, discord_guild_name, owner_id")
    .eq("id", spaceId)
    .maybeSingle<SpaceRow>();

  if (spaceError) throw spaceError;
  if (!space) throw new SpaceApiError("スペースが見つかりません。", 404);
  if (space.owner_id !== data.user.id) {
    throw new SpaceApiError("この操作はスペースのオーナーだけが実行できます。", 403);
  }

  return { userId: data.user.id, admin, space };
}

function toSpaceSummary(space: SpaceRow): SpaceSummary {
  return {
    id: space.id,
    name: space.name,
    kind: space.kind,
    guildId: space.discord_guild_id,
    guildName: space.discord_guild_name,
    role: "owner"
  };
}

class SpaceApiError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
  }
}

function spaceErrorResponse(error: unknown) {
  const status = error instanceof SpaceApiError ? error.status : 500;
  const message = error instanceof Error ? error.message : "スペースを更新できませんでした。";
  return NextResponse.json({ error: message }, { status });
}
