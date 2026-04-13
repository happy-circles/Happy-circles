do $$
begin
  if not exists (
    select 1
    from pg_type t
    join pg_namespace n on n.oid = t.typnamespace
    join pg_enum e on e.enumtypid = t.oid
    where n.nspname = 'public'
      and t.typname = 'friendship_invite_channel'
      and e.enumlabel = 'remote'
  ) then
    alter type public.friendship_invite_channel add value 'remote';
  end if;
exception
  when duplicate_object then
    null;
end
$$;
