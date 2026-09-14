begin;
alter table public.toy_projects add column if not exists job_id uuid;
alter table public.toy_projects add column if not exists lease_token uuid;
alter table public.toy_projects add column if not exists lease_until timestamptz;
alter table public.toy_projects add column if not exists job_attempts integer not null default 0;
alter table public.toy_projects add column if not exists retry_count integer not null default 0;
alter table public.toy_projects add column if not exists next_retry_at timestamptz not null default now();
alter table public.toy_projects add column if not exists last_operation text;
alter table public.toy_projects add column if not exists automation_blocked boolean not null default false;
alter table public.toy_projects add column if not exists expected_variant_id text;
alter table public.toy_projects add column if not exists shopify_line_item_id text;
alter table public.toy_projects add column if not exists checkout_url text;
alter table public.toy_projects add column if not exists closed_at timestamptz;
alter table public.toy_projects add column if not exists alert_attempts integer not null default 0;
alter table public.toy_projects add column if not exists alert_next_retry_at timestamptz not null default now();

create table if not exists public.production_events (
  id bigint generated always as identity primary key,
  project_id uuid not null references public.toy_projects(id) on delete cascade,
  created_at timestamptz not null default now(),
  from_status text,
  to_status text not null,
  operation text,
  job_id uuid
);
create index if not exists production_events_project_idx on public.production_events(project_id,id desc);
alter table public.production_events enable row level security;
revoke all on public.production_events from anon, authenticated;
grant select, insert on public.production_events to service_role;
grant usage, select on sequence public.production_events_id_seq to service_role;

create table if not exists public.production_operations (
  operation_key text primary key,
  project_id uuid not null references public.toy_projects(id) on delete cascade,
  status text not null check(status in ('executing','succeeded','unknown')),
  result jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.production_operations enable row level security;
revoke all on public.production_operations from anon, authenticated;
grant select, insert, update on public.production_operations to service_role;

-- A consumed prototype cannot create another checkout, including after erasure.
-- Only a one-way digest remains after project deletion (no images/task URLs).
create table if not exists public.prototype_claims (
  task_hash text primary key,
  project_id uuid references public.toy_projects(id) on delete set null,
  created_at timestamptz not null default now()
);
alter table public.prototype_claims enable row level security;
revoke all on public.prototype_claims from anon, authenticated;
grant select, insert on public.prototype_claims to service_role;

create or replace function public.claim_production_job(p_id uuid, p_token uuid, p_manual boolean default false)
returns setof public.toy_projects language sql security definer set search_path=public as $$
  update public.toy_projects set lease_token=p_token, job_id=p_token,
    lease_until=now()+interval '180 seconds', job_attempts=job_attempts+1
  where id=p_id and (lease_until is null or lease_until < now())
    and (p_manual or (next_retry_at <= now() and not automation_blocked))
  returning *;
$$;
revoke all on function public.claim_production_job(uuid,uuid,boolean) from public, anon, authenticated;
grant execute on function public.claim_production_job(uuid,uuid,boolean) to service_role;

create or replace function public.record_production_event()
returns trigger language plpgsql security definer set search_path=public as $$
begin
  if tg_op='INSERT' then
    insert into production_events(project_id,to_status,operation,job_id)
      values(new.id,new.status,new.last_operation,new.job_id);
  elsif new.status is distinct from old.status or new.last_operation is distinct from old.last_operation then
    insert into production_events(project_id,from_status,to_status,operation,job_id)
      values(new.id,old.status,new.status,new.last_operation,new.job_id);
  end if;
  return new;
end;
$$;
revoke all on function public.record_production_event() from public, anon, authenticated;
drop trigger if exists toy_project_events on public.toy_projects;
create trigger toy_project_events after insert or update on public.toy_projects for each row execute function public.record_production_event();
create index if not exists production_due_idx on public.toy_projects(next_retry_at) where not automation_blocked;
commit;
