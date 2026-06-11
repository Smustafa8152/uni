-- Honorific prefix shown before instructor name (e.g. Dr., Prof., Eng.)
ALTER TABLE "instructors"
ADD COLUMN IF NOT EXISTS "academic_title" varchar(50);

COMMENT ON COLUMN "instructors"."academic_title" IS 'Display prefix before name (Dr., Prof., Eng., or custom). Distinct from job title (instructor_title enum).';
