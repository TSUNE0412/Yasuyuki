create extension if not exists pgcrypto;

create table if not exists public.minna_teams (
  id uuid primary key default gen_random_uuid(),
  invite_code text unique not null default encode(gen_random_bytes(8), 'hex'),
  name text not null,
  app_name text not null default 'みんなの仕事',
  app_mark text not null default 'M',
  calendar_embed_url text,
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now()
);

create table if not exists public.minna_members (
  team_id uuid not null references public.minna_teams(id) on delete cascade,
  member_id uuid not null default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
  display_name text not null,
  joined_at timestamptz not null default now(),
  primary key (team_id, member_id),
  unique (team_id, user_id)
);

create table if not exists public.minna_tasks (
  id bigint not null,
  team_id uuid not null references public.minna_teams(id) on delete cascade,
  name text not null,
  assigned_to uuid,
  assignee_ids uuid[] not null default '{}',
  completed_by uuid[] not null default '{}',
  sort_order bigint not null default 0,
  due_date date,
  task_type text not null check (task_type in ('todo', 'routine')),
  done boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (team_id, id)
);

create table if not exists public.minna_access (
  team_id uuid not null references public.minna_teams(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  accessed_at timestamptz not null default now(),
  primary key (team_id, user_id)
);

create index if not exists minna_tasks_team_id_idx on public.minna_tasks(team_id);
create index if not exists minna_members_user_id_idx on public.minna_members(user_id);

alter table public.minna_teams enable row level security;
alter table public.minna_members enable row level security;
alter table public.minna_tasks enable row level security;
alter table public.minna_access enable row level security;

revoke all on public.minna_teams from anon, authenticated;
revoke all on public.minna_members from anon, authenticated;
revoke all on public.minna_tasks from anon, authenticated;
revoke all on public.minna_access from anon, authenticated;
grant select on public.minna_teams to authenticated;
grant update(name, app_name, app_mark, calendar_embed_url) on public.minna_teams to authenticated;
grant select on public.minna_members to authenticated;
grant select, insert, update, delete on public.minna_tasks to authenticated;

create or replace function public.is_minna_member(target_team uuid)
returns boolean language sql stable security definer set search_path = public
as $$
  select exists(select 1 from public.minna_access where team_id = target_team and user_id = auth.uid())
      or exists(select 1 from public.minna_members where team_id = target_team and user_id = auth.uid())
$$;

create policy "members read teams" on public.minna_teams for select using (public.is_minna_member(id));
create policy "members update teams" on public.minna_teams for update using (public.is_minna_member(id));
create policy "members read members" on public.minna_members for select using (public.is_minna_member(team_id));
create policy "members read tasks" on public.minna_tasks for select using (public.is_minna_member(team_id));
create policy "members add tasks" on public.minna_tasks for insert with check (public.is_minna_member(team_id));
create policy "members update tasks" on public.minna_tasks for update using (public.is_minna_member(team_id));
create policy "members delete tasks" on public.minna_tasks for delete using (public.is_minna_member(team_id));

create or replace function public.create_minna_team(team_name text, member_name text, app_name text, app_mark text)
returns table(id uuid, invite_code text)
language plpgsql security definer set search_path = public
as $$
declare new_team public.minna_teams;
begin
  insert into public.minna_teams(name, app_name, app_mark, created_by)
  values (team_name, app_name, app_mark, auth.uid()) returning * into new_team;
  insert into public.minna_access(team_id, user_id) values (new_team.id, auth.uid());
  insert into public.minna_members(team_id, member_id, user_id, display_name) values (new_team.id, auth.uid(), auth.uid(), member_name);
  return query select new_team.id, new_team.invite_code;
end $$;

create or replace function public.join_minna_team(invite text, member_name text)
returns table(id uuid, invite_code text)
language plpgsql security definer set search_path = public
as $$
declare found_team public.minna_teams;
declare existing_member public.minna_members;
begin
  select * into found_team from public.minna_teams where minna_teams.invite_code = invite;
  if found_team.id is null then raise exception '招待リンクが無効です'; end if;
  select * into existing_member from public.minna_members where team_id = found_team.id and display_name = member_name limit 1;
  if existing_member.member_id is not null and existing_member.user_id is distinct from auth.uid() then
    update public.minna_tasks set assigned_to = auth.uid() where team_id = found_team.id and assigned_to = existing_member.member_id;
    update public.minna_members set member_id = auth.uid(), user_id = auth.uid() where team_id = found_team.id and member_id = existing_member.member_id;
    return query select found_team.id, found_team.invite_code;
    return;
  end if;
  if (select count(*) from public.minna_members where team_id = found_team.id) >= 4
    and not exists (select 1 from public.minna_members where team_id = found_team.id and user_id = auth.uid())
  then raise exception 'メンバー数は4人までです'; end if;
  insert into public.minna_members(team_id, member_id, user_id, display_name) values (found_team.id, auth.uid(), auth.uid(), member_name)
  on conflict (team_id, user_id) do update set display_name = excluded.display_name;
  return query select found_team.id, found_team.invite_code;
end $$;

revoke execute on function public.create_minna_team(text, text, text, text) from public;
revoke execute on function public.join_minna_team(text, text) from public;
grant execute on function public.create_minna_team(text, text, text, text) to authenticated;
grant execute on function public.join_minna_team(text, text) to authenticated;

create or replace function public.access_minna_team(invite text)
returns table(id uuid, invite_code text)
language plpgsql security definer set search_path = public
as $$
declare found_team public.minna_teams;
begin
  select * into found_team from public.minna_teams where minna_teams.invite_code = invite;
  if found_team.id is null then raise exception '共有URLが無効です'; end if;
  insert into public.minna_access(team_id, user_id) values (found_team.id, auth.uid())
  on conflict (team_id, user_id) do nothing;
  return query select found_team.id, found_team.invite_code;
end $$;

revoke execute on function public.access_minna_team(text) from public;
grant execute on function public.access_minna_team(text) to authenticated;

create or replace function public.add_minna_member(target_team uuid, member_name text)
returns void language plpgsql security definer set search_path = public
as $$
begin
  if not public.is_minna_member(target_team) then raise exception 'このチームを編集できません'; end if;
  if (select count(*) from public.minna_members where team_id = target_team) >= 4 then raise exception 'メンバー数は4人までです'; end if;
  insert into public.minna_members(team_id, display_name) values (target_team, member_name);
end $$;

create or replace function public.rename_minna_member(target_team uuid, target_member uuid, member_name text)
returns void language plpgsql security definer set search_path = public
as $$
begin
  if not public.is_minna_member(target_team) then raise exception 'このチームを編集できません'; end if;
  update public.minna_members set display_name = member_name where team_id = target_team and member_id = target_member;
end $$;

create or replace function public.delete_minna_member(target_team uuid, target_member uuid)
returns void language plpgsql security definer set search_path = public
as $$
begin
  if not public.is_minna_member(target_team) then raise exception 'このチームを編集できません'; end if;
  update public.minna_tasks
  set assigned_to = null,
      assignee_ids = array_remove(assignee_ids, target_member),
      completed_by = array_remove(completed_by, target_member)
  where team_id = target_team and (assigned_to = target_member or target_member = any(assignee_ids));
  delete from public.minna_members where team_id = target_team and member_id = target_member;
end $$;

revoke execute on function public.add_minna_member(uuid, text) from public;
revoke execute on function public.rename_minna_member(uuid, uuid, text) from public;
revoke execute on function public.delete_minna_member(uuid, uuid) from public;
grant execute on function public.add_minna_member(uuid, text) to authenticated;
grant execute on function public.rename_minna_member(uuid, uuid, text) to authenticated;
grant execute on function public.delete_minna_member(uuid, uuid) to authenticated;

alter publication supabase_realtime add table public.minna_tasks;
alter publication supabase_realtime add table public.minna_members;
alter publication supabase_realtime add table public.minna_teams;
