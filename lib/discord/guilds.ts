import type { DiscordGuild } from "@/lib/spaces/types";

type DiscordGuildResponse = {
  id?: unknown;
  name?: unknown;
  icon?: unknown;
  owner?: unknown;
};

export async function fetchDiscordGuilds(providerToken: string): Promise<DiscordGuild[]> {
  const response = await fetch("https://discord.com/api/v10/users/@me/guilds?limit=200", {
    headers: { Authorization: `Bearer ${providerToken}` },
    cache: "no-store"
  });

  if (!response.ok) {
    throw new Error(
      response.status === 401 || response.status === 403
        ? "Discordのサーバー一覧を取得できません。いったんログアウトし、再度Discord認証してください。"
        : `Discord API error (${response.status})`
    );
  }

  const body = (await response.json()) as DiscordGuildResponse[];

  return body.flatMap((guild) => {
    if (typeof guild.id !== "string" || typeof guild.name !== "string") return [];
    const icon = typeof guild.icon === "string" ? guild.icon : null;
    return [{
      id: guild.id,
      name: guild.name,
      iconUrl: icon ? `https://cdn.discordapp.com/icons/${guild.id}/${icon}.png?size=64` : null,
      owner: guild.owner === true
    }];
  });
}
