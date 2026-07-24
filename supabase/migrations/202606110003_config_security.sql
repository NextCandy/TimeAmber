alter table public.settings enable row level security;
alter table public.secret_config enable row level security;

revoke all on public.settings, public.secret_config, public.app_config
  from anon, authenticated;

grant select on public.app_config to anon, authenticated;
grant insert, update, delete on public.app_config to authenticated;
