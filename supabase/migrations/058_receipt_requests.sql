-- Clients can ask for a receipt for a paid booking; admins issue it
-- (optionally with a file) and the client downloads it from the session
-- page. One request per booking.

create table if not exists public.receipt_requests (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null unique references public.bookings (id) on delete cascade,
  customer_id uuid not null references public.profiles (id) on delete cascade,
  receipt_name text not null,
  tin text,
  note text,
  status text not null default 'requested',
  requested_at timestamptz not null default now(),
  issued_at timestamptz,
  issued_by uuid references public.profiles (id) on delete set null,
  file_path text,
  constraint receipt_requests_name_length check (char_length(trim(receipt_name)) between 2 and 160),
  constraint receipt_requests_tin_format check (tin is null or tin ~ '^[A-Za-z0-9-]{4,20}$'),
  constraint receipt_requests_note_length check (note is null or char_length(note) <= 500),
  constraint receipt_requests_status check (status in ('requested', 'issued'))
);

create index if not exists receipt_requests_status_idx on public.receipt_requests (status, requested_at desc);

alter table public.receipt_requests enable row level security;

drop policy if exists "receipt_requests_select_own" on public.receipt_requests;
create policy "receipt_requests_select_own" on public.receipt_requests
  for select to authenticated
  using (customer_id = (select auth.uid()) or public.is_admin());

-- A client may request a receipt only for their own paid booking, and only
-- as a fresh request (never pre-issued).
drop policy if exists "receipt_requests_insert_own" on public.receipt_requests;
create policy "receipt_requests_insert_own" on public.receipt_requests
  for insert to authenticated
  with check (
    customer_id = (select auth.uid())
    and status = 'requested'
    and issued_at is null
    and issued_by is null
    and file_path is null
    and exists (
      select 1 from public.bookings b
      where b.id = booking_id
        and b.customer_id = (select auth.uid())
        and b.booking_status in ('confirmed', 'completed')
    )
  );

drop policy if exists "receipt_requests_update_admin" on public.receipt_requests;
create policy "receipt_requests_update_admin" on public.receipt_requests
  for update to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- Issued receipt files: private. Admins upload and read; clients get a
-- short-lived signed link from the server after an ownership check.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'issued-receipts',
  'issued-receipts',
  false,
  5242880,
  array['application/pdf', 'image/jpeg', 'image/jpg', 'image/png', 'image/webp']
)
on conflict (id) do nothing;

drop policy if exists "issued_receipts_admin_insert" on storage.objects;
create policy "issued_receipts_admin_insert" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'issued-receipts' and public.is_admin());

drop policy if exists "issued_receipts_admin_select" on storage.objects;
create policy "issued_receipts_admin_select" on storage.objects
  for select to authenticated
  using (bucket_id = 'issued-receipts' and public.is_admin());
