begin;
\ir ../dev/seed_demo_helpers.sql
select public.reset_demo_data();
select public.seed_demo_data();
commit;
