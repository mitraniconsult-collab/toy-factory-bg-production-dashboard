-- Apply after existing migrations; additive and safe to re-run.
begin;
alter table public.toy_projects alter column preview_url drop not null;
revoke all on function public.consume_api_rate_limit(text, text, integer, integer) from public, anon, authenticated;
grant execute on function public.consume_api_rate_limit(text, text, integer, integer) to service_role;
commit;
