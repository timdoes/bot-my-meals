-- One-time remap of existing households to the 8-step setup scale.
--   old 5 (Stores)   -> 6      old 6 (Budget)  -> 7
--   old 7 (Create)   -> 8      old 8 (done)    -> 9
-- Steps 1-4 are unchanged. Rows already at 9 (finished after 20261011223000) are untouched.
-- GUARDED: a marker row makes a second run a no-op. Without it a re-run would turn
-- "Create meals" (8) into "done" (9). Do NOT remove the marker.
-- Requires 20261011223000_setup_step_nine_expand.sql (check allows 9).
-- Apply on DIY projects AND on the managed (btve) database, immediately before the 8-step
-- app deploys on that database. Same bytes in both repos.

create table if not exists private.migration_markers (
  key text primary key,
  applied_at timestamptz not null default now()
);

revoke all on private.migration_markers from public, anon, authenticated;

do $$
begin
  if not exists (
    select 1 from private.migration_markers where key = 'setup_step_nine_remap'
  ) then
    update public.households
    set setup_step = setup_step + 1
    where setup_step between 5 and 8;

    insert into private.migration_markers (key) values ('setup_step_nine_remap');
  end if;
end $$;
