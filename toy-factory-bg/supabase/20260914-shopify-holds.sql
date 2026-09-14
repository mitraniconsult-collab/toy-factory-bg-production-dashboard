begin;
create table if not exists public.shopify_order_holds (
  order_id text primary key,
  reason text not null,
  created_at timestamptz not null default now()
);
alter table public.shopify_order_holds enable row level security;
revoke all on public.shopify_order_holds from public, anon, authenticated;
grant all on public.shopify_order_holds to service_role;
commit;
