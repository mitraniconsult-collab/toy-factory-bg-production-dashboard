begin;
create or replace function public.reserve_toy_checkout(p_hash text, p_project jsonb)
returns setof public.toy_projects language plpgsql security definer set search_path=public as $$
declare existing_id uuid; new_id uuid;
begin
  perform pg_advisory_xact_lock(hashtextextended(p_hash,0));
  select project_id into existing_id from prototype_claims where task_hash=p_hash;
  if found then
    return query select * from toy_projects where id=existing_id;
    return;
  end if;
  new_id := (p_project->>'id')::uuid;
  insert into toy_projects(id,model_kind,prototype_task_id,preview_url,size_cm,price_eur,expected_variant_id,status)
  values(new_id,p_project->>'model_kind',p_project->>'prototype_task_id',p_project->>'preview_url',
    (p_project->>'size_cm')::integer,(p_project->>'price_eur')::numeric,p_project->>'expected_variant_id','CHECKOUT_FAILED');
  insert into prototype_claims(task_hash,project_id) values(p_hash,new_id);
  return query select * from toy_projects where id=new_id;
end;
$$;
revoke all on function public.reserve_toy_checkout(text,jsonb) from public,anon,authenticated;
grant execute on function public.reserve_toy_checkout(text,jsonb) to service_role;
commit;
