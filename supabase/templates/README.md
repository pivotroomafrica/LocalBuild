# Account email templates (Supabase Auth)

Sign-up confirmation, password reset and the other account emails are sent
by Supabase Auth, not by the app, so their wording and design live in the
Supabase dashboard. These files are the source to paste there.

Supabase dashboard -> Authentication -> Emails (Templates). For each one,
set the subject and paste the whole file into the message body:

| Template            | Subject                                   | File                  |
| ------------------- | ----------------------------------------- | --------------------- |
| Confirm sign up     | Confirm your email for Pivotroom          | confirm-signup.html   |
| Reset password      | Reset your Pivotroom password             | reset-password.html   |
| Magic link          | Your Pivotroom sign-in link               | magic-link.html       |
| Change email address| Confirm your new email for Pivotroom      | change-email.html     |
| Invite user         | You're invited to Pivotroom               | invite.html           |

The links go to `{{ .SiteURL }}/auth/callback?token_hash=...` (our own
domain, which mail filters trust more than a supabase.co link, and which
works even when the email is opened on another device). So in
Authentication -> URL Configuration, **Site URL must be
https://pivotroom.africa**. `{{ .TokenHash }}`, `{{ .RedirectTo }}`,
`{{ .Email }}` and `{{ .NewEmail }}` are filled in by Supabase. The logo is loaded from https://pivotroom.africa/icons/icon-192.png.

Delivery (landing in the inbox, not spam) depends on DNS, not on these
files: the sending domain needs SPF, DKIM and DMARC records. See the
deploy notes.
