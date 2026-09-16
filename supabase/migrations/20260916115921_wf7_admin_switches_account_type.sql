-- Workflow 7.3 — ADM-2 and ADM-5: an admin can switch an account between
-- volunteer and organisation, for people who ask.
--
-- This reverses a rule the database enforces twice, and both stay:
--
--   * `authenticated` holds no UPDATE on user_profiles.role — nine named
--     column grants, and role is not one. A client UPDATE is a 42501 before
--     any trigger runs.
--   * `prevent_volunteer_role_change` raises on ANY role change, including
--     from a SECURITY DEFINER function running as the table owner.
--
-- The trigger is NOT disabled and does not learn to trust the owner in
-- general. It now permits a change only when BOTH:
--
--   1. the transaction-local flag `app.account_switch` is 'on' — set by
--      admin_switch_account_type() and nothing else, and switched off again
--      before that function returns. This is the same shape as
--      `app.audit_redaction`, which redact_user_from_audit_log() uses to get
--      past the append-only trigger on audit_logs; and
--   2. current_user is not a browser role. PostgREST gives a client no way
--      to set an arbitrary GUC, but if one ever did, the UPDATE would still
--      be running as `authenticated` and still be refused here.
--
-- What a switch does (ADM-5, as decided on the logic map):
--
--   Volunteer → organisation
--     * starts WAITING FOR APPROVAL (approved_at NULL), like any new org;
--     * their registrations are kept but closed — withdrawn, exactly as
--       INT-4 defines it: the row survives, the organisation stops seeing
--       it and is not told;
--     * the volunteer-only personal fields are cleared: dob, phone, bio,
--       skills, availability. Organisation rows are readable by every
--       signed-in user (the known orgs-are-public exposure) and some of
--       those columns by anon, so leaving them would publish a person's
--       date of birth and phone number the moment an admin clicked. A
--       switch back asks for a date of birth again, which ADM-5 already
--       requires.
--
--   Organisation → volunteer
--     * needs a date of birth, 18 or over — refused here in words, and the
--       user_profiles_min_age CHECK refuses it regardless;
--     * its live roles are closed FIRST, which tells their registrants
--       through the ROLE-2 trigger. Drafts stay drafts: nobody can see them
--       and nothing needs telling. Nothing is removed — removal is terminal
--       and would be wrong if the account is ever switched back;
--     * approval is cleared, so a later switch back waits for approval again.
--
--   Either way, messages sent and received stay: org_outreach, applications
--   and audit_logs lose nothing. The switch itself is audited with the admin
--   who made it.

create or replace function public.prevent_role_change()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if new.role is distinct from old.role
     and not (current_setting('app.account_switch', true) = 'on'
              and current_user not in ('authenticated', 'anon')) then
    raise exception 'An account''s role cannot be changed after signup'
      using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

create or replace function public.admin_switch_account_type(
  p_user_id  uuid,
  p_new_role text,
  p_dob      date default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_profile        public.user_profiles;
  v_roles_closed   integer := 0;
  v_regs_withdrawn integer := 0;
begin
  if not public.is_admin(auth.uid()) then
    raise exception 'Only a Well Windsor admin can switch an account''s type'
      using errcode = '42501';
  end if;

  if p_new_role is null or p_new_role not in ('volunteer', 'organization') then
    raise exception 'An account is either a volunteer or an organisation'
      using errcode = '22023';
  end if;

  select * into v_profile
    from public.user_profiles
   where id = p_user_id
   for update;

  if not found then
    raise exception 'No such account' using errcode = 'P0002';
  end if;

  if v_profile.role = p_new_role then
    raise exception 'That account is already a %',
      case p_new_role when 'organization' then 'organisation' else 'volunteer' end
      using errcode = '22023';
  end if;

  if p_new_role = 'volunteer' then
    if p_dob is null then
      raise exception 'A volunteer account needs a date of birth'
        using errcode = '22023';
    end if;
    if p_dob > (current_date - interval '18 years')::date then
      raise exception 'Volunteers must be 18 or over'
        using errcode = '23514';
    end if;
  end if;

  perform set_config('app.account_switch', 'on', true);

  if p_new_role = 'organization' then
    update public.applications
       set withdrawn_at = now()
     where volunteer_id = p_user_id
       and withdrawn_at is null;
    get diagnostics v_regs_withdrawn = row_count;

    delete from public.volunteer_availability
     where volunteer_id = p_user_id;

    update public.user_profiles
       set role                = 'organization',
           approved_at         = null,
           approved_by         = null,
           dob                 = null,
           contact_number      = null,
           bio                 = null,
           skills              = null,
           available_anytime   = true,
           availability_matrix = null,
           public_profile      = false
     where id = p_user_id;
  else
    update public.volunteer_opportunities
       set status        = 'closed',
           closed_reason = 'The organisation''s account became a volunteer account'
     where org_id = p_user_id
       and status = 'active'
       and deleted_at is null;
    get diagnostics v_roles_closed = row_count;

    update public.user_profiles
       set role           = 'volunteer',
           dob            = p_dob,
           approved_at    = null,
           approved_by    = null,
           public_profile = false
     where id = p_user_id;
  end if;

  perform set_config('app.account_switch', 'off', true);

  perform public.record_audit_event(
    p_action_type      := 'account_type_switched',
    p_actor_kind       := 'admin',
    p_actor_id         := auth.uid(),
    p_target_user_id   := p_user_id,
    p_target_table     := 'user_profiles',
    p_target_record_id := p_user_id,
    p_old_values       := jsonb_build_object('role', v_profile.role,
                                             'approved', v_profile.approved_at is not null),
    p_new_values       := jsonb_build_object('role', p_new_role,
                                             'approved', false),
    p_metadata         := jsonb_build_object('roles_closed', v_roles_closed,
                                             'registrations_withdrawn', v_regs_withdrawn));

  return jsonb_build_object('role', p_new_role,
                            'roles_closed', v_roles_closed,
                            'registrations_withdrawn', v_regs_withdrawn);
end;
$$;

revoke all on function public.admin_switch_account_type(uuid, text, date) from public, anon, authenticated;
grant execute on function public.admin_switch_account_type(uuid, text, date) to authenticated;
