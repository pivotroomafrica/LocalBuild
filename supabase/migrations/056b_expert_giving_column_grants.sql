-- expert_profiles updates are granted per column (experts may not touch
-- review/publish fields). Add the two giving columns from 056 so experts
-- can save their own pledge; RLS still limits them to their own row.
grant update (supported_ngo_id, donation_percent) on public.expert_profiles to authenticated;
