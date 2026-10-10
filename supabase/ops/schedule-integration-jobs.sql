-- supabase/ops/schedule-integration-jobs.sql
--
-- NOT a migration: run by hand in the Supabase SQL editor ONCE the app is
-- deployed at a public HTTPS URL. Until this runs, nothing calls
-- /api/jobs/process, so queued confirmation/cancellation/reschedule emails
-- and Google Calendar events are never sent (bookings and payments are
-- unaffected -- they are committed independently of these jobs).
--
-- Uses pg_cron + pg_net (both already installed on this project) so no
-- always-on worker is needed on shared hosting. The worker secret is kept
-- in Supabase Vault, never in the job text.
--
-- 1. Replace the two placeholders below, then run steps 1-2.
--    <APP_URL>        e.g. https://pivotroom.africa  (no trailing slash)
--    <WORKER_SECRET>  the same value as INTEGRATION_WORKER_SECRET in the
--                     app's environment

select vault.create_secret('<WORKER_SECRET>', 'integration_worker_secret');
select vault.create_secret('<APP_URL>', 'pivotroom_app_url');

-- 2. Every 2 minutes, ask the app to process due jobs. The route itself
--    claims jobs atomically, so overlapping runs are safe.
select cron.schedule(
  'pivotroom-process-integration-jobs',
  '*/2 * * * *',
  $job$
    select net.http_post(
      url := (select decrypted_secret from vault.decrypted_secrets where name = 'pivotroom_app_url')
             || '/api/jobs/process',
      headers := jsonb_build_object(
        'content-type', 'application/json',
        'x-worker-secret',
        (select decrypted_secret from vault.decrypted_secrets where name = 'integration_worker_secret')
      ),
      body := '{}'::jsonb,
      timeout_milliseconds := 30000
    );
  $job$
);

-- Check it:   select * from cron.job_run_details order by start_time desc limit 10;
--             select status_code, created from net._http_response order by created desc limit 10;
-- Pause it:   select cron.unschedule('pivotroom-process-integration-jobs');
