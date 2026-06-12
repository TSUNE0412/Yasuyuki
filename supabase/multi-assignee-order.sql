alter table public.minna_tasks add column if not exists assignee_ids uuid[] not null default '{}';
alter table public.minna_tasks add column if not exists completed_by uuid[] not null default '{}';
alter table public.minna_tasks add column if not exists sort_order bigint not null default 0;

update public.minna_tasks
set assignee_ids = array[assigned_to]
where assigned_to is not null and cardinality(assignee_ids) = 0;

update public.minna_tasks
set completed_by = assignee_ids
where done = true and cardinality(assignee_ids) > 0 and cardinality(completed_by) = 0;

with ordered as (
  select team_id, id, row_number() over (partition by team_id, task_type order by created_at, id) - 1 as position
  from public.minna_tasks
)
update public.minna_tasks task
set sort_order = ordered.position
from ordered
where task.team_id = ordered.team_id and task.id = ordered.id and task.sort_order = 0;

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
