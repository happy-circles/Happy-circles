drop policy if exists user_profiles_select_visible on public.user_profiles;
create policy user_profiles_select_visible
on public.user_profiles
for select
to authenticated
using (
  id = (select auth.uid())
  or exists (
    select 1
    from public.relationships relationship
    where relationship.status = 'active'
      and (
        (
          relationship.user_low_id = (select auth.uid())
          and relationship.user_high_id = user_profiles.id
        )
        or (
          relationship.user_high_id = (select auth.uid())
          and relationship.user_low_id = user_profiles.id
        )
      )
  )
  or exists (
    select 1
    from public.friendship_invites invite
    where (
      invite.inviter_user_id = (select auth.uid())
      and (
        user_profiles.id = invite.target_user_id
        or user_profiles.id = invite.claimant_user_id
      )
    )
    or (
      invite.target_user_id = (select auth.uid())
      and invite.inviter_user_id = user_profiles.id
    )
    or (
      invite.claimant_user_id = (select auth.uid())
      and invite.inviter_user_id = user_profiles.id
    )
  )
  or exists (
    select 1
    from public.account_invites invite
    where (
      invite.inviter_user_id = (select auth.uid())
      and invite.activated_user_id = user_profiles.id
    )
    or (
      invite.activated_user_id = (select auth.uid())
      and invite.inviter_user_id = user_profiles.id
    )
  )
);

drop policy if exists avatars_select_related on storage.objects;
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
    or exists (
      select 1
      from public.account_invites invite
      where (
        invite.inviter_user_id = (select auth.uid())
        and invite.activated_user_id::text = split_part(storage.objects.name, '/', 1)
      )
      or (
        invite.activated_user_id = (select auth.uid())
        and invite.inviter_user_id::text = split_part(storage.objects.name, '/', 1)
      )
    )
  )
);
