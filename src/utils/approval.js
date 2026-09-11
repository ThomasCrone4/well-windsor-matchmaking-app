/**
 * Is this profile an organisation that a Well Windsor admin has not yet
 * approved? Decided 2026-09-11: such an organisation may save drafts, but
 * the database refuses to let it publish, see discoverable volunteers or
 * send outreach.
 *
 * Answers false while the profile is still loading (undefined), so an
 * approved organisation never sees a "waiting for approval" banner flash.
 */
export function isPendingOrganisation(profile) {
  return !!profile && profile.role === 'organization' && !profile.approved_at;
}
