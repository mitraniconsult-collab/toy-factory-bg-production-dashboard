begin;
create table if not exists public.prototype_submissions (
  request_id uuid primary key,
  input_hash text not null,
  task_id text,
  created_at timestamptz not null default now()
);
alter table public.prototype_submissions enable row level security;
revoke all on public.prototype_submissions from public,anon,authenticated;
grant select,insert,update,delete on public.prototype_submissions to service_role;
commit;
