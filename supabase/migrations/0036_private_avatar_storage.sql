insert into storage.buckets (id, name, public)
values ('avatars', 'avatars', false)
on conflict (id) do update
set public = false;

revoke update (avatar_path) on public.user_profiles from authenticated;

drop policy if exists avatars_select_public on storage.objects;
drop policy if exists avatars_select_related on storage.objects;
drop policy if exists avatars_insert_own on storage.objects;
drop policy if exists avatars_update_own on storage.objects;
drop policy if exists avatars_delete_own on storage.objects;

create policy avatars_select_related
on storage.objects
for select
to authenticated
using (
  bucket_id = 'avatars'
  and (
    split_part(name, '/', 1) = (select auth.uid())::text
    or exists (
      select 1
      from public.relationships relationship
      where relationship.status = 'active'
        and (
          (
            relationship.user_low_id = (select auth.uid())
            and relationship.user_high_id::text = split_part(storage.objects.name, '/', 1)
          )
          or (
            relationship.user_high_id = (select auth.uid())
            and relationship.user_low_id::text = split_part(storage.objects.name, '/', 1)
          )
        )
    )
    or exists (
      select 1
      from public.friendship_invites invite
      where (
        invite.inviter_user_id = (select auth.uid())
        and split_part(storage.objects.name, '/', 1) in (
          invite.target_user_id::text,
          invite.claimant_user_id::text
        )
      )
      or (
        invite.target_user_id = (select auth.uid())
        and invite.inviter_user_id::text = split_part(storage.objects.name, '/', 1)
      )
      or (
        invite.claimant_user_id = (select auth.uid())
        and invite.inviter_user_id::text = split_part(storage.objects.name, '/', 1)
      )
    )
  )
);
