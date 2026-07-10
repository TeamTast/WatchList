-- Small-group mode: every authenticated app user shares one workspace state row.
-- Keep other Supabase sign-in providers disabled if access must be Discord-only.

create table if not exists public.shared_workspace_state (
  workspace_key text primary key check (workspace_key = 'shared-market-desk'),
  layout jsonb not null default '{}'::jsonb,
  revision bigint not null default 0,
  updated_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now()
);

alter table public.shared_workspace_state enable row level security;

grant select, insert, update on public.shared_workspace_state to authenticated;

drop policy if exists "authenticated users read shared workspace" on public.shared_workspace_state;
create policy "authenticated users read shared workspace"
on public.shared_workspace_state for select
to authenticated
using (true);

drop policy if exists "authenticated users create shared workspace" on public.shared_workspace_state;
create policy "authenticated users create shared workspace"
on public.shared_workspace_state for insert
to authenticated
with check (
  workspace_key = 'shared-market-desk'
  and updated_by = auth.uid()
);

drop policy if exists "authenticated users update shared workspace" on public.shared_workspace_state;
create policy "authenticated users update shared workspace"
on public.shared_workspace_state for update
to authenticated
using (workspace_key = 'shared-market-desk')
with check (
  workspace_key = 'shared-market-desk'
  and updated_by = auth.uid()
);

insert into public.shared_workspace_state (workspace_key)
values ('shared-market-desk')
on conflict (workspace_key) do nothing;

do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'shared_workspace_state'
  ) then
    alter publication supabase_realtime add table public.shared_workspace_state;
  end if;
end
$$;
