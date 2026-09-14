begin;
alter table public.toy_projects add column if not exists status_changed_at timestamptz;
update public.toy_projects set status_changed_at=coalesce(updated_at,created_at,now()) where status_changed_at is null;
alter table public.toy_projects alter column status_changed_at set default now();
alter table public.toy_projects alter column status_changed_at set not null;
create or replace function public.track_status_clock()
returns trigger language plpgsql set search_path=public as $$
begin
  if new.status is distinct from old.status then new.status_changed_at=now(); end if;
  return new;
end;
$$;
revoke all on function public.track_status_clock() from public,anon,authenticated;
drop trigger if exists toy_project_status_clock on public.toy_projects;
create trigger toy_project_status_clock before update on public.toy_projects for each row execute function public.track_status_clock();
commit;
