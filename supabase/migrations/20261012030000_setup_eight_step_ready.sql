-- Readable remap marker for the 8-step setup gate.
-- Returns true only after 20261011224500_setup_step_nine_remap wrote
-- private.migration_markers.key = 'setup_step_nine_remap'.
-- Safe to apply BEFORE that remap (Cos file 8, ahead of remap): a missing
-- markers table or a missing row is false, never an error.
-- Does not change any household row. Does not wake the bot.
-- Apply on DIY projects AND on the managed (btve) database. Same bytes in both repos.

create or replace function public.setup_eight_step_ready()
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  return exists (
    select 1
    from private.migration_markers
    where key = 'setup_step_nine_remap'
  );
exception
  when undefined_table then
    return false;
end;
$$;

revoke all on function public.setup_eight_step_ready() from public, anon;
grant execute on function public.setup_eight_step_ready() to authenticated, service_role;

comment on function public.setup_eight_step_ready() is
  'True only after setup_step_nine_remap is marked. App uses this to switch 7-step vs 8-step numbering.';
