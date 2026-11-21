-- 071: Push notifications for the installed app (PWA).
--
-- One row per device/browser that turned notifications on. People manage
-- only their own rows; the server sends with the service role and removes
-- subscriptions the push service reports as gone.

create table if not exists public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  endpoint text not null,
  p256dh text not null,
  auth text not null,
  user_agent text,
  created_at timestamptz not null default now(),
  last_used_at timestamptz,
  constraint push_subscriptions_endpoint_https check (endpoint ~ '^https://' and char_length(endpoint) <= 2000),
  constraint push_subscriptions_keys_length check (char_length(p256dh) <= 200 and char_length(auth) <= 100),
  constraint push_subscriptions_ua_length check (user_agent is null or char_length(user_agent) <= 400)
);
create unique index if not exists push_subscriptions_endpoint_key on public.push_subscriptions (endpoint);
create index if not exists push_subscriptions_user_idx on public.push_subscriptions (user_id);

alter table public.push_subscriptions enable row level security;

drop policy if exists push_subscriptions_select_own on public.push_subscriptions;
create policy push_subscriptions_select_own on public.push_subscriptions
  for select to authenticated using (user_id = (select auth.uid()));
drop policy if exists push_subscriptions_insert_own on public.push_subscriptions;
create policy push_subscriptions_insert_own on public.push_subscriptions
  for insert to authenticated with check (user_id = (select auth.uid()));
drop policy if exists push_subscriptions_delete_own on public.push_subscriptions;
create policy push_subscriptions_delete_own on public.push_subscriptions
  for delete to authenticated using (user_id = (select auth.uid()));

revoke all on public.push_subscriptions from anon, authenticated;
grant select, delete on public.push_subscriptions to authenticated;
grant insert (user_id, endpoint, p256dh, auth, user_agent) on public.push_subscriptions to authenticated;

-- Tidy (security advisor): the waitlist booking lock (070) is a trigger
-- function; nobody should call it directly.
revoke execute on function public.refuse_bookings_during_waitlist() from public, anon, authenticated;
