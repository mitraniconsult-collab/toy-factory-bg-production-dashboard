-- Run this in the SQL editor of the NEW Toy Factory Supabase project.
-- Safe to re-run: creates the table when missing and adds new dashboard columns when upgrading.

create extension if not exists pgcrypto;

create table if not exists public.toy_projects (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  model_kind text not null default 'pop',
  prototype_task_id text not null,
  preview_url text,
  preview_storage_path text,
  size_cm integer not null check (size_cm in (10, 15, 20)),
  price_eur numeric(10,2) not null check (price_eur >= 0),

  status text not null default 'CHECKOUT_CREATED',

  shopify_cart_id text,
  shopify_order_id text,
  shopify_order_name text,
  shopify_webhook_id text,
  paid_at timestamptz,

  customer_name text,
  customer_email text,
  shipping_city text,

  build_task_id text,
  resize_task_id text,
  print_task_id text,
  glb_url text,
  glb_storage_path text,
  three_mf_url text,
  three_mf_storage_path text,

  production_notes text,
  tracking_number text,
  last_error text
);

-- Upgrade columns for an existing MVP database.
alter table public.toy_projects add column if not exists model_kind text not null default 'pop';
alter table public.toy_projects add column if not exists preview_storage_path text;
alter table public.toy_projects add column if not exists customer_name text;
alter table public.toy_projects add column if not exists customer_email text;
alter table public.toy_projects add column if not exists shipping_city text;
alter table public.toy_projects add column if not exists resize_task_id text;
alter table public.toy_projects add column if not exists print_task_id text;
alter table public.toy_projects add column if not exists glb_storage_path text;
alter table public.toy_projects add column if not exists three_mf_storage_path text;
alter table public.toy_projects add column if not exists production_notes text;
alter table public.toy_projects add column if not exists tracking_number text;
alter table public.toy_projects alter column preview_url drop not null;
alter table public.toy_projects add column if not exists alert_sent_at timestamptz;
alter table public.toy_projects add column if not exists shopify_fulfillment_id text;
alter table public.toy_projects add column if not exists tracking_company text;
alter table public.toy_projects add column if not exists print_palette jsonb;
alter table public.toy_projects add column if not exists assets_purged_at timestamptz;

alter table public.toy_projects drop constraint if exists toy_projects_model_kind_check;
alter table public.toy_projects add constraint toy_projects_model_kind_check check (
  model_kind in ('pop', 'mini', 'brick')
);

-- Replace the old status constraint if it exists.
alter table public.toy_projects drop constraint if exists toy_projects_status_check;
alter table public.toy_projects add constraint toy_projects_status_check check (
  status in (
    'CHECKOUT_CREATED',
    'CHECKOUT_FAILED',
    'PAID_BUILD_STARTING',
    'BUILD_SUBMITTING',
    '3D_GENERATING',
    'BUILD_FAILED',
    'MODEL_RESIZE_SUBMITTING',
    'MODEL_RESIZING',
    'PRINT_FILE_SUBMITTING',
    'PRINT_FILE_GENERATING',
    'PRINT_FILE_FAILED',
    'READY_FOR_PRINT',
    'PRINTING',
    'PRINTED',
    'PACKED',
    'SHIPPED',
    'CANCELLED'
  )
);

create index if not exists toy_projects_status_idx
  on public.toy_projects (status, created_at desc);

create index if not exists toy_projects_shopify_order_idx
  on public.toy_projects (shopify_order_id);

alter table public.toy_projects enable row level security;

comment on table public.toy_projects is
  'Internal production state for POPME custom 3D figure orders. Server-side service-role access only.';

-- Private bucket for durable production assets. Service-role uploads files from Meshy.
insert into storage.buckets (id, name, public)
values ('toy-assets', 'toy-assets', false)
on conflict (id) do update set public = false;

-- Durable server-side rate limiting for paid external APIs such as Meshy preview.
create table if not exists public.api_rate_limits (
  scope text not null,
  key_hash text not null,
  window_start timestamptz not null,
  request_count integer not null default 1 check (request_count >= 0),
  updated_at timestamptz not null default now(),
  primary key (scope, key_hash)
);

alter table public.api_rate_limits enable row level security;

create or replace function public.consume_api_rate_limit(
  p_scope text,
  p_key_hash text,
  p_window_seconds integer,
  p_limit integer
)
returns table(allowed boolean, remaining integer, reset_at timestamptz)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_now timestamptz := now();
  v_row public.api_rate_limits%rowtype;
begin
  if p_window_seconds <= 0 or p_limit <= 0 then
    raise exception 'Invalid rate limit configuration';
  end if;

  insert into public.api_rate_limits(scope, key_hash, window_start, request_count, updated_at)
  values (p_scope, p_key_hash, v_now, 1, v_now)
  on conflict (scope, key_hash) do update
  set
    window_start = case
      when public.api_rate_limits.window_start + make_interval(secs => p_window_seconds) <= v_now then v_now
      else public.api_rate_limits.window_start
    end,
    request_count = case
      when public.api_rate_limits.window_start + make_interval(secs => p_window_seconds) <= v_now then 1
      else public.api_rate_limits.request_count + 1
    end,
    updated_at = v_now
  returning * into v_row;

  allowed := v_row.request_count <= p_limit;
  remaining := greatest(p_limit - v_row.request_count, 0);
  reset_at := v_row.window_start + make_interval(secs => p_window_seconds);
  return next;
end;
$$;

revoke all on function public.consume_api_rate_limit(text, text, integer, integer) from public;
revoke all on function public.consume_api_rate_limit(text, text, integer, integer) from anon, authenticated;
grant execute on function public.consume_api_rate_limit(text, text, integer, integer) to service_role;
