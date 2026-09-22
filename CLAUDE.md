# Well Windsor — Volunteer Matchmaking

A volunteer marketplace connecting volunteers with local organisations in the
Royal Borough of Windsor and Maidenhead. Built for Well Windsor, a UK charity
(reg. 1207021) funding mental-health provision in Windsor schools.

**This is Windsor, UK — not Windsor, Ontario.** The product is **Windsor
only** because Windsor is the only *active* row in the `towns` table. Admins
add and activate towns from the dashboard; there is no list in code and no
CHECK any more (workflow 7, ADM-6).

**Not live to the public yet, but the accounts are real people's**
(clarified 2026-09-22). The site has not been opened to volunteers or
organisations outside the charity; every account is someone testing it
internally. So a few minutes of breakage is survivable — it is not the end of
the world — and that is a reason to move, not a reason to be careless.

What does *not* relax: those accounts are colleagues' real inboxes, so the
test-target rule stands unchanged (trap 6 — never use a real id as a test
target, not even for a test you expect to be rejected), and destructive
operations still destroy real data. **The change to make is "act, then
verify quickly", not "verify less".**

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
| `public_volunteers` | volunteers who set `public_profile = true`, with `skill_ids` + `skill_names` |
| `opportunity_applicants` | people who applied to *your* opportunities, with `skill_names` |
| `org_outreach_sent` | *your* outreach log, with the volunteer's name |
| `public_organisations` | every organisation: id, name, home_town, bio |
| `my_registrations` | *your own* registrations, with the role attached |
| `public_opportunities` | every publicly visible role, with its organisation's name and `skill_ids` + `skill_names` |

The skill arrays are how an organisation sees a volunteer's skills:
`volunteer_skills` itself is readable only by its owner and an admin, and a
policy there for organisations would be a second, divergent definition of who
may see a volunteer. The arrays are **ordered** in the view — an unordered
`array_agg` promises nothing, and the chips would reshuffle between renders.

All six run with owner rights (`security_invoker = false`) and carry no
contact columns.

`my_registrations` exists because a volunteer reads roles through
`opportunities: public reads active only`, so the moment a role closes or is
removed the embedded join returns NULL and their dashboard printed the bare
word "Opportunity". That was true of every **closed** role since the policy
was written — it only became visible when ROLE-1 gave people a reason to
look. `applications.opportunity_title` looks like the fix and is NULL on
every row, written by nothing. `public_volunteers` returns rows only to an **approved
organisation** (`is_approved_org(auth.uid())`), not to volunteers or pending
orgs. `public_organisations` lists approved organisations only and is
readable by `anon` too. Supabase's linter flags
all of them as "Security Definer View" — that is the design, not a finding.

**Organisations are public entities, and `anon` can already read them on
the base table.** `20260903121939` revoked anon's *table* SELECT on
`user_profiles` and granted back ten named columns (id, role, name,
home_town, skills, bio, available_anytime, availability_matrix,
public_profile, created_at) — of which `skills`, `available_anytime` and
`availability_matrix` are since **dropped columns**, so the live grant is the
remaining seven; the `profiles: organizations are public`
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
both. `town` is the filter key, a foreign key to `towns(name)`, and
required once `status = 'active'` (a CHECK). `location` is free text for the venue — "St Edward's, Parsonage
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

**`opportunity_timeblocks` is the schedule — the whole schedule (2026-09-15).**
`when_needed`, `date_needed` and `contact` are **dropped columns**; writing
any of them is a `PGRST204`. Every surface reads timeblocks now: the browse
cards, the home page, the detail page, the org dashboard, the edit form's
matrix and `match_opportunities_by_availability`.

Two things bite here:

- **Postgres `time` renders as `HH:MM:SS`,** and `toMinutes()` used to accept
  only `HH:MM`. So every time parsed as null, `consistent` came out false,
  and every schedule anywhere read **"Times vary"** instead of the hours. It
  was invisible while only the detail page read timeblocks. `npm run build`
  and eslint were both clean on it; the Playwright walk found it.
- **Both forms rewrite timeblocks by deleting every row and re-inserting, on
  every save,** whether or not anything changed. A trigger on that table
  would therefore fire on saves that changed nothing. That is what
  `schedule_revision` is for: the client compares with `sameSchedule()` and
  bumps the counter only on a real change, giving the parent row something
  honest for the ROLE-2 notice to notice.

**A registration is withdrawn, never deleted (2026-09-16).** `applications`
has no `subject` column (INT-2 — registering is a button plus one optional
note) and gained `withdrawn_at` (INT-4). Withdrawn means invisible to the
organisation, which is **never told** — enforced on the base table's SELECT
policy, not only in `opportunity_applicants`, because the dashboard's
"N people interested" count reads the table directly.

Four things hold it together, and each closes a hole the others leave:

- **The organisation cannot un-withdraw it.** RLS evaluates UPDATE's `USING`
  against the *existing* row, so a dismiss policy without `withdrawn_at is
  null` would let an org update a row it is not allowed to read.
- **Only `withdraw_registration()` sets it.** A column grant would reach the
  organisation too, via its dismiss policy — letting an org hide a
  registration from itself in a way that looks exactly like the volunteer
  withdrawing.
- **DELETE is revoked and refused by trigger,** scoped to the browser roles
  so ACC-6's cascade still works.
- **The unique constraint is partial** (`where withdrawn_at is null`). It
  used to be a plain `UNIQUE (volunteer_id, opportunity_id)`, which a kept
  withdrawn row would have turned into a permanent lock-out — while the
  withdraw dialog promises "you can register again later".

> **A withdrawn registration is not permission to email (trap 4b).**
> `send-outreach` unlocks contact if the volunteer "applied to one of your
> roles", and INT-4 keeps those rows for ever. That count therefore filters
> `withdrawn_at is null`. Without it, withdrawing would remove someone from
> the organisation's list while leaving them emailable — the exact opposite
> of what INT-4 is for. Whenever `applications` changes, re-read that count
> with the change in mind.

**A role is removed, never deleted (2026-09-15).** `deleted_at` non-null
means gone: hidden from the browse policy, the timeblocks policy, the match
RPC, the nightly auto-close and registration. Its registrations survive —
that is the point, and `applications.opportunity_id` is `ON DELETE CASCADE`,
so a hard DELETE would erase them. `DELETE` is therefore revoked from
`anon` and `authenticated` **and** refused by trigger. Two consequences that
have already caught scripts out:

- **Any probe or walk that cleaned up with a `DELETE` now fails silently and
  leaves a throwaway role live on the public browse.** Five of them did.
  `PATCH {"deleted_at": "now()"}` is the cleanup now.
- **Removal is terminal** — clearing `deleted_at` is refused, because a
  volunteer told "this role was removed" must not have that quietly
  reversed. A fixture role a test removes cannot be reused; create a fresh
  one per run. ROLE-4 makes *closed* the reversible state, not removed.

The no-hard-delete trigger is scoped to `current_user in ('authenticated',
'anon')` so that **ACC-6 still cascades** — `volunteer_opportunities.org_id`
is `ON DELETE CASCADE` on `user_profiles`, and an unconditional raise would
break account deletion. Proven by running the real `delete-account` function,
not by reading the trigger.

**Skills are rows, not text, and hiding one is soft (2026-09-22).**
`user_profiles.skills` and `volunteer_opportunities.skills` are **dropped
columns** — writing either is a `PGRST204`. The list is `skills` (20 rows in
four groups); who has what is `volunteer_skills` and `opportunity_skills`.

- **Every picker is `SkillsPicker`**, fed by `useSkills()` in
  `src/utils/skills.js`. Four surfaces choose: sign-up, the volunteer
  profile, posting a role, editing one. Find Volunteers filters by skill.
- **`is_active = false` hides a skill from the pickers and touches nobody
  who already holds it.** Deliberately *not* the towns rule (ADM-6), where a
  town cannot be deactivated while anything references it — a dead town
  breaks a foreign key, whereas a volunteer who really does speak Welsh does
  not stop speaking it because the charity stopped advertising for it.
- **There is no delete path at all.** `skill_id` is `ON DELETE RESTRICT`
  from both join tables and no grant permits a delete; the admin adds and
  hides. Added and hidden only through `admin_add_skill` /
  `admin_set_skill_active`.
- **A picker offers the active list PLUS whatever the row already holds**
  (`pickerOptions`). Without that, editing a role carrying a since-hidden
  skill would silently drop it on the next save.
- **Filter by skill id, never by name.** A rename would otherwise empty a
  filtered list with no error.
- **Write through `set_volunteer_skills` / `set_opportunity_skills`.** A
  DELETE then an INSERT over PostgREST is *two transactions*, so between
  them the row has no skills — and the deferred trigger below fires on that
  intermediate commit and refuses it.
- **The public-profile rule is a trigger now**
  (`enforce_public_profile_detail`), on *both* `user_profiles` and
  `volunteer_skills`, because it can be broken from either side. It replaced
  `user_profiles_public_needs_detail`, which was a CHECK on the text column —
  and a CHECK cannot query another table.
- **`handle_new_user` writes the join rows from `skill_ids` metadata.** It is
  a SECURITY DEFINER trigger on `auth.users`: get it wrong and *every*
  sign-up fails, an organisation's included. `probe_skills` signs up both to
  prove it does not.

**A `CASE` expression in PL/pgSQL resolves record fields in every branch.**
The trigger above is shared by two tables and chose its id with
`case tg_table_name when 'user_profiles' then coalesce(new.id, old.id) else
coalesce(new.volunteer_id, old.volunteer_id) end`. On `volunteer_skills` that
is `42703: record "new" has no field "id"` — the whole expression is
prepared, not only the branch taken. Every DELETE from `volunteer_skills`
failed, which broke saving a volunteer profile on the live site. Use `IF`
statements, and use `TG_OP`: NEW is unassigned on DELETE and OLD on INSERT.

**Zod `.optional()` does not accept `null`, and `reset()` feeds it the raw
database row.** `EditOpportunity` resets the form from `select('*')`, so
every nullable column arrives as `null`. `skills: z.string().optional()`
rejected that, `handleSubmit` refused to fire, and because the skills input
had no error slot the page showed *nothing at all* — no toast, no message,
no saved row. Saving an opportunity had been silently impossible whenever
`skills` was null, which was most of them. (That field is gone — skills are
rows now — but the trap is live for every other nullable column.) Any
nullable column reaching a form schema needs `.nullable()`, and every
`handleSubmit` on that page now passes an `onInvalid` handler so a rejected
submit can never be silent again.

**A control outside react-hook-form does not make the form dirty.** Every
save button on `EditOpportunity` and `VolunteerProfilePage` is
`disabled={!isDirty}`, and `SkillsPicker` is not a registered input — so
changing only the skills left Save greyed out and the change unsaveable.
Both pages now OR in a `skillsDirty` of their own. Found by a walk; reading
the code had not shown it.

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
6b. **A trigger that notifies "every admin" reaches the real admin, even
   when every id you touched was a throwaway.** Inserting a
   `problem_reports` row or signing up a throwaway organisation fans out to
   `admins`, which contains a real person. Six junk `problem_reported`
   notifications landed in the live admin's feed during workflow 1 before
   this was noticed — in-app only, and deleted, but not something the
   throwaway-id rule prevents on its own. Before testing anything that
   notifies a *class* of user rather than a named one, check who is in that
   class, and clean up by `type` and timestamp afterwards rather than by
   `user_id like '7e57%'` — the row belongs to the *admin*, so deleting the
   throwaway that caused it cascades nothing.
   **Partly closed since:** `is_test_address()` now stops a `.invalid`
   account raising either the email or the bell alert on organisation
   signup. It was added to the email path first and the bell was missed,
   which put two more junk rows in the live admin's feed an hour later —
   **when two triggers fire on one event, guard both or neither.** An
   anonymous problem report has no identity to test, so testing that path
   still means unscheduling `drain-email-outbox` first.
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

**Start at `BUILD-PLAN.md` in this repo.** It is the step-by-step plan for
v1, written 2026-09-13 from 43 product decisions the user signed off on the
logic map (https://claude.ai/code/artifact/5ceb5a1e-9810-477d-b37e-8d5cd55bd5b3).
Eight workflows, each a vertical slice, each finished completely before the
next one starts. It carries a verified snapshot of the live database and
repo as of that date — trust it over the older notes below where they
disagree.

Working towards a publishable v0. The earlier plan (2026-09-03), including
what was deliberately removed, is **superseded by BUILD-PLAN.md** — its phases
0–4 are done and phase 5 became workflow 8. Kept on the development machine
for history only:

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
  `user_profiles` (the orgs-are-public policy plus table-wide SELECT).
  (The match RPC no longer returns `contact` — workflow 5 dropped the column
  outright, so that half of this is closed.)
- The `enquiry_attachments` bucket is unused and accepts uploads of any
  size or type from any signed-in user.
- **Admin suspend/remove is unbuilt.** Out of scope by decision
  (BUILD-PLAN) — withdrawing an organisation's approval already takes its
  roles down, and `user_status` has been deleted rather than left as a flag
  that means nothing. Do not build `is_active`.

**Workflow 1 is done (2026-09-13, branch `wf1-foundations`).** Four
migrations, all applied and probed from outside:

- **The ML and Log Hours residue is gone.** `match_results`,
  `volunteer_hours`, `user_status`, `site_settings`, the `embedding_*`
  columns, `logged_hours`, the `hours_*`/`calculate_match_score`/
  `match_volunteers_for_opportunity`/`get_public_counts` functions and
  `pgvector` are all dropped. The old "residue" list here is obsolete.
- **`audit_logs` is append-only and records system events.** `admin_id` is
  now `actor_id` + `actor_kind` (`admin`/`system`/`user`), both foreign
  keys dropped so an account deletion cannot blank the log, and UPDATE and
  DELETE are refused *even to the table owner* by trigger. The only writer
  is `record_audit_event()`; the only editor is
  `redact_user_from_audit_log()` (ADM-4), which workflow 3 calls. EXECUTE
  on both is revoked from `public`, `anon` and `authenticated`, so neither
  is reachable from a browser.
- **`notifications` has six CHECKed types and the client cannot write one.**
  No INSERT grant to anyone; UPDATE is granted on `read_at` alone. Four
  triggers are live: interest registered, outreach sent, role closed, and
  organisation signed up — so admins **are** now told about a new
  organisation. `problem_reported` is wired. (`role_removed` waited for
  workflow 5's soft-delete column and is now live — `notify_role_closed` was
  replaced by `notify_role_state_change`, which covers removed, closed and
  changed.)
- **`problem_reports` is the one table `anon` may INSERT into,** on three
  columns only. Reads are admin-only. That combination means **a reporter
  cannot read the row back, so `Prefer: return=representation` fails on the
  RETURNING even though the INSERT is allowed** — post without `.select()`.
  This produced four false passes in a probe before it was spotted.

Re-runnable: `.scratch/probe_wf1.py` (47 outside-in cases) and
`.scratch/walk_wf1.py` (16 UI checks).

**Workflow 2 is built (2026-09-13, branch `wf2-email`).** Three migrations
and two Edge Functions.

- **Email goes through an outbox, never straight out of a trigger.** A
  trigger that called Brevo over HTTP would make approving an organisation
  fail whenever Brevo was down. Triggers `INSERT` into `email_outbox`;
  `drain-email-outbox` (pg_cron, every minute) pings the **`send-email`**
  Edge Function, which sends and writes the result back. A failed send is a
  row with an error, not a lost email. Five attempts, then `abandoned`.
- **`send-email` runs with `verify_jwt = false`** — it is reachable by
  anyone on the internet. Its only door is a secret in Vault, compared
  inside the database by `verify_email_hook_secret()`. **Do not make the
  Edge Function read `vault.decrypted_secrets` itself**: PostgREST only
  exposes configured schemas, `vault` is not one, and it fails closed with
  a 401 that looks exactly like a wrong secret.
- **The digest runs hourly and acts only at 08:00 Europe/London**, because
  pg_cron schedules in UTC and the two disagree for half the year.
  `org_digest_state` is the per-organisation watermark; it moves even on a
  quiet day, so a silent day cannot make tomorrow repeat today.
- **Charity-facing alerts are redirected to a personal inbox until launch.**
  `charity_notification_recipients()` reads the `charity_notification_email`
  Vault secret and falls back to `hello@wellwindsor.org.uk` when it is
  absent. **Delete the secret at launch** and it reverts on its own; APP-3
  (workflow 4) replaces the whole function with the editable list.

  This exists because **eleven real "a problem was reported" emails reached
  `hello@wellwindsor.org.uk` during workflow 2 testing, and three were
  opened by a person.** `probe_wf1.py` files problem reports, the trigger
  emails the charity, and the drain was scheduled. A note had been written an
  hour earlier saying that exact path needed the drain paused first — and
  the probe was then run several times anyway. **A rule that depends on
  remembering is not a control; move the address, not the discipline.**
- **Email really sends, and that is deliberate.** The user tests the app for
  real, so there is no global hold. `email_delivery_mode` (Vault) is `live`
  and exists only as a kill switch: set it to `test` and `send-email` holds
  anything not on `.invalid`, marking the row `held` — kept in full, not
  sent, not lost. **Claude must not send to a real address unless the user
  asks.** Volunteer- and organisation-facing mail already goes to `.invalid`
  throwaways; the charity-facing mail is redirected above; so an ordinary
  test run reaches nobody real.
- **A `.invalid` account also raises no alert at all.** `is_test_address()`
  guards both the signup email and the in-app admin notification, so a
  throwaway organisation stays invisible to the charity even in live mode.
- Sending is still from the development Gmail: the domain is
  unauthenticated, so Brevo rewrites the From to `…@brevosend.com`.
  `BREVO_SENDER_EMAIL` / `EMAIL_REPLY_TO` / `EMAIL_PRIVACY_URL` /
  `EMAIL_LOGO_URL` are the switches — set secrets, do not edit code.

Re-runnable: `.scratch/probe_wf2.py` (41 outside-in cases).

**Workflow 3 is built (2026-09-13, branch `wf3-accounts`).** Three migrations
and two Edge Functions.

- **`ProtectedRoute` renders a page, it does not redirect.** A signed-in
  person in the wrong area used to be sent to `/auth` with a toast, which
  reads as "you have been logged out" and invites them to sign in again with
  the account they are already using. `AdminRoute` did the same to `/` and
  called `toast.error` from its render body, so it re-fired on every render.
  Not signed in still redirects — that genuinely is what they need.
- **Deleting an account cascades further than the plan expected.**
  `org_outreach` is `ON DELETE CASCADE` on *both* its org and volunteer
  columns, so deleting a volunteer erases the evidence that an organisation
  was permitted to write to them — the same thing `INT-4` keeps withdrawn
  registrations for. `prepare_account_deletion()` therefore writes a dated
  `outreach_preserved_on_deletion` entry per message (org, role, date,
  status — never text or names) **before** `auth.admin.deleteUser`, then runs
  the ADM-4 redaction. `audit_logs` has no foreign keys, which is what lets
  it outlive the account.
- **`delete-account` takes no user id.** It deletes `auth.uid()` and nothing
  else, so there is no parameter to point at someone else, and it requires
  `{"confirm":"DELETE"}` so a stray request cannot delete an account. It
  refuses an admin, because there is exactly one admin row.
- **`auth.users.email` and `user_profiles.email` are kept in step** by a
  trigger. They could drift, and drift is how `send-outreach` became a way to
  mail anyone under the charity's name.
- **A `.invalid` problem report now raises neither the email nor the bell.**
  `problem_report_is_test()` treats a `.invalid` reply address or reporter as
  a test — a real visitor never types one. This replaces the old note saying
  "pause the drain first", which was wrong twice and put junk in the live
  admin's feed both times. **Every probe must give a `.invalid`
  `contact_email` when filing a report.**

- **ACC-8's self-service flow cannot be tested with throwaways, and is
  therefore unproven.** Supabase Auth validates deliverability on the
  user-facing `PUT /auth/v1/user` and rejects any domain with no MX — both
  `.invalid` and `example.com`. It reports the **current** address as
  invalid, so an account on `.invalid` can never change its own email at
  all. `admin.updateUserById` is *not* validated, which is why ADM-8 is
  proven end to end and ACC-8 is not. Testing ACC-8 needs a real deliverable
  address. Whether the old address is also notified depends on Supabase's
  **"Secure email change"** setting, which cannot be read from here.

Re-runnable: `.scratch/probe_wf3.py` (37 cases — it signs up its own doomed
account so it can be run more than once, and it covers the ADM-8 happy path,
not only the denials) and `.scratch/walk_wf3.py` (17 UI checks).

**Prove the feature works, not only that it refuses.** Workflow 3's first
pass tested every way ADM-8 could fail and never once that it succeeds —
the same shape as `has_application_with()`, which read correctly in every
comment and had no status filter in its SQL. A suite of denials can be
entirely green while the feature does nothing at all.

**Workflow 4 is built (2026-09-14, branch `wf4-approval`).** Three
migrations and one new admin tab.

- **`notification_recipients` (APP-3)** is who gets emailed when an
  organisation is waiting. `hello@wellwindsor.org.uk` is the permanent row
  and **cannot be deleted, paused, demoted or readdressed by anyone,
  including the table owner** — it is a trigger, not a policy, because
  "cannot be removed" has to mean cannot, not cannot-from-the-UI. A partial
  unique index allows only one permanent row. Every change is logged.
- **The development redirect still wins over the list.**
  `charity_notification_email` in Vault short-circuits
  `charity_notification_recipients()`, because hello@ is now unpausable by
  design and building the list must not undo the fix for the eleven emails
  that reached the charity. Delete the secret at launch and it falls
  through to the table.
- **APP-6:** `list_admins()`, `grant_admin()` and `revoke_admin()`, all
  admin-only and logged. `admins` cannot carry an `is_admin()` policy —
  that function reads `admins`, so a policy there recurses (trap 3) — which
  is why listing every admin is a SECURITY DEFINER function and the only
  policy on the table is self-read.
- **Nobody removes their own admin access.** Found by reading `relacl`:
  `authenticated` held `arwd` on `admins` and the DELETE policy checked only
  that the caller *is* an admin, never which row was going — with one admin
  row, a one-click lockout of the whole charity. Direct INSERT/UPDATE/DELETE
  are revoked and a `BEFORE DELETE` trigger blocks self-removal even if a
  future migration hands the privilege back.

> **Never `revoke all on public.admins from anon`.** `volunteer_opportunities`,
> `user_profiles`, `applications` and `towns` each carry a policy scoped to
> the **PUBLIC** role whose `USING` is `is_admin(auth.uid())`, and
> `is_admin()` is not SECURITY DEFINER — so it reads `admins` as the caller.
> Without the grant, **every anonymous read fails with
> `42501: permission denied for table admins`** and the logged-out browse
> returns 401. Done for real in workflow 4 and caught only by re-running
> `probe_security2`. anon needs the privilege to *run* the function; RLS is
> what stops it seeing any rows.

Re-runnable: `.scratch/probe_wf4.py` (37 cases, including the APP-6 happy
path) and `.scratch/walk_wf4.py` (17 UI checks).

**Workflow 5 is built (2026-09-15, branch `wf5-roles`).** Eight migrations.
Items: ROLE-5, ROLE-3, ROLE-2, ROLE-1, ROLE-4, APP-5, BRW-4.

- **One schedule (ROLE-5), no contact column (ROLE-3).** See the convention
  notes above — including the `HH:MM:SS` bug that had every schedule reading
  "Times vary", and `schedule_revision`.
- **Removal is a state, not a deletion (ROLE-1).** See the note above.
- **Closing or changing tells the registrants (ROLE-2).** One trigger,
  `notify_role_state_change`, handles all three transitions so their
  precedence is explicit: removed beats closed beats changed, and an
  already-removed role says nothing further. A change is noticed on title,
  description, location, town, flexible-or-not, DBS, and
  `schedule_revision`.
- **Reopening happens in the edit form (ROLE-4).** The dashboard's one-click
  "Mark as Active" is gone: it put a role back on the browse with whatever
  dates it closed with, usually already past. The form offers it while the
  organisation is looking at those dates, and only when the dates are ahead.
- **APP-5 is split on purpose.** Length limits are CHECK constraints
  (`title` 120, `description` 5000, `location` 200, `closed_reason` 200,
  `volunteers_needed` 1-500) because the form is not the only way in.
  `skills` 300 was on this list and went with the column (POLISH-7), along
  with its mirror in `contentChecks.js`. The banned-word list is
  client-side only, in
  `src/utils/contentChecks.js`, because a false positive in the database is
  a 23514 nobody can read. **No SQL-injection or HTML filter** — the user
  asked, the reasoning against is in the APP-5 thread, and they accepted it.
- **BRW-4:** the browse searches description, skills and organisation name,
  not just the title. Since POLISH-7 the skills half reads
  `public_opportunities.skill_names`, not a free-text column.
- **The advisor's twelve anon-executable SECURITY DEFINER functions are down
  to three,** all deliberate: `count_volunteers`, `count_organisations` and
  `is_approved_org` — the last of which **anon must keep**, because the
  public browse policy calls it (same shape as the `admins` lesson in
  workflow 4).

Two regressions this workflow caused and fixed, both worth remembering
because neither was visible from the code:

- **`org_can_crud_their_posts`'s WITH CHECK is evaluated on the NEW row,** so
  setting `deleted_at` on an `active` role was refused for any organisation
  whose approval had been withdrawn. With DELETE revoked, its roles were
  stuck in the table permanently. Approval now gates publishing only —
  removal is always permitted.
- **`set_application_org_id()` and the applications INSERT policy disagreed**
  about `deleted_at` until they were made to agree. When two things guard one
  event, guard both or neither.

Re-runnable: `.scratch/probe_wf5.py` (50 cases, self-seeding) and
`.scratch/walk_wf5.py` (39 UI checks).

**Workflow 6 is built (2026-09-16, branch `wf6-interest`).** One migration
and a redeploy of `send-outreach`. Items: INT-2, INT-3, INT-4, CON-5, CON-4,
CON-2.

- **INT-2 and INT-4** — see the note above. The one live registration had a
  real person's subject *and* message, so the migration folded the subject
  into the front of the note rather than dropping a third of what they
  wrote.
- **CON-5: outreach may name one of the organisation's OWN LIVE roles.**
  Validated in `send-outreach`, not trusted from the client: another
  organisation's role, a draft, a removed role and a non-existent id are all
  refused. The picker only appears on a *cold* approach — from the
  applicants page the role is already fixed. The email names the role and
  links to it **only when `APP_URL` is set**; unset, the title still appears
  without a link, because a link to a guessed host is worse than no link.
  **`APP_URL` is not yet set** — set it to the Cloudflare Pages origin.
- **CON-4 needed no code:** there is no unsubscribe link on an
  organisation's message and that is the decision. What carries the weight
  is the CON-6 pointer, which appears only on *unprompted* mail — and now
  correctly appears for a volunteer who withdrew, because `hasApplied`
  excludes withdrawn rows.
- **CON-2 was already built** in workflow 1 (`notify_outreach_received`).
  Verified rather than rebuilt: the volunteer gets the bell notification and
  the organisation does not get one for its own message.
- **INT-3 was settled by ROLE-1** and is verified here: a registration
  survives its role being removed, and the volunteer is still told which
  role it was, by name, via `my_registrations`.

`opportunity_title` on `applications` is redundant now that
`my_registrations` joins the title — but unlike `date_needed` it *is*
written on every insert and two functions read it as a fallback, so it was
deliberately left alone rather than swept up.

> **Re-seed the throwaways at the start of a session: `.scratch/seed_throwaways.sql`.**
> Deleting them at the end of a session is right, but it leaves every
> earlier workflow's probe unable to log in, which looks exactly like the
> probe being broken. `probe_wf3` and `probe_wf6` sign up their own
> volunteers instead — **`probe_wf6` has to**, because `send-outreach`
> enforces a 24-hour cooldown per (organisation, volunteer) pair, so a fixed
> pair makes every positive send test fail with a 429 on the second run of
> the day. `walk_wf6` has its own volunteer C for the same reason: the
> probe's sends make the compose form render its cooldown notice, and the
> CON-5 picker is then not on screen to find.

Re-runnable: `.scratch/probe_wf6.py` (39 cases, self-seeding) and
`.scratch/walk_wf6.py` (25 UI checks).

**Workflow 7 is built (2026-09-16, branch `wf7-admin`).** Three migrations.
Items: ADM-6, ADM-1, ADM-2, ADM-5.

- **`towns` is the list (ADM-6).** The CHECK on `volunteer_opportunities.town`
  is gone, replaced by a foreign key to `towns(name)`; `user_profiles.home_town`
  got one too (it had no constraint, and every row was already `Windsor`).
  A row may only be filed under an **active** town *when its town changes*,
  so nobody is locked out of saving an unrelated field. A town cannot be
  deactivated while any non-removed role or any person is filed under it,
  nor can the last active town go (`towns_guard`). Every change to `towns`
  is audited. **No `ON UPDATE CASCADE`, on purpose:** renaming a town would
  rewrite `town` on its roles and fire ROLE-2 "updated" notices at every
  registrant.
- **The disappearing picker is one rule in two places.** Client:
  `useTowns()` in `src/utils/towns.js` returns `showPicker` (more than one
  active town); every picker reads it — sign-up, both role forms, both
  profile pages, the browse, the volunteer search, the admin volunteer
  filter. Database: `sole_active_town()` fills a NULL `town`/`home_town`
  with the only active town, so a form submitted before the towns query
  lands is still filed correctly. **A hidden required field fails
  validation silently** — the profile schemas' `home_town` is optional now
  and `onSubmit` asks for it only when the picker shows.
- **Old Windsor, Slough, Maidenhead and `WF7 Probe Town` are inactive rows.**
  The probe town is reused by `probe_wf7`/`walk_wf7` and cannot be deleted
  (removed roles reference it). **Both scripts make a second town active on
  the live site for a few seconds** — pickers appear for real visitors in
  that window. They restore it in `try/finally`; if either is killed
  mid-run, check `towns` and deactivate it by hand.
- **ADM-1: `admin_take_down_role(id, reason)`** removes (ROLE-1, terminal),
  never closes — the organisation could reopen a closed role from its own
  form. A reason is required and audited. The ROLE-2 notice now says "taken
  down by Well Windsor" unless `auth.uid()` is the organisation; the
  volunteer dashboard copy is neutral ("This role has been removed"). **The
  organisation is not notified** — the dialog says so.
- **ADM-2/ADM-5: `admin_switch_account_type(user, role, dob)`** is the only
  way a role changes. `authenticated` still has no UPDATE on `role` (a
  client PATCH, an admin's included, is `42501`). `prevent_role_change()` now
  allows a change only when the transaction-local `app.account_switch` flag
  is on **and** `current_user` is not a browser role — the same shape as
  `app.audit_redaction`. Volunteer → organisation: pending approval,
  registrations **withdrawn** (INT-4, kept), and dob/phone/bio **cleared**
  with the `volunteer_skills` rows **deleted** (POLISH-7 — it used to null a
  `skills` string), because organisation rows are readable by signed-in
  users. Organisation → volunteer: 18+ dob required, live roles **closed**
  (registrants told), drafts left, approval cleared.
- Noticed, not changed: `notify_role_state_change` notifies every
  registrant including those who **withdrew**, and `opportunity_applicants`
  does not check the caller is still an organisation, so an account switched
  to volunteer can still read who registered for its old roles.

Re-runnable: `.scratch/probe_wf7.py` (74 cases, self-seeding) and
`.scratch/walk_wf7.py` (47 UI checks). `walk_core_loop` and `walk_wf5` were
updated: they selected `#town`, which no longer exists with one town.

**Workflow 8 is in progress (2026-09-16, branch `wf8-launch`).** It is the
launch gate and most of it is not code. **Open decisions live in
`PENDING-DECISIONS.md` at the repo root** — the user reviews them in batches;
add to it rather than stopping to ask (destructive or outward-facing actions
still need an explicit yes).

- **Final security pass (item 6): done.** Every table, view and SECURITY
  DEFINER function was checked from `relacl`/`proacl`, then write-tested live:
  `.scratch/probe_wf8_final.py` (100 cases; every refusal aimed at a throwaway
  row and read back). RLS is on for all 14 tables; anon's only write is the
  `problem_reports` INSERT; no SECURITY DEFINER function is on the default
  PUBLIC grant. One fix: `authenticated` held DELETE on `user_profiles` with
  no policy behind it — revoked (20260916155009). Harmless but noted:
  `anon`/`authenticated` hold Postgres 17's MAINTAIN (`m`) on several tables
  by Supabase default, unreachable through PostgREST; and
  `log_admin_action()`/`create_notification()` are pre-WF1 residue, not
  callable from a browser.
- **The email outbox forgot nothing (fixed, 20260916160232).** Addresses,
  names and full message text stayed for ever, including after account
  deletion — against ADM-4. `prepare_account_deletion()` now blanks the
  deleted person's rows, and `expire-email-outbox-content` (pg_cron, 03:20
  UTC) blanks every sent/abandoned row 30 days after sending. `held` and
  `failed` rows keep their content. Proven with the real `delete-account`
  function and a backdated row. **Any new email template that carries personal
  data is covered by the 30-day job, not by deletion** — deletion only finds
  rows sent *to* or recorded *against* the account.
- **Privacy policy (`/privacy`) and `/delete-my-data` are built, not
  approved** (WF8-5). Every statement was checked against the live system.
  **If you change what happens to personal data, change `PrivacyPage.jsx` in
  the same commit.** Linked from the footer and the sign-up form.
- **Poppins is self-hosted** (`@fontsource/poppins`, imported in `main.jsx`);
  no page requests Google Fonts. `walk_wf8` checks this.
- **`useUserProfile().loading` is slow for signed-out visitors:** its session
  query throws with no session and React Query retries three times. Use
  `useSession()` from `SessionContext` to decide signed-in-or-not.
- **Seed data (item 1): script written, NOT run** —
  `supabase/launch/delete_seed_data.sql`, outside `migrations/` on purpose.
  Waiting on real organisations (WF8-1) and the junk-account list (WF8-3).
- Items 3–5 (dashboard toggles, hosting, email confirmation) are the user's;
  see `PENDING-DECISIONS.md`.

- **Dependencies: `npm audit fix` (2026-09-16), lockfile only.** 0 vulnerabilities
  after. `@supabase/supabase-js` jumped 2.49.9 → 2.116.0 and `react-router-dom`
  7.13 → 7.18. All ten walks passed on the new versions.
- **No walk had ever driven `supabase.functions.invoke`** — the probes call
  Edge Functions over raw HTTP, bypassing supabase-js. `.scratch/walk_invoke.py`
  now covers both browser callers (send outreach, delete account), including
  the refusal path `outreach.js` reads out of `error.context`. When an account
  is deleted, a 403 from `/auth/v1/logout` and a few 401s are expected and
  harmless: supabase-js calls logout for any sign-out scope, ignores the
  error, and clears the session (the walk proves it).
- **Trap: "same lint findings" checks were vacuous until 2026-09-16.**
  `eslint -f unix` is no longer bundled; it printed an error, both sides of the
  diff were empty, and "identical" passed on nothing. The 13/3 *totals* were
  real throughout; identity of the findings was not proven until
  `.scratch/lint_list.cjs` (built-in `-f json`, refuses an empty list) showed
  the same 16 findings at WF6 and after WF8. **A comparison of two empty files
  is not a comparison — check the count on each side.**
- **Stop a background dev server by its process tree, not the shell task.**
  Killing the task left `vite` and `esbuild.exe` running, which locked
  `node_modules` and made `npm ci` fail with EPERM, then ENOTEMPTY (OneDrive).
  Find the PID listening on the port and `taskkill //PID <pid> //T //F`.

Re-runnable: `.scratch/probe_wf8_final.py` (100), `.scratch/walk_wf8.py` (21),
`.scratch/walk_invoke.py` (6, sends one email to a `.invalid` address),
and `.scratch/probe_wf8_outbox.py` (signs up and approves a throwaway org;
`--delete` deletes it; verify the outbox with SQL — it has no client grants).

**Workflow 9 batch 9.1 is built (2026-09-18, branch `wf9-1-public-view`).**
One migration. See BUILD-PLAN for the remaining batches, 9.2 to 9.7.

- **`public_opportunities` is the one definition of a publicly visible role:**
  active, `deleted_at is null`, and an approved organisation, with that
  organisation's name joined on. The browse, the home list and the home
  page's role count all read it.
- **The bug it closes: "status = 'active'" is not the same question as "is
  this public", and RLS answers it differently for everyone.** A removed role
  keeps `status = 'active'`, and RLS deliberately lets an admin read every
  role and an organisation read its own — so with two fixture rows in place
  the same browse query returned **16 rows to an admin, 15 to the
  organisation that owned the removed one, and 14 to anon**. Owner rights on
  the view is what makes those three identical; a policy could not, because
  the whole point is that the caller's policies differ.
- **Approval is checked by joining `public_organisations`, not by a second
  copy of the rule.** That view already defines an approved organisation, and
  the inner join both filters and names in one step.
- **The match RPC was corrected rather than left for 9.2.** It carried its own
  status/`deleted_at` filter and **no approval check at all**, so an admin
  whose own account is a volunteer took a third path to a third list. Same
  signature, `CREATE OR REPLACE`, so the ACL survives (trap 1c).
- **The detail page still reads the table** — an organisation previewing its
  own draft needs that — and asks the view a second question: is this public?
  If not, it says so plainly and drops the register button and the "they will
  email you" promise, which would otherwise be describing something that
  cannot happen.
- **A view with a join refuses writes with `55000`, not `42501`.** Postgres
  rejects it as not auto-updatable before it looks at privileges, so that
  denial is not evidence the revoke landed. `pg_class.relacl` is
  (`anon=r`, `authenticated=r`); read the ACL, do not infer it from an error
  code.

Re-runnable: `.scratch/probe_wf9_1.py` (36 cases, down from 40 once 9.2 removed
its match-RPC section) and `.scratch/walk_wf9_1.py` (25 UI checks). Both need
the two fixtures in `seed_throwaways.sql`.

**Workflow 9 batch 9.2 is HALF applied (2026-09-18, branch
`wf9-2-remove-availability`).** The client is done; **the drop migration is
written and deliberately NOT applied** — `supabase/pending/wf9_2_drop_availability.sql`.
Code archived at `archive/availability-matching` (a pointer at 6ddf94b, the
same convention as `archive/log-hours`).

- **One database, two deploys, and that is the whole reason for the split.** A
  migration lands when it is applied; the client lands when `main` is merged
  and Cloudflare rebuilds. The drops remove columns the *currently deployed*
  site still reads and writes, so applying them first breaks the volunteer
  profile page, Find Volunteers and sign-up for real users, for however long
  the merge takes. **Merge and deploy the client, then apply.**
  `supabase/pending/README.md` has the procedure; a file in `migrations/`
  that has not been applied breaks the files-equal-ledger check, which is why
  it is not kept there.
- **The removal reaches further than BUILD-PLAN listed.** Four functions
  referenced the columns, not two: `handle_new_user`,
  `match_opportunities_by_availability`, `day_labels_to_indices` **and
  `admin_switch_account_type`** (WF7-2 cleared availability on a switch).
  And **two** views carry the columns, not one — `opportunity_applicants`
  joins `user_profiles` as well, so it fails with the same 2BP01. Both are
  dropped and recreated with grants in the same migration (trap 1b).
  `handle_new_user` is the dangerous one: it is a SECURITY DEFINER trigger on
  `auth.users`, so if it still named a dropped table **every** sign-up would
  fail, not just a volunteer's. `probe_wf9_2.py` signs up to prove it does not.
- **`AvailabilityMatrix.jsx` stays.** The post and edit forms use it for a
  ROLE's schedule (`opportunity_timeblocks`), which is a different thing and
  is what 9.3's ordering reads. The walk checks the grid is still on the
  post-a-role form, because the component is shared and this is the easy
  thing to break by accident.
- **`schedule.js` had a whole second matcher nobody called** — five exported
  overlap helpers, client-side, duplicating what the RPC did in SQL. No
  importer outside the file. Deleted with the rest.
- **`innerText` applies CSS `text-transform`.** The volunteer card's labels are
  in an `uppercase` class, so a walk checking `"Availability" not in text`
  passed against a card printing `AVAILABILITY`. It also found the word in a
  real volunteer's **bio** ("I have flexible availability on weekends"), which
  is free text and not the UI. Assert on the label elements, not the page text.

Re-runnable now: `.scratch/walk_wf9_2.py` (22 UI checks).
**After the drop only:** `.scratch/probe_wf9_2.py` — it fails for the right
reason beforehand and looks like a break.

**Workflow 9 batch 9.3 is built (2026-09-19, branch `wf9-3-browse`).** No
migration: this batch is all client.

- **The "When" filter is gone; an Organisation filter replaces it.** The org
  list is built from the roles already fetched, not from
  `public_organisations`, so it offers only organisations with a live role and
  no choice can lead to an empty page.
- **Ordering is the soonest NEXT date, which is not the earliest start.** A
  role running 1 Sep to 25 Dec offers *today*, not 1 September — the old rule
  sorted it above a role starting tomorrow. And a flexible role was given
  `new Date()` as its start, the earliest date possible, so every "any time"
  role floated to the top of a list meant to answer "what is happening soon".
  Three buckets now: has a future date (ascending), then no dates given
  (flexible or no schedule), then finished. The home page's "Upcoming" uses
  the same comparator — `getStartDateForSort`/`compareByEarliestStart` are
  deleted, so there is one rule and not two.
- **10 a page**, `?page=` in the query string so Back works, clamped so
  `?page=99` shows the last page rather than an empty one that reads as "no
  results", and changing a filter returns to page 1. `src/components/Pagination.jsx`
  is shared with 9.4 and 9.6.
- **A UI walk cannot test an ordering rule.** The live roles' dates are
  whatever they are today, so the cases that matter — running-since-last-month,
  finished-yesterday, starting-tomorrow — may simply not exist when it runs.
  `.scratch/test_order_wf9_3.mjs` imports `schedule.js` directly and constructs
  them. The walk only proves the rule is wired to the page.
- **Never compare a local-midnight `Date` with `toISOString()`.** `toDate()`
  uses date-fns `parseISO`, which yields LOCAL midnight, and `startOfToday()`
  matches it — so the module is consistent. The first draft of the unit test
  built its expected dates with `toISOString()`, which converts to UTC and
  lands a day earlier in British Summer Time: four tests failed against
  correct code.
- **`walk_wf5` was leaking a live role onto the public browse on every crash.**
  It creates its fixtures over REST at module level, before the browser
  launches, and its cleanup sits after `browser.close()` with no `finally` —
  so the two runs that died on a refused connection left "Walk Doomed Role"
  active on the real site. Now swept by `atexit`, registered as soon as the
  fixtures exist. **Any walk that posts an active role needs that, not a
  cleanup at the bottom.**

Re-runnable: `.scratch/test_order_wf9_3.mjs` (22 cases, no database) and
`.scratch/walk_wf9_3.py` (25 UI checks, read-only — it creates nothing).

**Workflow 9 batch 9.4 is built (2026-09-19, branch `wf9-4-volunteers-paging`).**
Find Volunteers pages at 10, with the same component. No migration.

- **Paginating a list with no `ORDER BY` is a bug, and an invisible one.**
  `public_volunteers` was unordered, and Postgres promises nothing about the
  order of an unordered SELECT — harmless while the whole list rendered at
  once, but once it is sliced into pages the same volunteer can appear on
  page 1 and page 2, or on neither. The query now orders by `name` then `id`.
  The walk loads the list twice and compares both pages to catch a regression.
- **`Pagination` took a `perPage` prop.** It hardcoded 10 in its
  "Showing 1–10 of N" line, which would have printed the wrong range above
  the admin lists' fifty rows in 9.6 — wrong in a way that reads as a data
  bug rather than a formatting one.
- **Testing it needed 11+ discoverable volunteers and there were 7.** Eight
  `wf94-vol-NN@wellwindsor-test.invalid` fixtures were inserted and deleted in
  the same session. Discoverable volunteers are visible only to an **approved
  organisation** (`public_volunteers` gates on `is_approved_org`), never on
  the public browse, so these are far less exposed than a throwaway role —
  but they are visible to the real organisations, so they do not outlive the
  run. The walk says it cannot test paging rather than passing quietly when
  the list is too short.
- **Address a pagination button by its label, not by where you are.** The
  walk clicked "Go to page 2" from a page that was already page 2, where that
  button does not exist — Next is labelled "Go to page 3" and disabled.
- **A cold `npm run dev` needs more than 30s for the first navigation.**
  `with_server` reports ready when the port accepts connections, but vite is
  still optimising dependencies, so the default 30s navigation timeout
  expires against a server that is merely busy. First goto gets 120s, and
  sign-in waits for the URL to change rather than a fixed 3s — a short wait
  there left the walk on `/auth` and reported a missing `#search`.

Re-runnable: `.scratch/walk_wf9_4.py` (20 UI checks; needs 11+ discoverable
volunteers, and says so if not).

**The drops of 9.2 were applied 2026-09-19** as
`20260919194219_wf9_drop_availability_matching`, once the client was merged
and live. **The deploy was verified, not assumed:** the published bundle was
fetched from `pages.dev` and grepped, and contains zero references to any
availability column, table or RPC. The row-count guard passed — nothing else
changed. `probe_wf9_2` 24/24; `probe_wf8_final` lost its
`volunteer_availability` section and is 96/96.

**Workflow 9 batch 9.5 is built (2026-09-19, branch `wf9-5-reopen`).** No
migration.

- **A closed role gets three buttons that say what they do:** *Save and
  reopen* (publishes, then returns to the dashboard), *Save and keep closed*,
  *Discard changes*. The old "Reopen this role" sat inside the notice while a
  "Save Changes" at the bottom looked identical and did something different.
  ROLE-4's rule is unchanged: reopen is disabled, with the reason on screen,
  while the dates are past.
- **Save-and-reopen does not require unsaved changes** — an organisation may
  want to reopen a role exactly as it stands. The other two do.
- **A flag passed to `mutate()` must be stripped before the update.**
  `__reopened` tells `onSuccess` which of the two happened; left in the
  payload it would go to PostgREST as a column and come back `PGRST204`.

**Three suites were leaking live roles onto the public browse, all the same
way:** they post an `active` fixture at module level, before the `try`, and
clean up at the bottom — so any crash in between leaves it on the real site.
`walk_wf5`, `probe_wf8_final` and (by construction) `walk_wf9_5` now register
an `atexit` sweep the moment the fixture exists. **Any script that posts an
active role needs that, not a cleanup at the end.** Five leftovers were found
and removed the ROLE-1 way on 2026-09-19.

**Two throwaway accounts on production are indistinguishable on screen** —
`probe_wf6` signs up a volunteer with the same name, bio, town and skills on
every run, so nothing rendered told them apart and "is any row served on two
pages" was untestable. `LookingForVolunteers` now carries
`data-volunteer-id` on each card. A display name is not an identity.

Re-runnable: `.scratch/walk_wf9_5.py` (26 UI checks, fixtures swept by
`atexit`).

**Workflow 9 batch 9.6 is built (2026-09-20, branch `wf9-6-admin`).** One
migration, three new components, three routes.

- **The admin is three pages over one component:** `/admin` (Access),
  `/admin/manage` (Opportunities, Organisations, Volunteers, Towns as
  sub-tabs), `/admin/logs`. One component keeps the queries and dialogs in
  one place; `useLocation()` picks the section. Access is the landing page
  because the approval queue is the only part with a person waiting at the
  other end.
- **Declining an organisation (`decline_organisation`).** `declined_at` is
  set by that function and nothing else; the reason goes to the audit log,
  not a column. It is deliberately quiet: the organisation is **not told**
  and nothing it can do changes -- still cannot publish, still can save
  drafts. Approving un-declines; withdrawing approval does **not** re-decline.
  The waiting count is now `approved_at is null AND declined_at is null`,
  so the badge can actually reach zero.
- **`declined_at` is safe by construction, not by the revoke in the
  migration.** `authenticated` holds `rm` on `user_profiles` -- **no
  table-wide UPDATE** -- and UPDATE is granted on seven named columns.
  Read `relacl` before believing a revoke did anything (trap 1d); the one in
  that migration is a no-op kept as a guard.
- **ADM-3 finally has a screen** (`/admin/logs`): messages organisations
  sent volunteers, and automatic emails. Both come from admin-only SECURITY
  DEFINER functions. `email_outbox` has **no client grants at all**, so a
  function rather than a policy; the outreach log resolves the address the
  message actually went to from `auth.users`, which a browser cannot reach.
  Neither returns the outbox `payload` -- it is a second copy of what the
  30-day job blanks. Message text sits behind **Show message**, and
  `PrivacyPage.jsx` gained a line saying admins can see messages.
- **`CREATE OR REPLACE` cannot change a `RETURNS TABLE`, so cast in the
  BODY.** `admin_email_log` declared `attempts integer` over a `smallint`
  column and every call failed with `42804`. Casting `e.attempts::integer`
  fixes it without a DROP, which would have handed EXECUTE back to anon
  (trap 1c).
- **An error and an empty table look identical through a REST response.**
  That 42804 returned no rows, which was read as "the outbox is empty" -- so
  a fixture row was inserted to test against. The outbox had 35 rows going
  back two days. Check the status code before concluding anything about the
  data.
- **Approving an organisation queues and SENDS an `org_approved` email.**
  `is_test_address()` guards the signup alert, not this one, so a probe that
  approves a throwaway org really does send -- harmless only because the
  throwaways are all `.invalid`. 35 outbox rows accumulated during this
  batch; none went to a real address.
- **Admin lists page at 50** (`Pagination` with `perPage`), and the page
  resets when the sub-tab changes.

Four earlier walks navigated the old tab bar and had to be re-pointed:
`walk_wf1` (reports are on `/admin/logs`), `walk_wf4` (Access is a page, not
a tab), `walk_wf7` and `walk_audit` (the four lists are on `/admin/manage`).
`walk_wf7` also matched `^Organizations`; the sub-tab is UK-spelled now, so
it accepts either.

Re-runnable: `.scratch/probe_wf9_6.py` (37 cases) and
`.scratch/walk_wf9_6.py` (36 UI checks; it declines the pending throwaway
through the UI and restores it by `atexit`).

**Workflow 9 batch 9.7 is built (2026-09-20, branch `wf9-7-account-page`).**
One migration, one page, two dialogs. **This finishes Workflow 9.**

- **`/admin/accounts/:id` — one person, one page.** Profile, what they have
  on the site, their audit history, and the per-person actions gathered:
  approve / withdraw / decline, switch account type (moved off the list
  screens), change login email, delete.
- **The volunteer list's "View" button pointed at `/volunteers/<id>`, which
  is not a route** — the catch-all sent the admin to the home page. It has a
  destination now, and the organisation list and the approval queue link to
  the same page.
- **ADM-8 has a screen at last.** `admin-change-email` has existed and been
  proven since workflow 3. The dialog reads the refusal out of
  `error.context`, the way `outreach.js` has to.
- **WF8-6 is closed: `admin_delete_account(user, reason)`.** Deleting from
  the Supabase dashboard skips `prepare_account_deletion()`, so the preserved
  outreach record, the audit-log redaction and the outbox blanking never run
  — three things the privacy policy promises. **Written in SQL rather than as
  an Edge Function on purpose:** `delete-account` prepares over RPC and then
  calls `auth.admin.deleteUser` over the API, two steps that can half-succeed
  (it has an `account_deletion_failed` branch for exactly that). In the
  database it is one transaction. It refuses an admin (revoke access first)
  and refuses self (use your own profile page), and needs a reason and the
  typed word DELETE.
- **Order matters, and it is: prepare, then log.** The redaction scrubs
  personal VALUES and the `reason` column while keeping `actor_id` and
  `target_user_id`, so the "deleted by an admin" entry is written **after**
  it — written before, the admin's reason would be blanked to 'deleted user'.
  That entry therefore carries no personal data of its own.
- **`outreach_preserved_on_deletion` rows are NOT keyed to the person.**
  They carry `target_table = 'org_outreach'` and the message's id, with the
  ids in metadata and **no `target_user_id`** — which is also why the
  redaction, matching on `target_user_id`/`actor_id`, leaves them alone (they
  hold no names to scrub). Querying for them by `target_user_id` finds
  nothing and reads exactly like "the record was never written".
- **The volunteer-facing outreach email never enters `email_outbox`.**
  `send-outreach` sends it directly; the only outbox row a message produces
  is the `outreach_copy` addressed to the ORGANISATION and keyed to it. So
  deleting a volunteer reports `emails_redacted: 0` and that is correct —
  their copy is covered by the 30-day job, not by deletion.
- **Casting again, for the same reason as 9.6.** `audit_logs.created_at` is
  `timestamp WITHOUT time zone` holding UTC and `action_type` is `varchar`;
  both are cast in the body of `admin_account_history`, because
  `CREATE OR REPLACE` cannot change a `RETURNS TABLE` and a DROP would hand
  EXECUTE back to anon (trap 1c).
- **A not-found must not be retried.** The account queries use
  `retry: false`: React Query retried the `P0002` three times, so a stale
  link sat on "Loading…" for several seconds before admitting the account
  was gone.

Re-runnable: `.scratch/probe_wf9_7.py` (33 cases; signs up its own doomed
volunteer, has an organisation write to them, then deletes them) and
`.scratch/walk_wf9_7.py` (25 UI checks, its fixture swept by `atexit`).

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

Since workflow 2 the organisation *is* told about new registrations, by the
8am digest and the bell — but still never by an email per registration, and
there is still nothing to accept or decline. And since workflow 6 the
silence runs both ways: withdrawing is invisible to the organisation, which
is never told, so neither side has to explain itself.

## Polish pass (2026-09-20 to 09-22, branch `polishes` then `polish-skills-part2`)

Workflow 9 finished the plan; this is the round of "make it production-ready
to my liking" the user drives by walking the site. **Decisions live in
`PENDING-DECISIONS.md` as POLISH-1 to POLISH-7.** The working agreement for
this round: the user describes what they do not like, Claude states back what
it will change *before* touching anything, and asks whenever two readings are
possible. Nothing is widened beyond what was asked.

**The browse filter card.** Clear Filters is a small teal pill in the card's
top-right corner and appears only when there is something to clear — a search
term, either picker off "All", or an `?opId=` deep link. It is absolutely
positioned so nothing moves when it appears. Search takes two thirds.

**The role detail page is one column, and has no photograph.** The picture was
never the organisation's: there is no upload and no image column, so
`opportunityImages.js` gives every role one of six stock photos, and with
almost no row carrying a category most get one of three neutral fallbacks
hashed off the id. Nor could it be sharp — the widest rendition is 800px
against a full-window band, so the browser upscaled it and then cropped a 3:2
photo into a 288px letterbox. **The browse cards keep theirs**, where 800w is
ample for a ~500px card. Order: chips → description → When → Where → What you
need → skills → about → register.

**DBS is stated once.** It was in the facts panel and again in a notice
directly beneath it — the same sentence twice, stacked.

**`getNextSessionDate()` is not `getNextDateFromToday()`.** The latter answers
"when could this be turned up to at all" and returns TODAY for a role running
now, which is right for the browse ordering and wrong on screen: a
Saturday-only role would print "next session: Tuesday" on a Tuesday. The
former only ever returns a date whose weekday the organisation named. Covered
by `.scratch/test_next_session.mjs` (14 cases) — a UI walk cannot test it,
because the live roles' dates are whatever they are on the day.

**Skills became a managed list** — see the convention above, and POLISH-4 to
POLISH-7. Three lessons from doing it that generalise:

- **One database, two deploys, and a transitional client writes BOTH.** The
  first pass wrote the join rows *and* the derived text, because a CHECK
  demanded the string. That was right, and it meant the drop needed its own
  deploy. Check the **deployed bundle**, not the repo, before applying
  anything that removes a column:
  `curl -s <origin>/ | grep -oE '/assets/index-[A-Za-z0-9_-]+\.js'`, then grep
  that file for the reads and writes you are about to break.
- **A walk that creates something must record it BEFORE it asserts.** An early
  `walk_skills` added a skill, asserted, crashed on the assertion, and left it
  ACTIVE in every real picker on the live site — `atexit` swept a list that
  was still empty.
- **One browser context is one session.** Opening a second page in the same
  context and signing in as another account replaces the first page's session;
  the admin tab then renders "that area is for Well Windsor admins" and a
  working button looks broken. Use `browser.new_context()` per account.
  Switching account in one context also fills the console with 406s — React
  Query refetches with the OLD user's id and the NEW user's token.

Re-runnable: `.scratch/probe_skills.py` (32), `.scratch/walk_skills.py` (26),
`.scratch/walk_filters.py` (26), `.scratch/walk_detail_a.py` (18),
`.scratch/test_next_session.mjs` (14).

**Still open after this round:** `formatDateRange` prints "Sep 12 – Nov 28,
2026" US-ordered for a UK audience; it is shared with the browse cards and the
home page, so changing it moves three surfaces at once.
