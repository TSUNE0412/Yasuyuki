alter table public.minna_members add column if not exists member_id uuid default gen_random_uuid();
update public.minna_members set member_id = user_id where member_id is null;
alter table public.minna_members alter column member_id set not null;
alter table public.minna_members alter column user_id drop not null;
alter table public.minna_members drop constraint if exists minna_members_pkey;
alter table public.minna_members add primary key (team_id, member_id);
alter table public.minna_members drop constraint if exists minna_members_team_id_user_id_key;
alter table public.minna_members add unique (team_id, user_id);
alter table public.minna_tasks drop constraint if exists minna_tasks_assigned_to_fkey;

create or replace function public.create_minna_team(team_name text, member_name text, app_name text, app_mark text)
returns table(id uuid, invite_code text)
language plpgsql security definer set search_path = public
as $$
declare new_team public.minna_teams;
begin
  insert into public.minna_teams(name, app_name, app_mark, created_by)
  values (team_name, app_name, app_mark, auth.uid()) returning * into new_team;
  insert into public.minna_members(team_id, member_id, user_id, display_name) values (new_team.id, auth.uid(), auth.uid(), member_name);
  return query select new_team.id, new_team.invite_code;
end $$;

create or replace function public.join_minna_team(invite text, member_name text)
returns table(id uuid, invite_code text)
language plpgsql security definer set search_path = public
as $$
declare found_team public.minna_teams;
begin
  select * into found_team from public.minna_teams where minna_teams.invite_code = invite;
  if found_team.id is null then raise exception '招待リンクが無効です'; end if;
  if (select count(*) from public.minna_members where team_id = found_team.id) >= 4
    and not exists (select 1 from public.minna_members where team_id = found_team.id and user_id = auth.uid())
  then raise exception 'メンバー数は4人までです'; end if;
  insert into public.minna_members(team_id, member_id, user_id, display_name) values (found_team.id, auth.uid(), auth.uid(), member_name)
  on conflict (team_id, user_id) do update set display_name = excluded.display_name;
  return query select found_team.id, found_team.invite_code;
end $$;

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
  if (select user_id from public.minna_members where team_id = target_team and member_id = target_member) is not null then
    raise exception '招待リンクで参加した本人は削除できません';
  end if;
  update public.minna_tasks set assigned_to = null where team_id = target_team and assigned_to = target_member;
  delete from public.minna_members where team_id = target_team and member_id = target_member;
end $$;

revoke execute on function public.add_minna_member(uuid, text) from public;
revoke execute on function public.rename_minna_member(uuid, uuid, text) from public;
revoke execute on function public.delete_minna_member(uuid, uuid) from public;
grant execute on function public.add_minna_member(uuid, text) to authenticated;
grant execute on function public.rename_minna_member(uuid, uuid, text) to authenticated;
grant execute on function public.delete_minna_member(uuid, uuid) to authenticated;
