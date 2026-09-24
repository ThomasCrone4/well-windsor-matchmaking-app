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

Nothing.

## Applied from here

- **`polish9_drop_category.sql`** — applied 2026-09-24 as
  `20260924144544_polish9_drop_category`, once the `polish-role-images`
  client was merged and live. Verified on the published bundle
  (`index-CKA3gybT.js`): every remaining `category` belongs to `skills`, and
  `in_schools` and "Kind of role" are gone.

- **`wf9_2_drop_availability.sql`** — applied 2026-09-19 as
  `20260919194219_wf9_drop_availability_matching`, once 9.2's client was
  merged and live. The deploy was verified by fetching the published bundle
  and finding zero references to any availability column, table or RPC —
  not by assuming the merge had built.
