-- Count-only. Expect anon_exec = 0 (peek_join_token intentionally excluded) and reorder_anon = 0.
select count(*) as anon_exec
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname in ('public','private') and p.prokind = 'f'
  and not exists (select 1 from pg_depend d where d.objid = p.oid and d.deptype = 'e')
  and p.proname <> 'peek_join_token'
  and has_function_privilege('anon', p.oid, 'execute');
select has_function_privilege('anon','public.reorder_week_meals(uuid,uuid)','execute')::int as reorder_anon;
