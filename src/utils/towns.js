/**
 * The towns this service offers, in the UI.
 *
 * Single source of truth. This list was previously duplicated in AuthPage,
 * OpportunitiesPage and PostOpportunity, which meant adding a town needed
 * three edits and they could silently drift apart. Three MORE copies were
 * still hardcoded in VolunteerProfilePage, OrganizationProfilePage and
 * LookingForVolunteers until 2026-09-08; they read from here now.
 *
 * WINDSOR ONLY, AND THAT IS A UI DECISION, NOT A SCHEMA ONE. Every live
 * opportunity is in Windsor and all the copy says so, so offering
 * Maidenhead and Slough named two places the service does not currently
 * serve.
 *
 * Nothing underneath changed, which is the point:
 *
 *   - `volunteer_opportunities.town` still exists, and its CHECK constraint
 *     still accepts 'Windsor', 'Maidenhead' and 'Slough'.
 *   - `user_profiles.home_town` is free text with no constraint at all.
 *   - The filtering code on the browse and on the volunteer search is
 *     untouched and still filters by town.
 *
 * So ADDING A TOWN BACK IS THIS ONE LINE. No migration, no re-plumbing.
 * Going beyond those three values does need the CHECK widened as well.
 *
 * There is a `towns` table in the database, but it holds one row and
 * nothing reads it. If town management ever moves into the admin UI,
 * replace this with a query and keep the shape.
 */
export const TOWNS = ['Windsor'];

/** For <select> filters that offer an "All" option. */
export const TOWN_FILTER_OPTIONS = ['All', ...TOWNS];

/**
 * The options a town <select> should show for a person who already has a
 * saved town.
 *
 * `home_town` has no CHECK constraint and real people hold values this list
 * does not contain -- on 2026-09-08 one volunteer was in Maidenhead and one
 * in London. A <select> whose value matches no <option> renders as though
 * nothing is chosen, so saving any other field on that form would silently
 * rewrite the person's town to whatever sat at the top. Keeping their own
 * value in the list is what stops that.
 *
 * @param {string|null|undefined} current the saved value, if any
 * @returns {string[]}
 */
export function townOptionsFor(current) {
  const value = (current ?? '').trim();
  return value && !TOWNS.includes(value) ? [...TOWNS, value] : [...TOWNS];
}
