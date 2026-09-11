# Well Windsor — Volunteer Matchmaking

A volunteer marketplace connecting volunteers with local organisations in the
Royal Borough of Windsor and Maidenhead. Built for Well Windsor, a UK charity
(reg. 1207021) funding mental-health provision in Windsor schools.

**This is Windsor, UK — not Windsor, Ontario.** The product is **Windsor
only** in the UI (`src/utils/towns.js` is `['Windsor']`), while the `town`
CHECK still admits Maidenhead and Slough, so a town can be added back with a
one-line change and no migration.

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

**Never read `user_profiles` to see another volunteer.** RLS deliberately
hides other users' volunteer rows on the base table, because RLS filters rows
and not columns — a policy there would re-expose `dob`, `email` and
`contact_number`. There is no policy that lets an organisation read a
volunteer's profile row, and adding one is not the answer. Use a view:

| View | Who sees what |
|---|---|
| `public_volunteers` | volunteers who set `public_profile = true` |
| `opportunity_applicants` | people who applied to *your* opportunities |
| `org_outreach_sent` | *your* outreach log, with the volunteer's name |
| `public_organisations` | every organisation: id, name, home_town, bio |

All four run with owner rights (`security_invoker = false`) and carry no
contact columns. `public_volunteers` returns rows only to an **approved
organisation** (`is_approved_org(auth.uid())`), not to volunteers or pending
orgs. `public_organisations` lists approved organisations only and is
readable by `anon` too. Supabase's linter flags
all of them as "Security Definer View" — that is the design, not a finding.

**Organisations are public entities, and `anon` can already read them on
the base table.** `20260903121939` revoked anon's *table* SELECT on
`user_profiles` and granted back ten named columns (id, role, name,
home_town, skills, bio, available_anytime, availability_matrix,
public_profile, created_at); the `profiles: organizations are public`
policy then limits anon to `role = 'organization'` rows. So a logged-out
visitor does see real organisation names — verify before "fixing" that.
Prefer `public_organisations` in new code anyway: a fixed column list
cannot widen the way a column-grant list can if someone ever adds an
anon-readable row policy.

**An organisation never gets a volunteer's email address.** `send-outreach`
resolves it server-side and sets `Reply-To` to the org. The client passes a
`volunteer_id` and never an address — do not add a parameter that carries
one.

**`town` filters, `location` describes.** `volunteer_opportunities` has
both. `town` is the filter key, CHECK-constrained to the list in
`src/utils/towns.js`, and required once `status = 'active'` (a second
CHECK). `location` is free text for the venue — "St Edward's, Parsonage
Lane". Filtering on `location` is the bug this split fixed: it was an exact
string match that only worked because every seed row happened to say
exactly "Windsor", and the first org to type a real address vanished from a
filtered browse with no error.

**`match_kind` has five values, and it is not `match_rank`.**
`match_opportunities_by_availability` returns both. `match_rank` (1/2/3)
orders the list; `match_kind` is the claim shown to the user — `FULL`,
`PARTIAL`, `NONE`, `FLEXIBLE` (the opportunity is `generally_needed`, so
there is no constraint to match) and `UNSPECIFIED` (the organisation gave
no schedule, so there is nothing to compare). Deriving one from the other
is what shipped "Full availability match" on every flexible role — six of
the fourteen live opportunities.

**Organisations must be approved before they can act (2026-09-11).**
`user_profiles.approved_at` NULL means pending: the org may save drafts, but
RLS refuses `status = 'active'`, `public_volunteers` returns nothing,
`send-outreach` returns 403, and the public browse hides any role whose org
is unapproved, so withdrawing approval takes its roles down at once. The
column is **not client-writable**; the only path is
`set_organisation_approval()`, which checks `is_admin(auth.uid())`. Admins
approve from the Organisations tab. The six orgs that existed on 2026-09-11
were grandfathered as approved.

**Volunteers are 18+ with a required date of birth (2026-09-11).** The
`user_profiles_min_age` CHECK enforces it and refuses a NULL dob. The old
CHECK passed on NULL, so clearing your dob switched the check off.
`src/utils/age.js` mirrors it so forms can say it in words.

**`send-outreach` addresses mail from `auth.users`, never
`user_profiles.email`.** Recipient and Reply-To both come from
`auth.admin.getUserById`, and an unconfirmed address is refused. It used to
read the profile column, which every user could rewrite, making the
function a way to mail anyone under the charity's name. `user_profiles` now
grants UPDATE on nine named columns only; `email`, `role` and `approved_at`
are not among them.

**The schedule lives in two places, and they disagree.** `when_needed`
(jsonb) is what the forms write for their own editing; the normalised
`opportunity_timeblocks` is what matching and auto-close read. On the seed
rows `when_needed` is NULL while a timeblock exists. Read timeblocks when
you need the truth (the detail page does). `date_needed` is dead: NULL on
every row, written by nothing.

**Zod `.optional()` does not accept `null`, and `reset()` feeds it the raw
database row.** `EditOpportunity` resets the form from `select('*')`, so
every nullable column arrives as `null`. `skills: z.string().optional()`
rejected that, `handleSubmit` refused to fire, and because the skills input
has no error slot the page showed *nothing at all* — no toast, no message,
no saved row. Saving an opportunity had been silently impossible whenever
`skills` was null, which is most of them. Any nullable column reaching a
form schema needs `.nullable()`, and every `handleSubmit` on that page now
passes an `onInvalid` handler so a rejected submit can never be silent
again.

**A disabled React Query is not "loading".** With `enabled: !!userId`,
v5 reports `isLoading: false` while the query is disabled, so a
`if (isLoading) return <Skeleton/>` guard falls straight through and the
component renders with `data === undefined`. This crashed the volunteer
dashboard on first render. Use `isPending`, or default the data
(`const rows = data ?? []`).

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
`supabase_migrations.schema_migrations`. The connector assigns its own
timestamp on every apply, so **rename the file after each one**. Checking
only the first of several is how a mismatch got committed on 2026-09-08. A
failed apply records nothing and rolls back whole.

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

### Throwaway accounts you can actually sign in as

Role-switching in SQL proves policies but cannot walk the UI. For that you
need real auth rows. Insert them directly — the `on_auth_user_created`
trigger builds the profile (and the `volunteer_availability` rows) from the
metadata, so this exercises the real signup path rather than side-stepping
it. Only `id` is NOT NULL on `auth.users`; everything else below is what
password sign-in actually needs.

```sql
insert into auth.users (id, email, raw_user_meta_data, aud, role,
                        created_at, updated_at)
values ('7e570000-0000-4000-8000-000000000a01',
        'volunteer-a@wellwindsor-test.invalid',
        jsonb_build_object('role','volunteer','name','Throwaway Volunteer A',
          'home_town','Windsor','available_anytime', false,
          'availability_matrix', jsonb_build_array(jsonb_build_object(
            'days', jsonb_build_array('Monday','Tuesday','Wednesday'),
            'start_time','09:00','end_time','16:00',
            'start_date','2026-09-01','end_date','2026-12-31'))),
        'authenticated','authenticated', now(), now());

update auth.users
   set encrypted_password = crypt('<password>', gen_salt('bf')),
       email_confirmed_at = now(),
       confirmation_token = '', recovery_token = '',
       email_change_token_new = '', email_change = '',
       instance_id = '00000000-0000-0000-0000-000000000000',
       raw_app_meta_data = '{"provider":"email","providers":["email"]}'::jsonb
 where id::text like '7e57%';
```

Ids prefixed `7e57`, emails on `.invalid` (a reserved TLD — nothing can
ever be delivered, which is the point after trap 6). Clean up with
`delete from auth.users where id::text like '7e57%'`; the profile,
availability and any applications cascade.

**A throwaway opportunity posted as `active` is live on the public browse
while it exists.** Delete it in the same session, and never attribute one
to a real organisation — use a throwaway org, for the same reason the seed
rows are a launch blocker.

### Walking the flows

`npm run build` and `npx eslint .` do not exercise anything. Both were
clean on 2026-09-03 while the logged-out browse returned zero results for
every town filter, because a `.select()` edit had landed on one of two
near-identical blocks that differed only in indentation. Drive the real
pages with Playwright, watching `console` and `pageerror`:

```bash
pip install playwright && python -m playwright install chromium
python <skills>/webapp-testing/scripts/with_server.py \
  --server "npm run dev" --port 5173 -- python .scratch/walk.py
```

Put scripts in `.scratch/` — it is gitignored. On Windows start them with
`sys.stdout.reconfigure(encoding="utf-8")` or the emoji in the page text
will raise `UnicodeEncodeError` before you see any output.

### Traps, all hit for real

1. `REVOKE EXECUTE ... FROM anon` does nothing on its own. Postgres grants
   `EXECUTE` to `PUBLIC` by default and anon inherits it. Always
   `REVOKE ... FROM PUBLIC`. Same applies to functions created later —
   `handle_new_user()` picked up the default grant the moment it was
   created and needed a separate revoke.
1b. **And the mirror image, for tables and views: `REVOKE ... FROM PUBLIC`
   does nothing.** Supabase ships
   `ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO
   anon, authenticated, service_role`, so every new table and view is born
   with `ALL` granted *to those roles by name*, not via `PUBLIC`. A tidy
   looking `revoke all ... from public` leaves anon holding SELECT,
   INSERT, UPDATE, DELETE and TRUNCATE. Name the roles:
   `revoke all on <rel> from anon, authenticated;` then grant back only
   what is needed. Caught on `opportunity_applicants` by an anon probe
   returning `200 []` where `42501` was expected — reading the migration
   back would never have shown it.
1c. **Trap 1b applies to functions too, and bites on DROP + CREATE.**
   `CREATE OR REPLACE` cannot change a return type, so adding a column to a
   `RETURNS TABLE` means dropping the function, and the recreated one is
   born with EXECUTE granted to `anon` *by name*. `revoke ... from public`
   leaves it there. Hit 2026-09-08 on `match_opportunities_by_availability`.
   Prefer a same-signature `CREATE OR REPLACE`, which keeps the ACL, and
   re-probe any function you drop.
1d. **`information_schema.column_privileges` lists every column when a
   grant is table-wide**, which looks exactly like a column-level grant
   list. This was misread twice. 20260908202130's comment wrongly says
   `volunteer_opportunities` has column-level grants. And `authenticated`
   held table-wide UPDATE on `user_profiles`, so a column-level REVOKE would
   have done nothing, and a new `approved_at` column would have been
   self-writable by every org. **Read `pg_class.relacl`.** To take one
   column away, revoke the table privilege and grant back a named list.
2. A `DELETE`/`PATCH` matching zero rows returns `HTTP 204` whether it was
   permitted or blocked. That is not proof of denial — probe a real row id
   and look for `42501`.
3. Any policy on `user_profiles` that queries another RLS-protected table
   causes `42P17 infinite recursion` (`applications` →
   `volunteer_opportunities` → `user_profiles`). Wrap the lookup in a
   `SECURITY DEFINER` function. (`has_application_with()` did this and is
   now deleted — Phase 1.2 removed the counterparty-read policy it served,
   since the organisation no longer needs contact details at all. The
   recursion trap is still live for any future policy there.)
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
4b. A permission check that counts rows in a table the *caller* can write
   is not a permission check. `send-outreach` unlocks emailing a volunteer
   if they have "applied to one of your opportunities" — and the old
   `applications` INSERT policy let an organisation insert rows naming any
   volunteer (`direction = 'to_volunteer'`). Any org could therefore email
   any volunteer, `public_profile` or not, by writing its own evidence
   first. Fixed by making the table volunteer-insert-only. When a function
   trusts a table, check who can write to that table.
5. Testing a "does X unlock access" policy against a pair of users that
   already have an unrelated permitting relationship proves nothing —
   the earlier relationship, not the one under test, explains a pass.
   Use a fresh pair with no history for the negative case.
6. **Never use a real user's id as a test target — including for a test
   you expect to be REJECTED.** A negative test is only free if the
   expectation holds. On 2026-09-03 a "this org has no relationship,
   expect 403" test against a real volunteer's id passed instead of
   failing (they had `public_profile = true`, which legitimately permits
   contact) and sent a real junk email to a real person at the charity.
   Create throwaway accounts for every test target, always.

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

**ML matching is now deleted** (2026-09-03, commit `0e3b1a9`) — six files,
the `window.seedData`/`window.seedMatches` globals and the `openai`
dependency. `src/services/` is empty.

**Log Hours is now deleted** (2026-09-04, commit `d72d379`) — nine files,
~2,000 lines, four routes and both nav links. `volunteer_hours` stays in
the database at 0 rows. Two non-obvious dependencies came with it: NavBar's
`useLocation()` was read only by the two Log Hours links, and
`NotificationsDropdown` mapped four `hours_*` notification types to the
deleted routes. No notification type routes anywhere now.

**The admin is now one page** (2026-09-04, commit `a44852c`). `AdminDashboard`
is it. `AdminAnalytics`, `UserList`, both orphaned `AnalyticsPage.jsx` files
and `UserManagement` are deleted, and `recharts`, `jspdf`, `jspdf-autotable`
and `react-icons` are uninstalled with them.

Being kept and finished: availability-overlap matching, which is real,
DB-side, and computed by `match_opportunities_by_availability`. **Phase 1
is complete** — the badge renders, "Show Matches Only" works, `town` is a
real column, and `requires_dbs` shows on the browse.

### Where to pick up

**Phase 3 (design) is done and merged** (PR #4, 2026-09-08). New work
branches from `main`. eslint baseline is **13 errors, 3 warnings**, all
pre-existing.

**The 2026-09-11 audit** (branch `v0-audit`) probed every table, view and
function from outside, as anon and as throwaway users. The core access
model held. Six gaps did not, and all six are fixed and re-proven: profile
email rewritable (and trusted by `send-outreach`), org contact emails
readable by anon, dob removable (age check off), volunteers browsing other
volunteers, cross-user notification counts, and orgs changing role. The
same branch added org approval, 18+, and a working nightly auto-close
(`pg_cron` at 00:05 UTC: a role closes the day after its last timeblock
ends; flexible roles never close on their own). Re-run these after any
access change: `.scratch/probe_security2.py`, `walk_audit.py`,
`walk_core_loop.py` (the whole loop through the UI) and `walk_design.py`.

Before going public, none of which is code:
1. **Real content.** 13 of the 14 live roles are `5eed…` seed rows credited
   to real organisations, and the 14th is a test. Phase 5.0 deletes them and
   leaves an empty browse, so the charity needs real organisations posting.
2. **Email.** Brevo shows `wellwindsor.org.uk` unauthenticated and the
   `volunteer@` sender inactive; the only active sender is a personal Gmail.
   Needs DNS records, then Supabase Auth's SMTP pointed at Brevo, then
   **email confirmation switched on** (decided 2026-09-11).
   `send-outreach` already refuses unconfirmed addresses.
3. **Dashboard toggles** the advisor flags: leaked-password protection
   (HaveIBeenPwned) and the pending Postgres security patch.
4. Privacy policy and a data-deletion route; hosting (Cloudflare Pages).

Known, not yet fixed, lower priority:
- Signed-in users can read organisations' `email` and `contact_number` from
  `user_profiles` (the orgs-are-public policy plus table-wide SELECT). The
  match RPC also still returns `contact` to volunteers.
- Browse cards read `when_needed`, so the seed roles show no schedule tag.
- ML and Log Hours residue: `pgvector` in `public`, the `embedding_*`
  columns, `match_results`, `calculate_match_score`,
  `match_volunteers_for_opportunity`, the `hours_*` functions,
  `get_public_counts`, `site_settings`.
- The `enquiry_attachments` bucket is unused and accepts uploads of any
  size or type from any signed-in user.
- Admins get no notification when an org signs up; they must check the page.
- **Admin suspend/remove is unbuilt, not merely unwired.** It needs an
  enforced `is_active` plus a service-role function setting
  `auth.users.banned_until`. Org approval is the nearest thing that exists.

**How to push from this machine.** The default `openssl` backend fails with
`unable to get local issuer certificate (20)` — the configured
`ca-bundle.crt` exists but lacks the issuer, which is what TLS interception
by a proxy or AV looks like. `git -c http.sslBackend=schannel push` works,
because schannel uses the Windows certificate store where that root is
already trusted. Make it permanent with
`git config --global http.sslBackend schannel`. **Do not** reach for
`http.sslVerify=false`; it disables verification rather than fixing trust.

**The flow, as of Phase 1.2 (2026-09-03).** There is no accept/deny anywhere.
A volunteer applies; the application is read-only interest, and sends the
organisation no email. The organisation reads its applicants, writes to the
ones it wants through `send-outreach`, or dismisses them — dismissal is
invisible to the volunteer, because silence means no. Everything after the
introduction happens over the two parties' own email; we are not a mailbox.
The UI must keep saying so plainly: "you may not hear back from every
application."
