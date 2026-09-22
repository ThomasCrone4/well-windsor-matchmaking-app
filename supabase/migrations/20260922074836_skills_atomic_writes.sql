-- POLISH-4, part 1d: rewrite a row's skills in ONE transaction.
--
-- Additive: nothing calls these until the next client deploy.
--
-- Why they exist. The client rewrote skills the way both role forms rewrite
-- timeblocks -- delete every row, then insert the new set. Over PostgREST
-- that is two HTTP requests and therefore TWO TRANSACTIONS, so between them
-- the row genuinely has no skills. Nothing noticed while the rule lived in a
-- CHECK on a text column. It would break the moment the public-profile rule
-- becomes a trigger reading volunteer_skills: the DELETE commits a state
-- where a public volunteer has zero skills, the deferred trigger fires on
-- that commit, and saving your profile fails.
--
-- One function, one transaction, and a deferred trigger sees only the end
-- state. This also removes a partial-failure mode that was always there: a
-- DELETE that succeeded followed by an INSERT that did not would have left
-- somebody with no skills at all.
--
-- SECURITY INVOKER (the default) on purpose: RLS still decides who may write
-- what. These make the write atomic, they do not widen it.

create or replace function public.set_volunteer_skills(p_skill_ids uuid[])
returns void
language plpgsql
set search_path = public
as $$
declare
  v_id uuid := auth.uid();
begin
  if v_id is null then
    raise exception 'Not signed in' using errcode = '42501';
  end if;

  -- No p_volunteer_id parameter, deliberately: there is nothing to point at
  -- somebody else. The same reasoning as delete-account taking no user id.
  delete from public.volunteer_skills where volunteer_id = v_id;

  insert into public.volunteer_skills (volunteer_id, skill_id)
  select v_id, s.id
    from public.skills s
   where s.id = any(coalesce(p_skill_ids, '{}'::uuid[]))
  on conflict do nothing;
end;
$$;

create or replace function public.set_opportunity_skills(
  p_opportunity_id uuid,
  p_skill_ids uuid[]
)
returns void
language plpgsql
set search_path = public
as $$
begin
  -- The row policy on opportunity_skills already restricts this to the owning
  -- organisation. Checked here too so the refusal is a sentence rather than a
  -- silent no-op: a DELETE matching zero rows is indistinguishable from one
  -- that was blocked (trap 2).
  if not exists (
    select 1 from public.volunteer_opportunities o
     where o.id = p_opportunity_id and o.org_id = auth.uid()
  ) then
    raise exception 'That role is not yours' using errcode = '42501';
  end if;

  delete from public.opportunity_skills where opportunity_id = p_opportunity_id;

  insert into public.opportunity_skills (opportunity_id, skill_id)
  select p_opportunity_id, s.id
    from public.skills s
   where s.id = any(coalesce(p_skill_ids, '{}'::uuid[]))
  on conflict do nothing;
end;
$$;

-- Trap 1: EXECUTE is granted to PUBLIC by default and anon inherits it.
revoke all on function public.set_volunteer_skills(uuid[]) from public, anon;
revoke all on function public.set_opportunity_skills(uuid, uuid[]) from public, anon;
grant execute on function public.set_volunteer_skills(uuid[]) to authenticated;
grant execute on function public.set_opportunity_skills(uuid, uuid[]) to authenticated;
