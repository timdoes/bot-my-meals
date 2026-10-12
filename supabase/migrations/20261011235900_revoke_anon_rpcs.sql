-- Supabase default privileges grant EXECUTE on new functions to anon, and
-- "revoke ... from public" does not remove that grant. Revoke anon explicitly.
-- Idempotent. Stays callable by anon: peek_join_token(text) (join-link preview) and the three
-- managed (btve) pre-sign-in functions managed_host_gate, managed_unclaimed_checkout,
-- managed_checkout_prefill (absent on DIY databases, so excluding them there is a no-op).

revoke all on function public.reorder_week_meals(uuid, uuid) from public, anon;
grant execute on function public.reorder_week_meals(uuid, uuid) to authenticated;

do $$
declare
  fn record;
begin
  for fn in
    select p.oid::regprocedure as sig
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname in ('public', 'private')
      and p.prokind = 'f'
      and not exists (  -- skip extension-owned functions
        select 1 from pg_depend d where d.objid = p.oid and d.deptype = 'e')
      and not (n.nspname = 'public' and p.proname in (
        'peek_join_token', 'managed_host_gate', 'managed_unclaimed_checkout', 'managed_checkout_prefill'))
  loop
    execute format('revoke all on function %s from anon', fn.sig);
  end loop;
end
$$;

-- Verify (expect 0): functions in public/private that anon can execute, other than peek_join_token.
-- select count(*) as anon_exec
-- from pg_proc p join pg_namespace n on n.oid = p.pronamespace
-- where n.nspname in ('public','private') and p.prokind = 'f'
--   and not exists (select 1 from pg_depend d where d.objid = p.oid and d.deptype = 'e')
--   and p.proname <> 'peek_join_token'
--   and has_function_privilege('anon', p.oid, 'execute');
