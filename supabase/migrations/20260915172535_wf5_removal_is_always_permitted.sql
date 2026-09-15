-- Workflow 5.3, third follow-up — an organisation can always take its own
-- role down.
--
-- A regression introduced by this workflow, found by a probe leaving live
-- throwaway roles behind and then reproduced directly.
--
-- `org_can_crud_their_posts` has a WITH CHECK of roughly
--
--     owns the row AND (status <> 'active' OR is_approved_org(auth.uid()))
--
-- which exists to stop a pending organisation publishing. It is evaluated on
-- the NEW row, and setting `deleted_at` leaves `status` as 'active' — so an
-- organisation whose approval has been withdrawn cannot remove its own role:
--
--     ERROR 42501: new row violates row-level security policy
--
-- That did not matter before, because removal was a hard DELETE and a DELETE
-- policy has only a USING clause, no WITH CHECK. ROLE-1 revoked DELETE, so
-- both routes are now shut and the role is stuck in the table permanently —
-- invisible to the public, but not removable by the only people who would
-- ever want to remove it.
--
-- Taking something down is never the dangerous direction. Publishing is what
-- approval gates, so approval gates publishing and nothing else.

drop policy if exists org_can_crud_their_posts on public.volunteer_opportunities;

create policy org_can_crud_their_posts
  on public.volunteer_opportunities
  for all to authenticated
  using (
    exists (
      select 1 from public.user_profiles
      where user_profiles.id = auth.uid()
        and user_profiles.role = 'organization'
        and user_profiles.id = volunteer_opportunities.org_id
    )
  )
  with check (
    exists (
      select 1 from public.user_profiles
      where user_profiles.id = auth.uid()
        and user_profiles.role = 'organization'
        and user_profiles.id = volunteer_opportunities.org_id
    )
    and (
      -- Removing is always allowed, approved or not.
      deleted_at is not null
      -- Otherwise the original rule: only an approved organisation publishes.
      or status <> 'active'
      or public.is_approved_org(auth.uid())
    )
  );

comment on policy org_can_crud_their_posts on public.volunteer_opportunities is
  'An organisation manages its own roles. Approval gates PUBLISHING only: a '
  'pending or withdrawn organisation may still remove a role (deleted_at), '
  'because taking something down is never the dangerous direction and ROLE-1 '
  'left no DELETE to fall back on.';
