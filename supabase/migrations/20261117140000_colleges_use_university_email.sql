-- Colleges currently store empty Gmail stubs with use_university_settings = false.
-- Document requests and other admission emails already fall back to university SMTP,
-- but college email tests and some paths do not. Point incomplete college mail at the university mailbox.

UPDATE public.colleges c
SET use_university_settings = true
WHERE COALESCE(c.use_university_settings, false) = false
  AND NOT (
    COALESCE(NULLIF(c.email_settings #>> '{smtp,host}', ''), NULLIF(c.email_settings ->> 'smtp_host', ''), '') <> ''
    AND COALESCE(NULLIF(c.email_settings #>> '{smtp,fromEmail}', ''), NULLIF(c.email_settings ->> 'from_email', ''), '') <> ''
    AND COALESCE(NULLIF(c.email_settings #>> '{smtp,username}', ''), NULLIF(c.email_settings ->> 'smtp_username', ''), '') <> ''
    AND COALESCE(NULLIF(c.email_settings #>> '{smtp,password}', ''), NULLIF(c.email_settings ->> 'smtp_password', ''), '') <> ''
  );
