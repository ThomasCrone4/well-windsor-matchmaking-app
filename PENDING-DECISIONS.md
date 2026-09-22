# Pending decisions

Decisions that are **yours to make**, collected so nothing gets decided by
default without you knowing. Claude adds to this file whenever it makes a
provisional choice or finds something that needs your call. Nothing here
blocks the build unless it says so.

When you decide one, write the answer under it (or tell Claude) and move it
to **Decided** at the bottom with the date.

Each entry says what was done **provisionally**, so you know what the live
site does today if you never answer.

---

## From Workflow 7 (admin) — 2026-09-16

### WF7-1 · Should a person's home town be restricted to the towns list?
`user_profiles.home_town` is now a foreign key to `towns`, like a role's town.
**Provisionally: yes, built.** Everyone was already in Windsor, so no data
changed, and nobody is locked out of saving their profile (proven by the
probe). The alternative is to leave home town as free text, which means a
person can say they live somewhere the service doesn't cover.

### WF7-2 · Volunteer → organisation: clear their personal details?
When an admin switches a volunteer to an organisation, their date of birth,
phone, bio, skills and availability are **cleared**. **Provisionally:
built.** Reason: organisation profiles are readable by every signed-in user,
so keeping them would expose a person's date of birth and phone number the
moment an admin clicks. The alternative is to keep them, and accept that
exposure (or close WF8-2 first).

### WF7-3 · Volunteer dashboard wording for a removed role
Changed from "This role was removed by the organisation" to "This role has
been removed", because an admin can now remove one too. The in-app
notification still says who did it. **Provisionally: built.**

### WF7-4 · Should an organisation be told when an admin takes its role down?
Today it is **not** told — the role just disappears from its dashboard. The
admin dialog says "contact them directly". **Provisionally: not notified.**
Options: leave it; add an in-app notice; or send an email (needs a new email
template and a seventh notification type).

### WF7-5 · Should people who withdrew still get "role closed/changed" notices?
`notify_role_state_change` tells everyone who ever registered, including
people who withdrew. **Provisionally: unchanged** (found, not fixed). Likely
answer: stop telling withdrawn registrants. Small change.

### WF7-6 · An organisation switched to a volunteer can still see who registered for its old roles
The `opportunity_applicants` view checks the role belongs to you, not that
you are still an organisation. They are information the account already had.
**Provisionally: unchanged.** Options: accept, or restrict the view to
organisation accounts.

### WF7-7 · How should test accounts be cleaned up?
The standard cleanup deletes ids starting `7e57`, but the probes and walks
also sign up accounts with random ids on `@wellwindsor-test.invalid`.
**Provisionally: nothing deleted** (27 test accounts on production as of
2026-09-16). Options: delete by `.invalid` email domain at the end of each
session; or keep them.

### WF7-8 · The WF7 probe and walk briefly make a second town live
For a few seconds each run, real visitors could see town pickers.
**Provisionally: accepted**, with try/finally restoring it. Alternative:
test the two-town behaviour only on a local or branch database.

---

## From Workflow 8 (launch preparation) — 2026-09-16

### WF8-1 · When to delete the seed data — and what to do with "OrgTestSep"
**Blocks launch.** 13 fake roles (ids `5eed…`) are live, credited to six real
organisation accounts. A dry run found **no registrations, messages or
notifications** on any of them, so deleting them loses no human data — but it
leaves the public browse with **one** role, or none. The script is written,
guarded and **not run**: `supabase/launch/delete_seed_data.sql`.
The 14th live role, "OrgTestSep" (a test on the admin's organisation account,
2026-09-03), has **one real registration**; the script removes it the ROLE-1
way (kept, registrant told) but that part is commented out.
**Needs:** real organisations ready to post, then your go-ahead to run it.
Note: `probe_wf6` and `walk_wf7` expect the logged-out browse to have roles;
after deletion they will need a throwaway fixture role instead.

### WF8-2 · Signed-in users can read organisations' login email and phone
Known since the 2026-09-11 audit. **Provisionally: left as is, and the
privacy policy says so.** Closing it is not a one-line grant change: every
page reads its own profile with `select('*')`, so revoking those columns
would break self-read too — it needs a "my profile" view or function.
Options: close before launch, or accept and keep it in the policy.

### WF8-3 · Which accounts are test or junk?
Not in the deletion script, because it is a judgement about real people.
There are **12 accounts** on production that are not `.invalid` throwaways
(6 organisations, 6 volunteers). **The list is deliberately not in this
file** — the repository is public and it names real people. It is in
`.scratch/wf8-3-real-accounts.md` (gitignored) on the development machine, and
can be regenerated from the database at any time.

Every seed role is credited to one of the six organisations. **Needs:** your
list of which to delete. Careful with the "Windsor School" organisation: it is
the only admin, and deleting it removes the only admin.

### WF8-4 · How long to keep the content of sent emails
Found during WF8: the email outbox kept every address, name and message for
ever, even after an account was deleted — against ADM-4. **Provisionally:
built** — content is blanked immediately for a deleted account, and for
everyone **30 days** after sending (nightly job). The dated record of what was
sent is kept. The privacy policy states 30 days. Change the number if you
prefer; the policy must change with it.

### WF8-5 · Privacy policy sign-off
**Blocks launch.** `/privacy` is built, and every factual statement in it was
checked against the live system on 2026-09-16. It cannot settle:
- the **lawful basis** wording (currently plain-English "to run the service you
  signed up for" and "to keep the site safe", with no legal labels);
- the charity's **postal address** and whether to quote an **ICO registration**
  number;
- how long **problem reports** are kept (it says "until no longer needed");
- the promise on `/delete-my-data` that someone who cannot sign in can email
  and "we will delete the account for you" — see WF8-6.
**Needs:** the charity (or whoever handles its data protection) to read and
approve it. Then set the `EMAIL_PRIVACY_URL` secret to `<site>/privacy`.

### WF8-6 · There is no proper way for an admin to delete someone else's account
`delete-account` deletes only the caller (deliberate, WF3). An admin
deleting a user from the Supabase dashboard **skips `prepare_account_deletion`**:
no preserved outreach record, no audit-log redaction, no email-outbox
redaction. **CLOSED 2026-09-20 by WF9.7:** `admin_delete_account()` on the
new admin account page runs the same preparation as self-deletion, in one
transaction, and refuses an admin or yourself. It needs a reason and the
typed word DELETE, and is logged with who did it. Proven end to end by
`.scratch/probe_wf9_7.py`.

### WF8-7 · Fonts served from the site instead of Google
Google Fonts sends every visitor's IP address to Google, which the policy
would have had to declare. **Provisionally: built** — Poppins now comes from
`@fontsource/poppins`, bundled with the site. Visually identical; walked.

---

## From Workflow 9 (browse, admin, accounts) — 2026-09-18

### WF9-9 · What an organisation is told when its own role is not public
Batch 9.1. An organisation and an administrator can open a role's page that no
volunteer can see: a draft, a closed role, a removed one, or any role at all
while the organisation is still waiting for approval. Until now that page
looked exactly like a live one, register button and all.
**Provisionally: built** — a notice at the top saying "Not visible to
volunteers", with the reason, and no register button. The wording differs by
case; the one worth your eye is the approval case, which now tells a pending
organisation that its roles are not listed **because it has not been
approved yet**. That is true, and it is the first place the site says it
out loud. Options: leave it; soften it; or say nothing and let the
organisation find out from the dashboard.

### WF9-11 · The availability drop destroys real people's data, and is waiting on your yes
Batch 9.2. The client no longer reads or writes availability anywhere, but the
columns and the table are still there: the drop migration is written and
**not applied**, at `supabase/pending/wf9_2_drop_availability.sql`.
**Two reasons it is held.** First, sequencing: it removes columns the deployed
site still uses, so it has to follow the merge, not precede it. Second, it
destroys data belonging to real people — as of 2026-09-18, **5
`volunteer_availability` rows across 3 real volunteers**, plus the
`availability_matrix` values on the real profiles. The `archive/availability-matching`
branch preserves the **code**, not the data; nothing preserves the data.
**Provisionally: written, not run.** You signed off the removal (WF9-1); this
is only flagging that the last step is irreversible and needs a separate word.
Options: apply it after the merge; or export the rows to a file first, which
means keeping a copy of personal data outside the database and is arguably
worse than losing it.

### WF9-17 · Admin deletion is written in SQL, not as an Edge Function
Batch 9.7, closing WF8-6. `admin_delete_account()` runs the preparation and
the delete in **one transaction**, where the existing self-service route
(`delete-account`) prepares over RPC and then calls the auth API — two steps
that can half-succeed, which is why that function has a branch for "the log
says deleted and it was not". **Provisionally: built in SQL.** The trade-off
is that it deletes `auth.users` directly rather than through
`auth.admin.deleteUser`; the cascades are the same, and it is already how
throwaway accounts are cleaned up here. Option: rewrite it as an Edge
Function for symmetry with the self-service route, and accept the two-step.

### WF9-18 · An admin can read another account's date of birth and phone
Batch 9.7. The account page shows what the admin lists already showed, plus
the login address and whether it is confirmed — and for a volunteer, their
date of birth and phone number, which an organisation never sees.
**Provisionally: shown.** An admin already has this by policy on
`user_profiles`; putting it on one page makes it visible rather than merely
reachable. Options: leave it; or hide dob and phone behind a "show" control
the way the message log hides message text. Relevant to the privacy policy
sign-off (WF8-5), which already says admins can see messages.

### WF9-14 · Declining an organisation is silent, and reversible
Batch 9.6. An admin can now clear an organisation off the approval queue with
a reason. **Provisionally built as: it is not told.** Nothing about what it
can do changes -- it still cannot publish, it can still save drafts -- so from
its side the application simply stays pending for ever. The reason goes to the
audit log, not to them. Approving later undoes it.
Options: leave it silent (matches ADM-1, where an organisation is not told its
role was taken down); or tell them, which needs a seventh notification type
and an email template, and means writing a rejection the charity has to stand
behind.

### WF9-15 · Admins can read the text of messages sent through the site
Batch 9.6, and the privacy policy changed in the same commit to say so. The
email log shows who wrote to whom, the address it went to, and the message
itself behind a "Show message" control. **Provisionally built.** It exists so
a complaint about a message can be investigated, which is hard to do
otherwise. The alternative is to log only metadata and never the text, which
would make "this organisation sent me something awful" uninvestigable.
Worth a look from whoever signs off the privacy policy (WF8-5).

### WF9-16 · Approving a throwaway organisation really sends an email
Noticed in 9.6, not changed. `is_test_address()` stops a `.invalid` signup
raising the admin alert, but the **approval** email is not guarded the same
way, so approving a throwaway organisation queues and sends one. Harmless
today because every throwaway is on `.invalid` and nothing can be delivered
there. **Provisionally: unchanged.** Options: extend `is_test_address()` to
the approval path too, for consistency; or leave it, since the address is
undeliverable by construction.

### WF9-13 · Where a finished role sorts, and what "any time" means in a list
Batch 9.3. Ordering is soonest-next-date first, which needed two calls you did
not specify. **Provisionally built:** (a) a role whose dates have all passed
sorts **last**, below the flexible ones, rather than being treated as undated —
it is only ever on screen for the few hours between its last date and the
00:05 auto-close, and it should not push a live role down the page; (b) a role
with **no schedule at all** (not flexible, just no times given) sorts with the
flexible ones, since there is no date to place it by. Alternatives: hide
finished roles outright, or sort undated roles first as "always available".

### WF9-12 · A volunteer had already written their availability into their bio
Noticed while walking 9.2, not changed. One real volunteer's bio ends "I have
flexible availability on weekends and some weekday evenings." That is the
argument for WF9-1 arriving on its own: people put their availability where it
is current, in prose, next to everything else they want an organisation to
know. **Provisionally: nothing done.** It is worth remembering when the
replacement idea (WF9-2, a date in the outreach email) gets its design pass.

### WF9-10 · The front page's role count can now go down
Same batch. The count and the three cards read the same list as the browse, so
they no longer include removed roles or roles from unapproved organisations.
Nobody was ever meant to see those numbers, but **an admin looking at the
front page will see a smaller number than they did yesterday** — that is the
fix, not a regression. Flagged only so it is not mistaken for one.

---

## Carried over from earlier workflows

### LOGIC-MAP · Republish the logic map marking items built
Not marked for workflows 1–7 because of the don't-republish-mid-review
agreement. Items built:
WF1 PIE-1 ADM-3 ADM-4 NTF-1 ADM-7 · WF2 ACC-9 EML-1 EML-2 EML-3 CON-1 INT-1
APP-2 · WF3 ACC-4 ACC-5 ACC-6 CON-6 ADM-8 (ACC-8 built, unproven) · WF4 APP-1
APP-3 APP-6 · WF5 ROLE-1 ROLE-2 ROLE-3 ROLE-4 ROLE-5 APP-5 BRW-4 · WF6 INT-2
INT-3 INT-4 CON-2 CON-4 CON-5 · WF7 ADM-1 ADM-2 ADM-5 ADM-6.
**Needs:** your go-ahead to republish.

Workflow 9 has no item codes of its own on the map — it is a pass over what is
already there. What it changes on the map, batch by batch, so the republish
does not have to reconstruct it:
- **9.1** — nothing to add. BRW-1's "active roles" now means one thing rather
  than three; worth a note in its wording if you are editing it anyway.
- **9.2** — reverses "availability-overlap matching is being kept and
  finished". Mark it removed, with the reason (a static grid goes stale the
  week after sign-up) and the replacement idea (WF9-2, a date in the outreach
  email).
- **9.3** — BRW-2 ("filter by when you are free") is gone: the When filter
  was removed and replaced by an organisation filter, with soonest-next-date
  ordering instead of filtering. BRW-4's search is unchanged.
- **9.4** — nothing to add; pagination is not a map item.
- **9.5** — ROLE-4's rule is unchanged, but its wording should say the offer
  is three named buttons rather than one "Reopen".
- **9.6** — **ADM-3 is now built** (the email log finally has a screen); add
  it to the built list. APP-1's approval queue gains a second exit,
  declining, which is new behaviour the map does not describe.
- **9.7** — **ADM-8 is now genuinely reachable** (it was built in WF3 but had
  no screen until now), and WF8-6 is closed by an admin delete. ADM-2/ADM-5
  moved off the list screens onto the account page; same function, new home.

So the built list gains **ADM-3** (WF9.6) and **ADM-8 becomes usable rather
than merely present** (WF9.7).

### APP-4 · What does a human check before approving an organisation?
Still open on the logic map. Blocks nothing — approval works without it.

---

## Actions only you (or the charity) can take

Not decisions, but nothing in code can do them. Listed so they are not lost.

- **`BREVO_SENDER_EMAIL`** Edge Function secret — set it in **Supabase**
  (Dashboard → Edge Functions → Secrets), not Cloudflare or `.env.local`,
  neither of which reaches an Edge Function. **Do this before `send-email` or
  `send-outreach` is next deployed:** as of 2026-09-16 the code in the repo no
  longer falls back to a hardcoded personal Gmail, and refuses to send without
  the secret. (The deployed versions still have the fallback, so email works
  today either way. Queued emails are kept, not lost, if it is missing.)
- **`APP_URL`** Edge Function secret → the Cloudflare Pages origin. Without it,
  outreach emails name an attached role but do not link to it.
- **DNS records** for wellwindsor.org.uk (charity). Blocks the switch to
  `volunteer@`, ACC-7, and turning email confirmation on (ACC-1).
- **Supabase dashboard:** leaked-password protection (HaveIBeenPwned) on;
  apply the pending Postgres security patch.
- **Confirm "Secure email change" is on** in Supabase Auth — ACC-8's security
  depends on it and it cannot be read from here.
- **ACC-8 needs one real deliverable address** to be tested end to end.
- **Delete the `charity_notification_email` Vault secret at launch**, so
  charity alerts go to the real recipient list instead of the development
  inbox.

---

---

## Decided

### 2026-09-18 · Workflow 9, from the live walk-through

Planned in `BUILD-PLAN.md` under "Workflow 9". None of it is built yet.

**WF9-1 · Availability matching is removed, and volunteer availability with
it.** A static weekly grid promises more than it can deliver: real
availability changes week to week and day to day, so a grid filled in at
sign-up is stale almost immediately. Making it genuinely useful needs a design
pass nobody has budget for in v0. So the match badge, "Show matches only", the
grid on sign-up and the profile, the availability shown to organisations, the
`volunteer_availability` table, the two `user_profiles` columns and
`match_opportunities_by_availability` all go, archived on a branch. Role
schedules (`opportunity_timeblocks`) stay — they are what the new ordering
reads. **Reverses an earlier logic-map decision;** mark it there.

**WF9-2 · The idea that may replace it, later.** When an organisation writes
to a volunteer, let it name when the role is and attach a calendar invite, so
the date arrives in the message. The date is known then, by the person who
knows it, instead of asking every volunteer to maintain a grid for ever. Out
of scope for v0; recorded in BUILD-PLAN under "Later, not now".

**WF9-3 · The browse loses the "When" filter and gains an organisation
filter**, listing only organisations that have a live role. Ordering (not
filtering) is soonest next date first, "any time" roles after the dated ones,
and the home page's "Upcoming" uses the same rule.

**WF9-4 · Pagination.** 10 per page on the browse and on Find Volunteers;
**50** on the admin lists, which carry no images and so can afford a longer
page.

**WF9-5 · A closed role gets three buttons:** Save and reopen, Save and keep
closed, Discard changes. Save-and-reopen returns to the organisation
dashboard.

**WF9-6 · An admin can decline an organisation**, quietly: it leaves the
waiting queue with a reason in the audit log, and the organisation is not
told. Otherwise the queue never empties and its count means nothing.

**WF9-7 · The email log shows message text behind a "Show message" control,**
so an admin investigating a complaint can read one without the page
displaying private correspondence to anyone who glances at it. The privacy
policy gains a line saying admins can see messages sent through the site.

**WF9-8 · The admin account page can delete an account**, running the same
preparation as self-deletion (preserved outreach record, audit-log redaction,
email-outbox redaction), logged with the admin who did it. This closes WF8-6;
deleting from the Supabase dashboard skips all of that.

**WF7-7 / WF8-3 · All test accounts were deleted from production**
(2026-09-18): every `.invalid` account and everything cascading from them.
Re-run `.scratch/seed_throwaways.sql` before the probes. Audit-log entries
naming them survive by design — the table refuses UPDATE and DELETE even to
its owner.

**POLISH-1 · The role detail page is one column, with no photograph**
(2026-09-20). The picture was never the organisation's -- there is no upload
and no image column, so `opportunityImages.js` gave every role one of six
stock photos, and with almost no row carrying a category most got one of
three neutral fallbacks hashed off the id. It could not be sharp either: the
widest rendition is 800px against a full-window band, so the browser upscaled
it and then cropped a 3:2 photo into a 288px letterbox. **The browse cards
keep theirs**, where 800w is ample for a ~500px card. Mockups of the three
options considered: https://claude.ai/artifact/EKUaJq6j94gBdnduYdyTif

**POLISH-2 · DBS is stated once on the role page.** It was in the facts panel
and again in a notice directly below it -- the same sentence twice, stacked.
Both halves now live in one "What you need" section.

**POLISH-3 · "Next session" is shown on a dated role.** It needed a new rule:
`getNextDateFromToday()` answers "when could this be turned up to at all" and
returns TODAY for a role running now, which would print "next session:
Tuesday" on a Saturday-only role. `getNextSessionDate()` only ever returns a
date whose weekday the organisation named. Covered by
`.scratch/test_next_session.mjs` (14 cases) -- a UI walk cannot test it,
because the live roles' dates are whatever they are on the day.

**POLISH-4 · Skills become a managed list, not free text** (decided
2026-09-20, NOT YET BUILT). The shape, all four settled with the user:

- **Join tables**, not an array and not the text column: `skills`
  (id, name, is_active, sort_order), `opportunity_skills`, `volunteer_skills`.
  Real foreign keys, and v2 matchmaking becomes one join rather than string
  matching.
- **The admin manages the list** from the dashboard, mirroring the Towns tab
  (ADM-6): add, rename, activate/deactivate, guarded so a skill in use cannot
  vanish and every change is audited.
- **One list, used in both places** -- posting a role and editing a volunteer
  profile pick from the same rows.
- **The picker is a dropdown with chips**: open it, tick skills, each ticked
  skill becomes a removable chip below the control.
- **Migration: map what matches, drop the rest.** The 13 roles carrying skills
  are all `5eed...` seed rows that `delete_seed_data.sql` removes anyway. Four
  real volunteer accounts have free text; whatever does not map to a listed
  skill is dropped, with no note and no prompt.
- Starting list of 20, editable in the admin afterwards: Working with children
  | Working with parents and families | Reading and literacy | Maths and
  tutoring | Sports and games | Arts and crafts | Music | Cooking and food |
  Gardening and outdoors | Event support | Fundraising | Bid and grant writing
  | Admin and organisation | Social media | Web and design | Research and data
  | Writing and proofreading | First aid | Driving | Languages.

Three things this reaches that are easy to miss: the browse search (BRW-4)
searches the `skills` text and will need the join; `handle_new_user()` writes
the profile from signup metadata and would have to write junction rows, which
is the "three places" rule; and the detail page's chips come from splitting
the text on commas today -- that one line is what changes.

**POLISH-5 · The skills list is built** (2026-09-21). Three migrations applied,
all additive; the destructive half is `supabase/pending/polish4_drop_skills_text.sql`
and **must not be applied until the client is merged and live**.

- `skills` (20 rows, four groups), `opportunity_skills`, `volunteer_skills`.
- **Hiding is soft, and deliberately not the towns rule.** A town cannot be
  deactivated while anything references it, because a dead town breaks a
  foreign key. A skill can be hidden at any time and the holders keep it --
  proven live: hiding "First aid" while a volunteer held it left their row
  intact and dropped the pickers from 20 to 19.
- **No delete path at all.** `skill_id` is ON DELETE RESTRICT from both join
  tables and no grant permits a delete, so a skill somebody chose cannot
  vanish from under them.
- Writes go through `admin_add_skill` / `admin_set_skill_active`, not table
  grants -- the shape workflow 4 settled on for `admins`.
- **A picker offers the active list PLUS whatever the row already holds**
  (`pickerOptions` in src/utils/skills.js). Without that, editing a role that
  carries a since-hidden skill would silently drop it on the next save.
- Find Volunteers filters by skill **id, not name**: a rename would otherwise
  empty the list silently.

Two bugs this found that had nothing to do with skills:

- **A control outside react-hook-form does not make the form dirty,** and
  every save button on the edit-role and volunteer-profile pages is
  `disabled={!isDirty}`. Changing only your skills left Save greyed out. Found
  by the walk, not by reading the code.
- **`const` in the temporal dead zone.** `useUnsavedChangesWarning(formDirty)`
  sat above `const formDirty = ...` -- a ReferenceError on every render of the
  edit form, which eslint does not flag.

Re-runnable: `.scratch/probe_skills.py` (23 outside-in cases) and
`.scratch/walk_skills.py` (25 UI checks, fixtures swept by atexit).

> **A walk that creates something must record it BEFORE it asserts anything.**
> An early run of `walk_skills` added a skill, asserted, crashed on the
> assertion, and left that skill ACTIVE in every real picker on the live site
> -- `atexit` swept a list that was still empty. Removed by hand; the walk now
> records the id first.

> **One browser context is one session.** `walk_skills` opened a second page
> in the same context and signed in as an organisation, which replaced the
> admin's session on the first page -- the admin tab then rendered "that area
> is for Well Windsor admins" and a working button looked broken. Use
> `browser.new_context()` per account. Switching account in one context also
> fills the console with 406s: React Query refetches with the OLD user's id
> and the NEW user's token, and `user_profiles ... .single()` gets zero rows.

**POLISH-6 · The client stops touching the `skills` text columns** (2026-09-22).
Needed before `supabase/pending/polish4_drop_skills_text.sql` can be applied.

**Why there had to be a second client pass at all:** the first one deliberately
wrote BOTH the join rows and the derived text, because
`user_profiles_public_needs_detail` is a CHECK requiring a non-empty skills
STRING. That was right, but it means the deployed site keeps reading and
writing the column, so the drop needs its own deploy. Checked against the live
bundle rather than the repo: on 2026-09-22 `index-CU4WZhFs.js` still sent
`select("id, name, home_town, skills, bio, skill_ids, skill_names")` and still
wrote `skills:` on the profile. Dropping then would have 400'd Find Volunteers
and broken profile saving with `PGRST204`.

- Every remaining read switched to `skill_names`: Find Volunteers, the
  outreach compose page, the applicants list, the browse, the role page.
- The profile stops writing the text; sign-up sends `skill_ids` metadata
  instead, which the new `handle_new_user` will use to write the join rows.
- `contentChecks.js` loses `skills: 300`, and both role schemas lose their
  dead `skills` field -- `freeText('skills')` would have read a LIMITS key
  that no longer exists.

> **A DELETE then an INSERT over PostgREST is TWO transactions.**
> `replaceSkills()` rewrote skills the way the role forms rewrite timeblocks,
> so between the two requests a volunteer genuinely had no skills. Harmless
> while the rule was a CHECK on a text column -- and fatal the moment it
> becomes a trigger reading `volunteer_skills`, because a deferred trigger
> fires on the DELETE's commit and refuses it. `set_volunteer_skills()` /
> `set_opportunity_skills()` (20260922074836) do both statements in one
> transaction. **This was caught by tracing the consequence before applying,
> not by a test** -- the trigger would have broken profile saving for every
> public volunteer on the live site.
