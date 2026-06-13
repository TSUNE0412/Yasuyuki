alter table public.minna_teams add column if not exists calendar_embed_url text;
grant update(name, app_name, app_mark, calendar_embed_url) on public.minna_teams to authenticated;
