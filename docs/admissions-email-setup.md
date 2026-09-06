# Admissions email setup (SMTP)

Applicant emails (submit confirmation, document requests, decisions, messages, interview/exam invites) are sent by the Supabase edge function `send-admission-notification` using **university or college SMTP** stored in the database — not via `GMAIL_*` env vars in the frontend repo.

## Configure Gmail (recommended for go-live)

1. In Google Account → Security, enable 2-Step Verification and create an **App password**.
2. In the admin UI: **University Settings → Email** (or College Email Settings):
   - SMTP host: `smtp.gmail.com`
   - Port: `587` (STARTTLS)
   - Username: full Gmail address
   - Password: the app password (not your normal login password)
   - From email / From name: admissions branding
   - Enable email notifications: **on**
3. Use **Send test email** (`send-smtp-test`) to verify delivery before the academic year starts.

## Notes

- Never commit app passwords or paste them into source control.
- If college `use_university_settings` is enabled, university SMTP is used.
- When notifications are disabled in settings, the edge function returns success with `skipped: true`.
- Website application submit now triggers a confirmation email (`type: submitted`).
