/**
 * The towns this service covers (Royal Borough of Windsor & Maidenhead
 * and immediate neighbours).
 *
 * Single source of truth. This list was previously duplicated in AuthPage,
 * OpportunitiesPage and PostOpportunity, which meant adding a town needed
 * three edits and they could silently drift apart.
 *
 * There is a `towns` table in the database, but it holds one row and
 * nothing reads it. If town management ever moves into the admin UI,
 * replace this with a query and keep the shape.
 */
export const TOWNS = ['Windsor', 'Maidenhead', 'Slough'];

/** For <select> filters that offer an "All" option. */
export const TOWN_FILTER_OPTIONS = ['All', ...TOWNS];
