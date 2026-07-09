create extension if not exists pgcrypto;

create type public.member_role as enum ('owner', 'editor', 'viewer');
create type public.asset_class as enum ('us_equity', 'jp_equity', 'fx', 'custom_index');
create type public.weighting_mode as enum ('equal', 'custom');

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  discord_id text unique,
  display_name text not null,
  avatar_url text,
  created_at timestamptz not null default now()
);

create table public.workspaces (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  owner_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now()
);

create table public.workspace_members (
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  role public.member_role not null default 'editor',
  joined_at timestamptz not null default now(),
  primary key (workspace_id, user_id)
);

create table public.watchlists (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  name text not null,
  layout_columns int not null default 4 check (layout_columns between 1 and 8),
  created_at timestamptz not null default now()
);

create table public.instruments (
  id uuid primary key default gen_random_uuid(),
  symbol text not null,
  provider_symbol text not null,
  name text not null,
  asset_class public.asset_class not null,
  market text not null,
  currency text not null,
  unique (provider_symbol)
);

create table public.custom_indices (
  id uuid primary key default gen_random_uuid(),
  watchlist_id uuid not null references public.watchlists(id) on delete cascade,
  name text not null,
  base_value numeric not null default 1000,
  weighting public.weighting_mode not null default 'equal',
  created_by uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now()
);

create table public.custom_index_members (
  index_id uuid not null references public.custom_indices(id) on delete cascade,
  instrument_id uuid not null references public.instruments(id) on delete restrict,
  weight numeric not null default 1 check (weight > 0),
  primary key (index_id, instrument_id)
);

create table public.watchlist_items (
  id uuid primary key default gen_random_uuid(),
  watchlist_id uuid not null references public.watchlists(id) on delete cascade,
  instrument_id uuid references public.instruments(id) on delete restrict,
  custom_index_id uuid references public.custom_indices(id) on delete cascade,
  position int not null,
  created_by uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  check (
    (instrument_id is not null and custom_index_id is null)
    or (instrument_id is null and custom_index_id is not null)
  )
);

create table public.invites (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  token text not null unique,
  role public.member_role not null default 'editor',
  expires_at timestamptz,
  created_by uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now()
);

alter table public.profiles enable row level security;
alter table public.workspaces enable row level security;
alter table public.workspace_members enable row level security;
alter table public.watchlists enable row level security;
alter table public.instruments enable row level security;
alter table public.custom_indices enable row level security;
alter table public.custom_index_members enable row level security;
alter table public.watchlist_items enable row level security;
alter table public.invites enable row level security;

create or replace function public.is_workspace_member(target_workspace uuid)
returns boolean
language sql
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.workspace_members
    where workspace_id = target_workspace
      and user_id = auth.uid()
  );
$$;

create or replace function public.can_edit_workspace(target_workspace uuid)
returns boolean
language sql
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.workspace_members
    where workspace_id = target_workspace
      and user_id = auth.uid()
      and role in ('owner', 'editor')
  );
$$;

create policy "profiles are visible to signed in users"
on public.profiles for select
to authenticated
using (true);

create policy "users maintain own profile"
on public.profiles for all
to authenticated
using (id = auth.uid())
with check (id = auth.uid());

create policy "members can read workspace"
on public.workspaces for select
to authenticated
using (public.is_workspace_member(id));

create policy "owners can update workspace"
on public.workspaces for update
to authenticated
using (owner_id = auth.uid())
with check (owner_id = auth.uid());

create policy "members can read memberships"
on public.workspace_members for select
to authenticated
using (public.is_workspace_member(workspace_id));

create policy "owners can manage memberships"
on public.workspace_members for all
to authenticated
using (
  exists (
    select 1
    from public.workspaces
    where workspaces.id = workspace_members.workspace_id
      and workspaces.owner_id = auth.uid()
  )
)
with check (
  exists (
    select 1
    from public.workspaces
    where workspaces.id = workspace_members.workspace_id
      and workspaces.owner_id = auth.uid()
  )
);

create policy "instruments are readable"
on public.instruments for select
to authenticated
using (true);

create policy "members can read watchlists"
on public.watchlists for select
to authenticated
using (public.is_workspace_member(workspace_id));

create policy "editors can manage watchlists"
on public.watchlists for all
to authenticated
using (public.can_edit_workspace(workspace_id))
with check (public.can_edit_workspace(workspace_id));

create policy "members can read custom indices"
on public.custom_indices for select
to authenticated
using (
  exists (
    select 1
    from public.watchlists
    where watchlists.id = custom_indices.watchlist_id
      and public.is_workspace_member(watchlists.workspace_id)
  )
);

create policy "editors can manage custom indices"
on public.custom_indices for all
to authenticated
using (
  exists (
    select 1
    from public.watchlists
    where watchlists.id = custom_indices.watchlist_id
      and public.can_edit_workspace(watchlists.workspace_id)
  )
)
with check (
  exists (
    select 1
    from public.watchlists
    where watchlists.id = custom_indices.watchlist_id
      and public.can_edit_workspace(watchlists.workspace_id)
  )
);

create policy "members can read index members"
on public.custom_index_members for select
to authenticated
using (
  exists (
    select 1
    from public.custom_indices
    join public.watchlists on watchlists.id = custom_indices.watchlist_id
    where custom_indices.id = custom_index_members.index_id
      and public.is_workspace_member(watchlists.workspace_id)
  )
);

create policy "editors can manage index members"
on public.custom_index_members for all
to authenticated
using (
  exists (
    select 1
    from public.custom_indices
    join public.watchlists on watchlists.id = custom_indices.watchlist_id
    where custom_indices.id = custom_index_members.index_id
      and public.can_edit_workspace(watchlists.workspace_id)
  )
)
with check (
  exists (
    select 1
    from public.custom_indices
    join public.watchlists on watchlists.id = custom_indices.watchlist_id
    where custom_indices.id = custom_index_members.index_id
      and public.can_edit_workspace(watchlists.workspace_id)
  )
);

create policy "members can read watchlist items"
on public.watchlist_items for select
to authenticated
using (
  exists (
    select 1
    from public.watchlists
    where watchlists.id = watchlist_items.watchlist_id
      and public.is_workspace_member(watchlists.workspace_id)
  )
);

create policy "editors can manage watchlist items"
on public.watchlist_items for all
to authenticated
using (
  exists (
    select 1
    from public.watchlists
    where watchlists.id = watchlist_items.watchlist_id
      and public.can_edit_workspace(watchlists.workspace_id)
  )
)
with check (
  exists (
    select 1
    from public.watchlists
    where watchlists.id = watchlist_items.watchlist_id
      and public.can_edit_workspace(watchlists.workspace_id)
  )
);

create policy "owners can manage invites"
on public.invites for all
to authenticated
using (
  exists (
    select 1
    from public.workspaces
    where workspaces.id = invites.workspace_id
      and workspaces.owner_id = auth.uid()
  )
)
with check (
  exists (
    select 1
    from public.workspaces
    where workspaces.id = invites.workspace_id
      and workspaces.owner_id = auth.uid()
  )
);
