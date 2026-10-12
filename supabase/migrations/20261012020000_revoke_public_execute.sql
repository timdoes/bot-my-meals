-- Follow-up to 20261011235900_revoke_anon_rpcs.sql.
-- Postgres grants EXECUTE on new functions to PUBLIC by default, and anon is a member of PUBLIC, so
-- "revoke ... from anon" alone left anon able to execute older functions. Revoke from PUBLIC too, and
-- explicitly keep the roles that legitimately call them, exactly as before:
--   authenticated keeps EXECUTE if it had it (directly or through PUBLIC) before this runs;
--   service_role keeps EXECUTE (when the role exists).
-- Trigger functions do not need EXECUTE at fire time, so triggers keep working. Idempotent.
-- Still callable by anon / PUBLIC (untouched): peek_join_token, managed_host_gate,
-- managed_unclaimed_checkout, managed_checkout_prefill (absent on DIY databases: no-op).

do $$
declare
  fn record;
  auth_ok boolean;
  has_service boolean := exists (select 1 from pg_roles where rolname = 'service_role');
begin
  for fn in
    select p.oid as oid, p.oid::regprocedure as sig
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname in ('public', 'private')
      and p.prokind = 'f'
      and not exists (  -- skip extension-owned functions
        select 1 from pg_depend d where d.objid = p.oid and d.deptype = 'e')
      and not (n.nspname = 'public' and p.proname in (
        'peek_join_token', 'managed_host_gate', 'managed_unclaimed_checkout', 'managed_checkout_prefill'))
  loop
    auth_ok := has_function_privilege('authenticated', fn.oid, 'execute');
    execute format('revoke all on function %s from public, anon', fn.sig);
    if auth_ok then
      execute format('grant execute on function %s to authenticated', fn.sig);
    end if;
    if has_service then
      execute format('grant execute on function %s to service_role', fn.sig);
    end if;
  end loop;
end
$$;
