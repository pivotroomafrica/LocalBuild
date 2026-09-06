-- supabase/seed.sql
-- Development seed data for PIVOTROOM-DEMO. Kept separate from schema
-- migrations (supabase/migrations/) on purpose: this file is safe to
-- re-run/re-load and must never ship real user data.
--
-- Fake customer accounts are NOT seeded here. auth.users rows created by
-- raw SQL bypass Supabase Auth's password hashing/session machinery and
-- behave unreliably, so test customers should always be created through
-- the real signup flow (see README "Testing" section for ready-made fake
-- accounts to use, e.g. customer01@example.test).

insert into public.industries (name, slug) values
  ('Technology', 'technology'),
  ('Financial Services', 'financial-services'),
  ('Manufacturing', 'manufacturing'),
  ('Construction & Real Estate', 'construction-real-estate'),
  ('Professional Services', 'professional-services'),
  ('Retail & E-commerce', 'retail-ecommerce'),
  ('Hospitality & Tourism', 'hospitality-tourism'),
  ('Healthcare', 'healthcare'),
  ('Education', 'education'),
  ('Media & Entertainment', 'media-entertainment'),
  ('Agriculture', 'agriculture'),
  ('Logistics & Supply Chain', 'logistics-supply-chain'),
  ('Government & NGO', 'government-ngo'),
  ('Marketing & Advertising', 'marketing-advertising'),
  ('Consumer Goods', 'consumer-goods'),
  ('Energy', 'energy'),
  ('Other', 'other')
on conflict (slug) do nothing;

-- Phase 2: expertise categories (distinct concept from industries above --
-- an expert's industry background vs. what they offer to advise on).
insert into public.expert_categories (name, slug, sort_order) values
  ('Career & Professional', 'career-professional', 1),
  ('Funding, Investment & Finance', 'funding-investment-finance', 2),
  ('Industry & Specialized Expertise', 'industry-specialized-expertise', 3),
  ('Leadership, Management & Operations', 'leadership-management-operations', 4),
  ('Marketing, Brand & Growth', 'marketing-brand-growth', 5),
  ('Product, Technology & AI', 'product-technology-ai', 6),
  ('Sales, Partnership & Expansion', 'sales-partnership-expansion', 7),
  ('Starting & Building a Business', 'starting-building-a-business', 8)
on conflict (slug) do nothing;
