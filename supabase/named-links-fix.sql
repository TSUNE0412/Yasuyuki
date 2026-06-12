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

create or replace function public.delete_minna_member(target_team uuid, target_member uuid)
returns void language plpgsql security definer set search_path = public
as $$
begin
  if not public.is_minna_member(target_team) then raise exception 'このチームを編集できません'; end if;
  update public.minna_tasks set assigned_to = null where team_id = target_team and assigned_to = target_member;
  delete from public.minna_members where team_id = target_team and member_id = target_member;
end $$;
