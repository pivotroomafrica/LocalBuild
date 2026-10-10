# Backups & Recovery (Supabase Free)

Supabase Free has **no downloadable managed backups**, so Pivotroom keeps its
own. Do this **before** taking real paid bookings, and **before applying any
migration** (e.g. `046_v2_index_and_rls_performance.sql`).

Current size (2026-10-10): database 14 MB, storage 2 files / 179 kB.
The server runs **PostgreSQL 17.6**, so `pg_dump` must be version **17 or newer**.

## 1. One-time setup (Windows PC)

1. Install the PostgreSQL 17 **command-line tools** (EDB installer → select only "Command Line Tools"). This gives you `pg_dump`, `pg_restore` and `psql`.
2. Install **7-Zip** (for encrypted archives).
3. Supabase dashboard → **Connect** → copy the **Session pooler** connection string (port 5432). The direct `db.<ref>.supabase.co` host is IPv6-only and often unreachable from home networks.
4. Store the database password in a password manager. **Never** put it in a script, a log, or this repository.

## 2. Take a backup

In `cmd`, from an empty folder outside the repository:

```
set PGPASSWORD=<database password>
pg_dump "<session pooler connection string>" --format=custom --no-owner --no-privileges --schema=public --schema=storage --schema=auth --file=pivotroom.dump
set PGPASSWORD=
"C:\Program Files\7-Zip\7z.exe" a -p -mhe=on pivotroom-YYYY-MM-DD.7z pivotroom.dump
del pivotroom.dump
```

Replace `YYYY-MM-DD` with today's date. The `-p` flag prompts for an encryption password, and `-mhe=on` also hides the
file names. The `.dump` contains customer personal data, so only the
encrypted `.7z` should leave your PC.

**Where to keep it:** a private, access-restricted cloud folder plus one
offline copy. Keep at least the last **7 daily + 4 weekly** archives.

## 3. Storage files

Expert photos and payment receipts aren't in the database dump. Until the
bucket is larger, download them from Supabase dashboard → Storage
(`expert-profile-images`, `manual-payment-receipts`) into the same encrypted
archive. Receipts are financial evidence, so treat them as confidential.

## 4. Restore (test this before launch)

Extract `pivotroom.dump` from the dated `.7z`, then restore into a **separate, empty** Supabase project, never over production:

```
set PGPASSWORD=<target project password>
pg_restore --dbname="<target session pooler string>" --no-owner --no-privileges --clean --if-exists pivotroom.dump
set PGPASSWORD=
```

**Not yet verified:** restoring the `auth` and `storage` schemas into a fresh
Supabase project can fail on objects owned by Supabase's internal roles. If
it does, follow Supabase's official guide ("Migrating within Supabase" /
"Backup and restore using the CLI") for those schemas. Proving this path is
exactly what the test restore is for. Don't consider backups "working" until
one restore has succeeded.

Then check row counts against production:

```sql
select 'bookings' t, count(*) from public.bookings
union all select 'payments', count(*) from public.payments
union all select 'expert_profiles', count(*) from public.expert_profiles;
```

Record the date and result of each test restore at the bottom of this file.

## 5. Inactivity pausing

Free projects can be paused after a period of inactivity. If the site shows
database errors, check the Supabase dashboard. A paused project is resumed
from there; data is kept. Don't generate fake traffic to prevent pausing.
Once real paid bookings depend on uptime, upgrade to **Supabase Pro** (daily
managed backups, no pausing).

## Restore test log

| Date | Backup file | Result | By |
|---|---|---|---|
| | | | |
