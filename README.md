# Well Windsor — Volunteer Matchmaking

A volunteer marketplace for the Royal Borough of Windsor and Maidenhead,
built for [Well Windsor](https://www.wellwindsor.org.uk) (registered charity
1207021).

Volunteers browse local roles and register interest; organisations post what
they need and write to the people they want through the site. There is no
accept or decline: a volunteer's email address is never shown to an
organisation, a reply to the organisation's message goes straight to it, and
the conversation carries on by email. Silence means no.

**The platform does not vet or DBS-check volunteers.** Organisations are
responsible for their own safeguarding checks.

## Running locally

Requires Node 18+.

```bash
npm install
cp .env.local.example .env.local   # then fill in your Supabase keys
npm run dev                        # http://localhost:5173
```

Supabase credentials are in the project dashboard under Settings → API. The
anon key is safe to expose — it is public by design, and row-level security
is what protects the data behind it.

```bash
npm run build   # production build
npm run lint    # eslint
```

## Layout

```
src/
  components/     shared UI (AvailabilityMatrix, ConfirmDialog, NavBar, ...)
  context/        session, theme, notifications
  hooks/          useUserProfile, ...
  pages/
    VolunteerPages/       browse, apply, profile, dashboard
    OrganizationPages/    post opportunities, review applicants, find volunteers
    AdminPages/           moderation
  utils/          supabase client, schedule/availability helpers
supabase/
  migrations/     database schema, applied in filename order
```

## Database

Postgres on Supabase (`eu-west-2`). Schema changes are migrations in
`supabase/migrations/`, never ad-hoc edits in the dashboard — the filenames
correspond to entries in Supabase's migration ledger.

Row-level security is the only thing between the public anon key and user
data, so any new table needs RLS enabled and policies written before it holds
anything real.

## Contributing

`CLAUDE.md` documents the conventions, the non-obvious traps, and how to
verify database access properly. Worth reading before the first change —
several of the entries in it are there because something shipped broken.
