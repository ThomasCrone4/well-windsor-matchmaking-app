# Well Windsor — Volunteer Matchmaking

A volunteer marketplace connecting volunteers with local organisations in the
Royal Borough of Windsor and Maidenhead. Built for Well Windsor, a UK charity
(reg. 1207021) funding mental-health provision in Windsor schools.

**This is Windsor, UK — not Windsor, Ontario.** Towns in scope: Windsor,
Maidenhead, Slough.

**Real users, real data.** The production database holds accounts belonging to
actual people. Treat destructive operations accordingly.

## Commands

```bash
npm run dev      # vite dev server, localhost:5173
npm run build    # production build; must emit no esbuild diagnostics
npm run lint     # eslint
```

There is no test suite. Verification is done by walking the flows and by
probing the API directly (see "Verifying database access" below).

## Stack

React 19 + Vite · Tailwind · React Query v5 · React Hook Form + Zod ·
Supabase (Postgres 17, `eu-west-2`, project `ludyyfwzqjvgakrkvixo`).

Routing is centralised in `src/main.jsx`. There is no server tier yet — the
browser talks to Supabase directly, so **RLS is the only thing protecting
user data**.

## Conventions that will bite you

**Role values are US-spelled in data, UK-spelled in copy.** The database
stores `'organization'` and `'volunteer'`. User-facing text says
"organisation". A comparison against `role === 'organisation'` silently fails
— this shipped once and broke Get Started for every org.

**Never read `user_profiles` to browse volunteers.** RLS deliberately hides
other users' volunteer rows on the base table, because RLS filters rows and
not columns — a browse policy there would re-expose `dob`, `email` and
`contact_number`. Use the `public_volunteers` view, which is consent-gated on
`public_profile` and omits every contact field. Organisations *are* readable
on the base table; they're public entities.

**Never put a secret in a `VITE_` variable.** Vite inlines them into the
client bundle. Anything privileged belongs in a Supabase Edge Function.
`VITE_SUPABASE_ANON_KEY` is fine — it is public by design, and RLS is what
makes it safe.

**Theming is CSS variables, not Tailwind colours.** `ThemeContext` sets
`data-theme` on `<html>`; `tailwind.config.js` maps `darkMode` to that
selector. Use the `--color-*` tokens in `src/index.css`. Hardcoded utilities
like `text-gray-700` do not respond to either theme and are a bug — there are
still many in the page components, being cleaned up as pages are reworked.

**`window.confirm` and `alert` are used in places.** Prefer the existing
`ConfirmDialog.jsx` when touching those paths.

**Signup does not insert a profile row.** Profile fields are passed as
`signUp({ options: { data } })` metadata and the `on_auth_user_created`
trigger writes `user_profiles`. This makes signup atomic — a failed
constraint rolls the auth user back too, rather than stranding an account
with no profile. If you add a profile field, it needs handling in three
places: the form, the metadata object, and `handle_new_user()`.

Email confirmation is currently **off** on this project, so `signUp` returns
a session immediately. The client handles the confirmation-on case anyway;
don't remove that branch.

## Database

Migrations live in `supabase/migrations/` and are applied via the Supabase
MCP connector. **Write the migration to a file first, then apply it**, so the
repo and the remote ledger stay in step — filenames must match the version in
`supabase_migrations.schema_migrations`.

Do not hand-maintain schema documentation. It goes stale within a day and
then actively misleads; query the live database instead.

### Verifying database access

Two channels, and you need both. `execute_sql` runs as the table owner and
**bypasses RLS**, so it cannot tell you what a user actually sees.

To see what an unauthenticated attacker sees, probe REST with the anon key:

```bash
curl "$VITE_SUPABASE_URL/rest/v1/<table>?select=*" -H "apikey: $ANON_KEY"
```

To simulate a signed-in user without creating accounts in production auth:

```sql
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claims = '{"sub":"<uuid>","role":"authenticated"}';
```

Pick a non-admin subject. `875907a2-baa6-47f8-8695-d7a0e61c8249` is the only
row in `admins` and reads everything by policy, which looks like a leak.

### Traps, all hit for real

1. `REVOKE EXECUTE ... FROM anon` does nothing on its own. Postgres grants
   `EXECUTE` to `PUBLIC` by default and anon inherits it. Always
   `REVOKE ... FROM PUBLIC`. Same applies to functions created later —
   `handle_new_user()` picked up the default grant the moment it was
   created and needed a separate revoke.
2. A `DELETE`/`PATCH` matching zero rows returns `HTTP 204` whether it was
   permitted or blocked. That is not proof of denial — probe a real row id
   and look for `42501`.
3. Any policy on `user_profiles` that queries another RLS-protected table
   causes `42P17 infinite recursion` (`applications` →
   `volunteer_opportunities` → `user_profiles`). Wrap the lookup in a
   `SECURITY DEFINER` function, as `has_application_with()` does.
4. **Writing "requires an accepted application" into a helper function's
   comment is not the same as writing `WHERE status = 'accepted'` into its
   SQL.** `has_application_with()` shipped with no status filter at all —
   any application, including a bare pending one, unlocked a volunteer's
   DOB/email/phone to the org. It read correctly in every comment and
   every plan document; only a live write test (create a pending
   application, immediately try to read contact fields, expect denial)
   caught that the code didn't match the description. Reading a policy
   back is not verification — provoke the specific case that should fail
   and confirm it does.
5. Testing a "does X unlock access" policy against a pair of users that
   already have an unrelated permitting relationship proves nothing —
   the earlier relationship, not the one under test, explains a pass.
   Use a fresh pair with no history for the negative case.

## Every table needs the same checklist, not just the ones that were obviously broken

The 2026-09-03 emergency fix hardened the 3 tables that had RLS fully
disabled. A follow-up pass the same day found the other 10 tables all still
held full anon write grants (blocked in practice by their policies, but
sloppy — fixed for defence in depth), one policy (`volunteer_opportunities`
public read) with no status filter that only hadn't leaked yet because no
draft existed, and one policy (`notifications` insert) that any signed-in
user could actually exploit today. **A security pass that stops at the
table everyone already knows is bad will miss the ones nobody's looked at.**
Any new table needs: RLS on, no anon write grants, every `SECURITY DEFINER`
function's `EXECUTE` grant reviewed (not left at its default), and a live
write test — not just a read probe — before it's considered done.

## Working agreement

- Branch off `main`; do not commit to it directly.
- Verify claims before reporting them. "The build passed" is not evidence
  that a feature works.
- When a fix touches security, prove it from the outside, not just by
  reading the code.
- Say plainly when something is broken, unverified, or worse than expected.

## Current state

Working towards a publishable v0. Full plan, including what is being
deliberately removed:

    C:\Users\thoma\.claude\plans\i-m-picking-up-this-glowing-platypus.md

Being removed: Log Hours (whole feature), ML/embedding matching (scores were
`Math.random()`), admin analytics and user impersonation. Archived on the
`archive/log-hours` and `archive/ml-matching` branches.

Being kept and finished: availability-overlap matching, which is real,
DB-side, and computed by `match_opportunities_by_availability`.
