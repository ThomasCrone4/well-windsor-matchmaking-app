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
redaction. **Provisionally: nothing built.** Options: an admin-only
deletion function that runs the same preparation; or a written procedure.
Matters as soon as anyone emails asking to be deleted.

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
