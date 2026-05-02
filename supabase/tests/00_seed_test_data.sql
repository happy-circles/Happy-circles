\set QUIET 1
\pset format unaligned
\pset tuples_only on

drop function if exists public.seed_demo_data();
drop function if exists public.reset_demo_data();
drop function if exists public.trust_demo_devices();

\unset QUIET
select '1..1';
select 'ok 1 - removed local-only demo helper functions after seed';
