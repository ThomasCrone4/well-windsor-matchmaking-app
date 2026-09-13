# Well Windsor v1 — Build Plan

**Written 2026-09-13. Hand this to a fresh Claude Code session.**

This plan turns the 43 decisions recorded on the logic map into built software.
Read `CLAUDE.md` first — it holds the conventions and the traps. This file holds
the *order*, and the reason for the order.

The decisions themselves live at:

    https://claude.ai/code/artifact/5ceb5a1e-9810-477d-b37e-8d5cd55bd5b3

Every item there has a stable code (`ACC-4`, `ROLE-2`, `ADM-7`). This plan
references those codes. When you finish an item, mark it built on that page.

---

## How to work through this

**One workflow at a time, finished completely, before the next one starts.**
That is the user's explicit instruction and it is the single most important rule
here. Do not start workflow 3 because workflow 2 is blocked — say it is blocked
and stop. A half-built workflow is worse than an unstarted one, because nobody
can tell which half works.

**Each workflow is a vertical slice:** migration → security proof → Edge
Function if needed → UI → walk the flow → commit → PR → merge.

### Branching

One branch per workflow, off `main`, merged by PR. `main` stays deployable.

    git checkout main && git pull
    git checkout -b wf3-accounts
    # ... work ...
    git -c http.sslBackend=schannel push -u origin wf3-accounts
    gh pr create

Never commit to `main`. Push needs `-c http.sslBackend=schannel` on this
machine — see CLAUDE.md for why, and do not reach for `sslVerify=false`.

### Definition of done — all four, every workflow

A workflow is done when **all** of these are true. If you cannot do one, say so
plainly rather than declaring the workflow finished.

1. **Playwright walk of the real flow.** Drive the actual pages, watching
   `console` and `pageerror`. Scripts go in `.scratch/` (gitignored). On
   Windows start them with `sys.stdout.reconfigure(encoding="utf-8")`.
   `npm run build` passing is not evidence that anything works — on 2026-09-03
   the build was clean while the logged-out browse returned zero results.
2. **Outside-in security probe,** for anything touching data access. Probe with
   the anon key and with a throwaway user. **Provoke the case that should fail
   and confirm it fails** — a `204` or a `200 []` is not proof of denial, look
   for `42501`. Re-run `.scratch/probe_security2.py` and `walk_audit.py`.
3. **Build and lint clean.** `npm run build` emits no esbuild diagnostics.
   eslint stays at or below the baseline of **13 errors / 3 warnings**, all
   pre-existing. Do not let it grow.
4. **Logic map updated.** Mark the items built, so the page keeps saying what is
   done versus merely decided.

### Migrations

Production holds real accounts. Per migration:

1. Write the file to `supabase/migrations/` **first**.
2. Apply it with the Supabase MCP connector.
3. **Rename the file to match the version the connector assigned** — it stamps
   its own timestamp, and checking only the first of several is how a mismatch
   got committed on 2026-09-08.
4. Probe from outside immediately. Not by reading the SQL back.
5. Commit the file with the code that uses it.

A failed apply records nothing and rolls back whole, so a failure is safe.

---

## Verified current state, 2026-09-13

Checked against the live database and the repo today. Trust this over CLAUDE.md
where they disagree, and re-verify anything load-bearing before relying on it.

### Repo

- `origin/main` = `f9ed58d` (Phase 3 design merged, PR #4).
- **`v0-audit` is one commit ahead of `origin/main` and has never been merged.**
  That commit (`d47a5ad`) carries the six access fixes, org approval, 18+ and
  auto-close. All of it is live in the database already — only the repo is
  behind.
- **Local `main` is 19 commits stale.** `git fetch && git checkout main &&
  git reset --hard origin/main` before anything else.
- eslint baseline: 13 errors, 3 warnings.

### Database

| Fact | Value |
|---|---|
| Admins | **1** (`875907a2-baa6-47f8-8695-d7a0e61c8249`) |
| Organisations | 6, all approved |
| Volunteers | 6 |
| Live roles | 14, of which **13 are `5eed…` seed rows** |
| Roles with `when_needed` populated | **0 of 14** |
| Roles with timeblocks | **8 of 14** |
| Registrations | 1 |
| Outreach messages | 1 |
| Notifications | 0 |
| Edge Functions | 1 (`send-outreach`) |

Note the schedule numbers: `when_needed` is NULL on **every** role, and six
roles have no schedule in either place. This is worse than CLAUDE.md describes
and is why `ROLE-5` comes early.

### Tables that already exist and matter to this plan

- **`towns`** — `(id, name, is_active)`, 4 rows: Windsor active; Old Windsor,
  Slough, Maidenhead inactive. **`ADM-6` is half-built already.** But see the
  trap below: `volunteer_opportunities.town` has a hardcoded CHECK constraint
  listing Windsor/Maidenhead/Slough, so adding a town through an admin UI would
  be rejected by the database. The CHECK has to become a foreign key first.
- **`audit_logs`** — exists, 0 rows, but shaped for *admin actions*:
  `admin_id` is **NOT NULL**. `ADM-3` needs to log system events with no admin
  behind them (an email sent by the digest job). Needs a migration.
- **`notifications`** — exists, 0 rows. `type` is a free `varchar` with no
  CHECK, and its comment still names deleted `hours_*` types.
- **`org_outreach`** — already has a nullable `opportunity_id`. **`CON-5`'s
  role attachment needs no new column.**
- **`applications`** — has `subject` (dropped by `INT-2`) and `dismissed_at`.
  Has **no** withdrawal column; `INT-4` needs one.
- **`volunteer_opportunities.contact`** — NOT NULL. `ROLE-3` drops it.

### Residue to delete (from the removed ML and Log Hours features)

`volunteer_hours`, `match_results`, `user_status`, `site_settings`, the
`embedding_*` columns on two tables, `pgvector` in `public`, and the
`calculate_match_score`, `match_volunteers_for_opportunity`, `hours_*` and
`get_public_counts` functions.

`user_status` deserves a specific note: it has `is_banned` and `is_suspended`
columns that nothing reads or enforces. **Suspend/ban is explicitly out of
scope** (see below). Delete the table rather than leaving a flag that means
nothing — that is exactly the lie `UserManagement` shipped before it was
deleted.

---

## Scope decisions already taken

Do not re-open these. The user has settled them.

- **Suspend and ban are out of scope.** Withdrawing an organisation's approval
  already takes its roles down at once, which covers the real need. Volunteers
  have no power worth revoking. Do not build `is_active`, do not touch
  `auth.users.banned_until`, and delete `user_status`.
- **Seed data stays until the very end.** The 13 `5eed…` roles are the only
  realistic data to test browse, search and matching against. Workflow 8
  deletes them as the final gate before going public.
- **New pages match the approved Phase 3 design.** Use the existing CSS
  variable tokens in `src/index.css` and follow the patterns in the already
  reworked pages. No mockups to approve, no new design decisions.
  Hardcoded utilities like `text-gray-700` are a bug — they respond to neither
  theme.
- **DNS is controlled by the charity.** Workflow 2 produces a DNS request for
  them early and is built against Brevo's sandbox while the records are
  pending. Nothing downstream waits on the charity's reply.
- **`APP-4` is the only open question,** and it blocks nothing. It asks what a
  human checks before approving an organisation. Approval works without it.

---

# Workflow 0 — Repo hygiene

**Branch:** none. **Time:** minutes. **Do this before anything else.**

The repo does not currently reflect the database. Fix that first so every later
diff is honest.

1. `git fetch --all`
2. `git checkout main && git reset --hard origin/main`
3. Open a PR merging `v0-audit` into `main`, or merge it directly if the user
   prefers — it is one commit, already reviewed in substance, and its
   migrations are already applied to production.
4. Confirm `npm run build` is clean and eslint is at 13/3.
5. Confirm `supabase/migrations/` filenames match
   `supabase_migrations.schema_migrations` on the remote. Fix any mismatch now;
   a mismatch found later looks like a missing migration.

**Done when:** `main` contains the audit work, the build is clean, and the
migration ledger matches the repo.

---

# Workflow 1 — Foundations: the log, the bell, and problem reports

**Branch:** `wf1-foundations`
**Items:** `ADM-3`, `ADM-4`, `NTF-1`, `ADM-7`, `PIE-1`
**Why first:** every later workflow writes to the log or the bell. Building
those two first means each subsequent workflow adds its own events as it goes,
instead of a retrofit pass at the end that will be forgotten.

## 1.1 Clear the residue

One migration, dropping in dependency order: `match_results`,
`volunteer_hours`, `user_status`, `site_settings`, the `embedding_*` columns on
`user_profiles` and `volunteer_opportunities`, the `calculate_match_score`,
`match_volunteers_for_opportunity`, `hours_*` and `get_public_counts`
functions, and finally the `vector` extension from `public`.

Do this first so the later schema work is not stepping around dead tables.

Check nothing in `src/` references them before dropping — grep for each name.
`NotificationsDropdown` used to map four `hours_*` notification types to
now-deleted routes; confirm that mapping is gone.

## 1.2 The audit log (`ADM-3`, `ADM-4`)

`audit_logs` exists but assumes an admin actor. Migrate it to record system
events too:

- Make `admin_id` **nullable** and rename the concept to an actor, or add a
  nullable `actor_id` plus a NOT NULL `actor_kind` (`'admin'`, `'system'`,
  `'user'`). Prefer the second — it makes "who did this" answerable without
  interpreting a NULL.
- Add an index on `created_at desc` and on `target_user_id`.
- **Append-only, enforced in the database.** No UPDATE or DELETE grant to any
  role, including `authenticated`. A `BEFORE UPDATE OR DELETE` trigger that
  raises is belt and braces — add it, because a future migration granting table
  privileges would otherwise silently re-open the hole.
- SELECT to admins only, via `is_admin(auth.uid())`.

**GDPR redaction (`ADM-4`).** Write the redaction function now, even though
account deletion arrives in workflow 3: a `SECURITY DEFINER` function that
replaces name, email and message text in a user's log entries with
`'deleted user'` and leaves the dated record. Workflow 3 calls it.

> **Trap 1b applies.** Supabase's default privileges grant `ALL` on every new
> table to `anon` and `authenticated` **by name**. `revoke all ... from public`
> does nothing. Name the roles:
> `revoke all on audit_logs from anon, authenticated;` then grant back only
> SELECT to what needs it. Prove it with an anon probe expecting `42501`.

## 1.3 The bell (`NTF-1`)

`notifications` exists and nothing has ever written to it. Six kinds:

| To | When |
|---|---|
| Volunteer | an organisation has emailed you |
| Volunteer | a role you registered for was removed |
| Volunteer | a role you registered for closed or changed |
| Organisation | someone registered interest in one of your roles |
| Admin | an organisation is waiting for approval |
| Admin | someone has reported a problem |

- Add a CHECK constraint on `type` with exactly these six values, and update the
  stale comment naming `hours_*` types.
- **The database creates them, via triggers** — not the client. The old
  `notifications` INSERT policy was exploitable by any signed-in user; the
  current rule is that nobody can write into someone else's feed. Keep it.
  Triggers run `SECURITY DEFINER` and are the only writer.
- A user may UPDATE only `read_at`, only on their own rows. Granting UPDATE on
  the whole row lets someone rewrite their own notification text — harmless but
  sloppy, and it makes the log and the bell disagree.
- Wire `NotificationsDropdown` to real data. It currently reads a table that has
  never had a row, so **every rendering path in it is unexercised**. Expect
  bugs that have never had a chance to appear.

Notification routing: there are no notification-type routes anywhere now (they
went with Log Hours). Add them for the six types above.

## 1.4 Report a problem (`ADM-7`)

New table `problem_reports`: reporter (nullable — visitors can report),
optional contact email, the message, a status (`new` / `handled`), the page URL
it was reported from, and timestamps.

- **Open to anyone, signed in or not.** The person most likely to hit something
  broken is a visitor who cannot get past it. So `anon` needs INSERT — and that
  is the one place in this codebase where an anon write grant is correct. Rate
  limit it, and cap the message length, or it is an open spam funnel.
- Admins read and mark handled. Nobody can read anyone else's report.
- An in-app notification to admins on insert (trigger).
- The email to `hello@wellwindsor.org.uk` is wired in **workflow 2** — leave a
  clear TODO, do not half-build an email path here.
- Admin dashboard section listing reports with a handled toggle. The list is
  the point: an emailed report with no state cannot be tracked, and two admins
  cannot see each other's work.

**Done when:** an anon probe can insert a report and cannot read one; a
throwaway user's action creates a notification for the right person and for
nobody else; the audit log refuses UPDATE and DELETE as `authenticated`; the
bell renders real rows; all four done-criteria pass.

---

# Workflow 2 — Email

**Branch:** `wf2-email`
**Items:** `ACC-9`, `ACC-7`, `EML-1`, `EML-2`, `EML-3`, `CON-1`, `INT-1`, `APP-2`
**Why second:** four later workflows send mail. Build the pipeline once.

## 2.1 Send the DNS request first — day one of this workflow

The charity controls `wellwindsor.org.uk` DNS. Produce a single page they can
act on without knowing what any of it means: the exact SPF, DKIM and DMARC
records Brevo requires, where to paste them, and what breaks if they are wrong.
Send it, then carry on — everything below can be built and tested before the
records land.

**Decided by the user:** the sending address is **`volunteer@wellwindsor.org.uk`**
for now, to be confirmed by the charity. Sender name "Well Windsor".

## 2.2 The template

One plain template for all seven emails. Logo, one column, the charity's name
and registration number **1207021** in the footer, a link to the privacy policy.

This is not a taste decision. A brand-new domain has no sending reputation, and
heavy HTML is among the strongest signals spam filters weigh. Plain, text-led
mail with a real reply-to gets through while reputation builds. Revisit in six
months.

## 2.3 The seven emails

| # | Email | To | Trigger |
|---|---|---|---|
| 1 | An organisation's message | Volunteer | `send-outreach` (exists) |
| 2 | Password reset | Anyone | Supabase Auth → Brevo (`ACC-7`) |
| 3 | Confirm your email | Anyone signing up | Supabase Auth |
| 4 | Your account is now active | Organisation | admin approves (`EML-1`) |
| 5 | An organisation is waiting | Recipient list | org signs up (`APP-2`) |
| 6 | Daily digest, 8am UK | Organisation | `pg_cron` (`INT-1`) |
| 7 | Your message was sent | Organisation | `send-outreach` (`CON-1`) |
| 8 | A problem was reported | `hello@` | report inserted (`ADM-7`) |

**Explicitly not sent** (`EML-2`, `EML-3`, `APP-1`): no "closed or changed role"
email, no welcome email, and **no "you are awaiting approval" email** — that
last one was decided in version 2 and reversed on 13 September. On-screen only.

## 2.4 The digest (`INT-1`)

`pg_cron` at 08:00 Europe/London. Note the existing auto-close job runs at 00:05
**UTC** — be explicit about the timezone, because the two will disagree for half
the year and a digest arriving at 7am in winter is a bug nobody will report.

- One email per organisation with registrations since its last digest.
- Lists each person's name, the role, and the start of their note. **Never
  contact details.**
- Nothing sent when nobody is new.
- Record the send in `audit_logs` (workflow 1) so "did they get it?" is
  answerable.

## 2.5 Then, when DNS lands

Verify the domain in Brevo, point Supabase Auth's SMTP at Brevo, and **switch
email confirmation on** (`ACC-1`). `send-outreach` already refuses unconfirmed
addresses, so this is the moment that starts mattering.

> **Do not put any secret in a `VITE_` variable.** Vite inlines them into the
> client bundle. The Brevo key belongs in the Edge Function environment.

**Done when:** every email sends to a `.invalid` throwaway address and is
verified in Brevo's log; the digest sends nothing when there is nothing to
send; the DNS request is with the charity; and each send appears in
`audit_logs`.

> **Trap 6, and it is not hypothetical.** Never use a real user's id as a test
> target, *including* for a test you expect to be rejected. On 2026-09-03 a
> "expect 403" test passed instead of failing and sent a real junk email to a
> real person at the charity. Throwaway accounts on `.invalid`, always.

---

# Workflow 3 — Accounts

**Branch:** `wf3-accounts`
**Items:** `ACC-5`, `ACC-6`, `ACC-8`, `CON-6`, `ACC-4`, `ADM-8`

## 3.1 Access denied (`ACC-5`)

Today a signed-in person hitting the wrong role's page is sent to the sign-in
page, which reads as though they have been logged out. Replace with a plain page
saying the area is for organisations or volunteers, with a way back. Small, and
the most visible.

## 3.2 The volunteer settings page and `discoverable` (`CON-6`, `ACC-4`)

`discoverable` (`public_profile`) stays **on by default** — but this only holds
because turning it off becomes easy. Build both halves or neither:

- A clear switch on the volunteer's settings page: *"let approved organisations
  find and email me"*.
- A line in the footer of every unprompted outreach email saying where to find
  it. A pointer, not an unsubscribe link.

This is what makes the GDPR position in `CON-4` stand up. A control nobody can
find is not a control.

## 3.3 Account deletion (`ACC-6`)

**Required by UK GDPR before launch.** Not optional, not a nice-to-have.

- A service-role Edge Function — the browser cannot delete an auth user.
- Calls the `ADM-4` redaction function: log entries keep their dates and lose
  their personal data.
- Cascades profile, availability, registrations.
- Confirmation that makes the consequence plain. Use `ConfirmDialog.jsx`, not
  `window.confirm`.

## 3.4 Changing your login email (`ACC-8`, `ADM-8`)

**Decided: self-service, with confirmation to both addresses.** The change takes
effect only when a link sent to the **new** address is clicked, and the **old**
address is told it happened, so a stolen session cannot quietly move an account.

The admin route (`ADM-8`) stays as a fallback for someone locked out of both
addresses, logged with the old address, the new one and which admin did it.

The reasoning, since it is counter-intuitive: an admin asked by email to change
an address has no way to verify the request. That is not a check, it is a person
who can be talked into it once. Double confirmation is the stronger control.

> `user_profiles.email` is a separate column from `auth.users.email` and they can
> drift. `send-outreach` addresses mail from `auth.users` — it used to read the
> profile column, which every user could rewrite, making the function a way to
> mail anyone under the charity's name. **Keep `auth.users` as the source of
> truth** and update the profile column in step, or drop it entirely.

**Done when:** a throwaway user deletes their account and their log entries
survive with the personal data gone; an email change cannot complete from the
old address alone; the discoverable switch turns outreach off and a probe
confirms `send-outreach` then returns 403.

---

# Workflow 4 — Organisation approval

**Branch:** `wf4-approval`
**Items:** `APP-1`, `APP-2`, `APP-3`, `APP-6`

Approval itself works (built 2026-09-11). This workflow is about who is told.

## 4.1 The changed decision (`APP-1`)

**A waiting organisation is told on screen, not by email.** Version 2 said
otherwise; the user reversed it on 13 September. Sign-up form says approval is
needed, dashboard says it is waiting, no mail. The email it gets is *"your
account is now active"*, on approval (`EML-1`, built in workflow 2).

## 4.2 The recipient list (`APP-3`)

New table. `hello@wellwindsor.org.uk` is permanently on it and **cannot be
removed or paused** — enforce in the database, not in the UI, so it holds even
if someone works around the page. That row is what stops notifications quietly
stopping when people change.

Admins add other addresses and may pause or delete the ones they added. Every
change to the list goes in the audit log.

## 4.3 Admin accounts (`APP-6`)

Admins are added by hand in the database today. Build an admin accounts area
with a plain warning on it — an admin sees and changes every account.

**An admin cannot remove their own admin rights,** so the last one cannot lock
everybody out. There is currently exactly **one** admin row; this is not
theoretical.

**Done when:** a new organisation receives no mail and sees the on-screen state;
approving one sends exactly one email and one notification; the `hello@` row
cannot be deleted by any route including direct SQL as `authenticated`; an admin
cannot demote themselves.

---

# Workflow 5 — A role's life

**Branch:** `wf5-roles`
**Items:** `ROLE-5`, `ROLE-3`, `ROLE-2`, `ROLE-1`, `ROLE-4`, `APP-5`

## 5.1 One copy of the schedule (`ROLE-5`) — do this first

Today the schedule is written to two places that disagree: `when_needed` (jsonb,
read by the form) and `opportunity_timeblocks` (read by matching and auto-close).

**The live numbers are worse than CLAUDE.md says:** `when_needed` is NULL on
**all 14** roles, and only **8** have timeblocks. Six roles have no schedule
anywhere. Check what those six should be before migrating, or the migration
will quietly invent or destroy data.

Delete `when_needed`, keep the timeblocks, point the form and the browse cards
at the rows everything else already reads. This unblocks showing times on browse
cards at all.

`date_needed` is dead — NULL on every row, written by nothing. Drop it here too.

## 5.2 Drop the contact email (`ROLE-3`)

`volunteer_opportunities.contact` is NOT NULL and nobody has ever seen it.
Drop the column, the form field and the posting requirement. One fewer required
field on the longest form in the site.

## 5.3 Deleting and closing (`ROLE-1`, `ROLE-2`)

- **Deleting hides, never erases.** The role and every registration on it stay.
  The volunteer's page shows *"this role was removed by the organisation"*.
  In-app notification, no email. The public stops seeing it at once.
  This needs a `deleted_at` (or status value) and every read path filtered —
  **including the public browse policy**, which historically had no status
  filter and only hadn't leaked because no draft existed.
- **Closing or changing tells the registrants** — same in-app notice, no email.

## 5.4 Reopening (`ROLE-4`)

A closed role **never** reopens by itself. When an organisation saves a closed
role whose dates are now in the future, the form offers *"this role is closed —
reopen it?"* right there. Not a separate button elsewhere.

Automatic reopening would put a role live again weeks after someone deliberately
closed it, discovered only when a volunteer applied.

## 5.5 Content checks (`APP-5`)

Roles publish without human review. On post and edit: a profanity and
banned-word check on title and description, plus **length limits on every
field** — nothing stops a 2MB description today, and that breaks browse for
everyone.

> **Do not add an SQL-injection or HTML-script filter.** Both are already
> handled: Supabase's client sends values separately from the query, and React
> escapes what it renders. A filter that greps for `<script>` catches the
> obvious attempt, misses the real one, and teaches people the site is protected
> by the wrong thing. The user asked for one; the reasoning against it is in the
> `APP-5` thread and they accepted it.

> **Zod `.optional()` does not accept `null`,** and `reset()` feeds it the raw
> row. Any nullable column reaching a form schema needs `.nullable()`, and every
> `handleSubmit` needs an `onInvalid` handler — saving an opportunity was
> silently impossible for months because a rejected submit showed nothing at all.

**Done when:** one schedule source; a deleted role is invisible to the public and
to search while its registrations survive; a closed role's reopen prompt appears
in the edit form; a 2MB description is rejected.

---

# Workflow 6 — Registering interest and outreach

**Branch:** `wf6-interest`
**Items:** `INT-2`, `INT-3`, `INT-4`, `CON-5`, `CON-4`, `CON-2`

## 6.1 One optional note (`INT-2`)

Drop `subject` from the register-interest form and from `applications`.
Registering becomes a button plus *"anything you'd like to add?"*. The
confirmation still says the organisation will see your name, profile and note.

## 6.2 Withdrawing (`INT-4`)

**Hidden from the organisation, which is never told.** It disappears from their
list as though it had not been made.

The row is **kept** and marked withdrawn — invisible to everyone but an admin.
Reason: the log must still be able to explain a message already sent. Delete the
row and a legitimate email starts looking like an unprompted approach to someone
who never applied.

Needs a `withdrawn_at` column and the `opportunity_applicants` view filtered.

## 6.3 Deleted roles keep their registrations (`INT-3`)

Confirmed by the user on 13 September, consistent with `ROLE-1`. Registrations
survive the deletion of their role. Nothing extra to build if workflow 5 did it
right — verify it here rather than assume.

## 6.4 Outreach can name a role (`CON-5`)

An organisation writing to a volunteer may attach **one of its own live roles**.
The email shows the title with a link. It may still write with no role.

`org_outreach.opportunity_id` already exists and is nullable — no migration
needed for storage. The work is the picker, the email template, and the
restriction.

**The restriction matters:** only that organisation's own live roles. Otherwise
the picker becomes a way to link a volunteer to anything on the site, including
another organisation's draft, and a link in an email is trusted more than a link
on a page.

## 6.5 No unsubscribe on outreach (`CON-4`)

Marketing mail from Well Windsor carries an unsubscribe link. An organisation's
message about volunteering does not — it is not marketing, it is what the
volunteer asked for by registering. The discoverable switch (`CON-6`, workflow 3)
is what covers the volunteer who never registered.

> **Trap 4b.** `send-outreach` unlocks emailing a volunteer if they applied to
> one of your roles. The old INSERT policy let an organisation write that
> evidence itself. The table is now volunteer-insert-only. **When you change
> `applications`, re-check who can write to it** — every outreach permission
> rests on that table being honest.

**Done when:** withdrawing removes the volunteer from the organisation's view
while the row survives; an organisation cannot attach another organisation's
role; a probe confirms outreach to a non-discoverable, non-registered volunteer
still returns 403.

---

# Workflow 7 — Admin

**Branch:** `wf7-admin`
**Items:** `ADM-6`, `ADM-1`, `ADM-2`, `ADM-5`

## 7.1 Towns (`ADM-6`)

The `towns` table already exists with 4 rows (Windsor active; Old Windsor,
Slough, Maidenhead inactive). Two pieces remain:

**The blocker, and it is easy to miss:** `volunteer_opportunities.town` has a
hardcoded CHECK constraint listing `Windsor`, `Maidenhead`, `Slough`. An admin
adding a town through a new UI would have it rejected by the database with no
obvious explanation. **Replace the CHECK with a foreign key to `towns`** before
building any UI. `src/utils/towns.js` then reads from the database rather than
holding the list.

**The disappearing picker.** While exactly one town is active, every town
picker is hidden — sign-up, the role form, the browse filter — and roles are
filed under that town automatically. Add a second town and the pickers return on
their own, everywhere, with no further work. Build it as one rule read from the
active-town count, not as three separate conditionals that will drift.

A town cannot be deactivated while roles or people are attached to it, or the
browse quietly loses them.

## 7.2 Account and role management (`ADM-1`)

Taking a role down, and adding admins (built in workflow 4). **Not suspend or
ban** — out of scope, see above.

## 7.3 Switching account type (`ADM-2`, `ADM-5`)

Admins can switch an account between volunteer and organisation.

- Volunteer → organisation: starts **waiting for approval**; old registrations
  kept but closed.
- Organisation → volunteer: needs a date of birth (18+); its roles are closed
  first.
- Messages sent and received stay in the logs either way.

This reverses a rule the database enforces today — a trigger and column
permissions prevent role changes. The switch must be possible **only** through
an admin `SECURITY DEFINER` function, never by a client UPDATE.

> **Trap 3.** Any policy on `user_profiles` that queries another RLS-protected
> table causes `42P17 infinite recursion`. Wrap lookups in `SECURITY DEFINER`
> functions.
>
> **Trap 1d.** `information_schema.column_privileges` lists every column when a
> grant is table-wide, which looks identical to a column-level grant list. This
> was misread twice. **Read `pg_class.relacl`.**

**Done when:** an admin adds a town and can post a role in it; with one town
active no picker appears anywhere; a switch leaves the audit trail intact; a
client UPDATE to `role` is still refused with `42501`.

---

# Workflow 8 — Launch preparation

**Branch:** `wf8-launch`
**This is the gate. Nothing here is code the user sees, and all of it blocks
going public.**

1. **Delete the seed data.** 13 `5eed…` roles credited to real organisations,
   plus the junk accounts. This leaves an **empty browse**, so it needs real
   organisations ready to post — that is a conversation with the charity, not a
   task to schedule.
2. **Privacy policy and the data-deletion route.** The deletion mechanism is
   built in workflow 3; this is the published policy that describes it.
3. **Supabase dashboard toggles:** leaked-password protection
   (HaveIBeenPwned) and the pending Postgres security patch. Both are advisor
   flags today.
4. **Hosting** — Cloudflare Pages.
5. **Email confirmation ON** (`ACC-1`), once DNS and Brevo are done.
6. **Final full security pass.** Re-run `probe_security2.py`, `walk_audit.py`,
   `walk_core_loop.py`, `walk_design.py`. Every table added by this plan gets
   the same checklist: RLS on, no anon write grants except `problem_reports`
   INSERT, every `SECURITY DEFINER` function's EXECUTE grant reviewed, and a
   **live write test** — not just a read probe.

Known and deliberately deferred: signed-in users can read organisations' `email`
and `contact_number` from `user_profiles`, and the match RPC still returns
`contact` to volunteers. Decide whether to close these before launch or record
them as accepted.

---

## Decision index

Where each logic-map item is built.

| Workflow | Items |
|---|---|
| 1 Foundations | `PIE-1` `ADM-3` `ADM-4` `NTF-1` `ADM-7` |
| 2 Email | `ACC-9` `ACC-7` `EML-1` `EML-2` `EML-3` `CON-1` `INT-1` `APP-2` |
| 3 Accounts | `ACC-4` `ACC-5` `ACC-6` `ACC-8` `CON-6` `ADM-8` |
| 4 Approval | `APP-1` `APP-3` `APP-6` |
| 5 Roles | `ROLE-1` `ROLE-2` `ROLE-3` `ROLE-4` `ROLE-5` `APP-5` |
| 6 Interest | `INT-2` `INT-3` `INT-4` `CON-2` `CON-4` `CON-5` |
| 7 Admin | `ADM-1` `ADM-2` `ADM-5` `ADM-6` |
| 8 Launch | seed data, privacy, hosting, advisors, final probe |
| Already built | `ACC-1` `ACC-2` `ACC-3` `CON-3` `BRW-1` |
| Deferred by decision | `BRW-2` `BRW-3` (later version) |
| Still open | `APP-4` — charity's vetting process, blocks nothing |

`BRW-4` (search descriptions, skills and organisation names) has no natural home
above. Put it in workflow 5, after `ROLE-5` — it is the same read paths.

---

## Standing rules that hold across every workflow

- **Role values are US-spelled in data, UK-spelled in copy.** `'organization'`
  in the database, "organisation" on screen. `role === 'organisation'` silently
  fails and once broke Get Started for every org.
- **Never read `user_profiles` to see another volunteer.** Use the views:
  `public_volunteers`, `opportunity_applicants`, `org_outreach_sent`,
  `public_organisations`.
- **An organisation never gets a volunteer's email address.** The client passes
  a `volunteer_id`. Do not add a parameter that carries an address.
- **A disabled React Query is not "loading".** Use `isPending`, or default the
  data. `isLoading: false` on a disabled query crashed the volunteer dashboard.
- **There is no accept or decline anywhere.** Registering is read-only interest;
  the organisation writes or stays silent; silence means no. The UI must keep
  saying so: *"you may not hear back from every application."*
- **Verify claims before reporting them.** "The build passed" is not evidence
  that a feature works. Say plainly when something is broken, unverified, or
  worse than expected.
