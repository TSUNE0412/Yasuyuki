create table if not exists public.minna_access (
  team_id uuid not null references public.minna_teams(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  accessed_at timestamptz not null default now(),
  primary key (team_id, user_id)
);

alter table public.minna_access enable row level security;
revoke all on public.minna_access from anon, authenticated;

insert into public.minna_access(team_id, user_id)
select team_id, user_id from public.minna_members where user_id is not null
on conflict do nothing;

create or replace function public.is_minna_member(target_team uuid)
returns boolean language sql stable security definer set search_path = public
as $$
  select exists(select 1 from public.minna_access where team_id = target_team and user_id = auth.uid())
      or exists(select 1 from public.minna_members where team_id = target_team and user_id = auth.uid())
$$;

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

revoke execute on function public.access_minna_team(text) from public;
grant execute on function public.access_minna_team(text) to authenticated;
