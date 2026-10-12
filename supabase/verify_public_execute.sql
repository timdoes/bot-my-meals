-- Count-only. Expect anon_exec = 0 and public_exec = 0 (the 4 pre-sign-in functions are excluded).
select
 (select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace
   where n.nspname in ('public','private') and p.prokind='f'
     and not exists (select 1 from pg_depend d where d.objid=p.oid and d.deptype='e')
     and p.proname not in ('peek_join_token','managed_host_gate','managed_unclaimed_checkout','managed_checkout_prefill')
     and has_function_privilege('anon', p.oid, 'execute')) as anon_exec,
 (select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace
   where n.nspname in ('public','private') and p.prokind='f'
     and not exists (select 1 from pg_depend d where d.objid=p.oid and d.deptype='e')
     and p.proname not in ('peek_join_token','managed_host_gate','managed_unclaimed_checkout','managed_checkout_prefill')
     and exists (select 1 from aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a where a.grantee = 0 and a.privilege_type='EXECUTE')) as public_exec,
 (select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace
   where n.nspname in ('public','private') and p.prokind='f'
     and not exists (select 1 from pg_depend d where d.objid=p.oid and d.deptype='e')
     and has_function_privilege('authenticated', p.oid, 'execute')) as auth_exec_total;
-- Run auth_exec_total BEFORE and AFTER applying the follow-up: it must be identical (authenticated loses nothing).
