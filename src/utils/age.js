/**
 * Volunteers must be adults. Decided 2026-09-11.
 *
 * The database enforces the same rule (CHECK user_profiles_min_age), which
 * is what actually matters -- this exists so a form can say so in words
 * instead of surfacing a Postgres constraint name. Keep the two in step.
 */
export const MIN_VOLUNTEER_AGE = 18;

/** True when `dob` (YYYY-MM-DD) is at least MIN_VOLUNTEER_AGE years ago. */
export function isOldEnough(dob) {
  if (!dob) return false;
  const birthday = new Date(dob);
  if (Number.isNaN(birthday.valueOf())) return false;
  birthday.setFullYear(birthday.getFullYear() + MIN_VOLUNTEER_AGE);
  return birthday <= new Date();
}
