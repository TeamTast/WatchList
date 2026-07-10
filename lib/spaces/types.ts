export type SpaceKind = "private" | "discord_guild";

export type DiscordGuild = {
  id: string;
  name: string;
  iconUrl: string | null;
  owner: boolean;
};

export type SpaceSummary = {
  id: string;
  name: string;
  kind: SpaceKind;
  guildId: string | null;
  guildName: string | null;
  role: "owner" | "member";
};

export type SpacesResponse = {
  spaces: SpaceSummary[];
  guilds: DiscordGuild[];
};
