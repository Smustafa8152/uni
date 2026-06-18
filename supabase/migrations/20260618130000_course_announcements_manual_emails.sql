ALTER TABLE public.course_announcements
  ADD COLUMN IF NOT EXISTS manual_recipient_emails text[] DEFAULT '{}';

ALTER TABLE public.course_announcements
  DROP CONSTRAINT IF EXISTS course_announcements_target_audience_check;

ALTER TABLE public.course_announcements
  ADD CONSTRAINT course_announcements_target_audience_check
  CHECK (target_audience IN ('all', 'at_risk', 'no_homework', 'specific', 'manual_emails'));
