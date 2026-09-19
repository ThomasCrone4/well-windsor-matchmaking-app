# Migrations written but deliberately not applied

A migration in `supabase/migrations/` has been applied: the filenames there
must match `supabase_migrations.schema_migrations` one for one, and a file
sitting there unapplied breaks that check for whoever runs it next.

This directory is for a migration that is finished and reviewed but must not
reach the database yet, usually because **the deployed site would break
between the moment it is applied and the moment the matching client is
merged.** There is one database and two deploys: a migration lands when it is
applied, the client lands when `main` is merged and Cloudflare rebuilds.

To apply one:

1. Merge and deploy the client change it depends on.
2. Confirm the deployed site no longer uses what the migration removes.
3. Apply it through the Supabase connector.
4. `git mv` it into `supabase/migrations/` and rename it to the version the
   connector recorded in the ledger.
5. Run the batch's probe.

`supabase/launch/delete_seed_data.sql` is kept outside `migrations/` for the
same reason, but a different one: it is data, not schema, and it needs the
charity's go-ahead rather than a deploy.

## Currently held

- **`wf9_2_drop_availability.sql`** — workflow 9 batch 9.2. Drops
  `volunteer_availability`, `user_profiles.available_anytime` and
  `availability_matrix`, `match_opportunities_by_availability` and
  `day_labels_to_indices`; rebuilds `public_volunteers` and
  `opportunity_applicants` without the two columns; stops
  `handle_new_user()` and `admin_switch_account_type()` writing them.
  **Waiting on:** 9.2's client commit being merged and deployed, and an
  explicit go-ahead — it destroys real volunteers' data (5
  `volunteer_availability` rows across 3 real people as of 2026-09-18), which
  the archive branch does not preserve because that branch keeps the code, not
  the data.
