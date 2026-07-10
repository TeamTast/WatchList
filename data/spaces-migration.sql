-- Multi-space model. Run after shared-workspace-migration.sql.
-- Guild membership is verified by the server before space_members is changed.

create extension if not exists pgcrypto;

create table if not exists public.spaces (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 60),
  kind text not null check (kind in ('private', 'discord_guild')),
  discord_guild_id text,
  discord_guild_name text,
  owner_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  check (
    (kind = 'private' and discord_guild_id is null and discord_guild_name is null)
    or (kind = 'discord_guild' and discord_guild_id is not null and discord_guild_name is not null)
  )
);

create unique index if not exists spaces_private_name_unique
on public.spaces (owner_id, lower(name)) where kind = 'private';

create unique index if not exists spaces_guild_name_unique
on public.spaces (discord_guild_id, lower(name)) where kind = 'discord_guild';

create table if not exists public.space_members (
  space_id uuid not null references public.spaces(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null default 'member' check (role in ('owner', 'member')),
  joined_at timestamptz not null default now(),
  primary key (space_id, user_id)
);

create table if not exists public.space_state (
  space_id uuid primary key references public.spaces(id) on delete cascade,
  layout jsonb not null default '{}'::jsonb,
  revision bigint not null default 0,
  updated_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now()
);

alter table public.spaces enable row level security;
alter table public.space_members enable row level security;
alter table public.space_state enable row level security;

create or replace function public.is_space_member(target_space uuid)
returns boolean language sql security definer set search_path = public stable
as $$
  select exists (
    select 1 from public.space_members
    where space_id = target_space and user_id = auth.uid()
  );
$$;

revoke all on function public.is_space_member(uuid) from public;
grant execute on function public.is_space_member(uuid) to authenticated;

grant select on public.spaces to authenticated;
grant select on public.space_members to authenticated;
grant select, update on public.space_state to authenticated;

drop policy if exists "members read spaces" on public.spaces;
create policy "members read spaces" on public.spaces for select to authenticated
using (public.is_space_member(id));

drop policy if exists "members read space memberships" on public.space_members;
create policy "members read space memberships" on public.space_members for select to authenticated
using (public.is_space_member(space_id));

drop policy if exists "members read space state" on public.space_state;
create policy "members read space state" on public.space_state for select to authenticated
using (public.is_space_member(space_id));

drop policy if exists "members update space state" on public.space_state;
create policy "members update space state" on public.space_state for update to authenticated
using (public.is_space_member(space_id))
with check (public.is_space_member(space_id) and updated_by = auth.uid());

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'space_state'
  ) then
    alter publication supabase_realtime add table public.space_state;
  end if;
end
$$;
