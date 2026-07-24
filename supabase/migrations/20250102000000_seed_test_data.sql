-- Seed test college with all settings
-- This migration creates the test college with comprehensive settings

INSERT INTO colleges (
  code, 
  name_en, 
  name_ar, 
  abbreviation, 
  official_email, 
  phone_number,
  primary_color,
  secondary_color,
  academic_settings,
  financial_settings,
  email_settings,
  onboarding_settings,
  system_settings,
  examination_settings
) VALUES (
  'TEST001',
  'Test University',
  'جامعة الاختبار',
  'TU',
  'admin@testuniversity.edu',
  '+966501234567',
  '#952562',
  '#E82B5E',
  '{
    "creditHours": {
      "minPerSemester": 12,
      "maxPerSemester": 18,
      "maxWithPermission": 21,
      "minGpaForOverload": 3
    },
    "gpa": {
      "minPassing": 2,
      "maxScale": 4,
      "honorRollMin": 3.5,
      "probationThreshold": 2
    },
    "gradingScale": [
      {"letter": "A+", "minPercent": 90, "maxPercent": 100, "points": 4.3, "passing": true},
      {"letter": "A", "minPercent": 80, "maxPercent": 89, "points": 4.0, "passing": true},
      {"letter": "A-", "minPercent": 70, "maxPercent": 79, "points": 3.7, "passing": true},
      {"letter": "B+", "minPercent": 67, "maxPercent": 69, "points": 3.3, "passing": true},
      {"letter": "B", "minPercent": 64, "maxPercent": 66, "points": 3.0, "passing": true},
      {"letter": "B-", "minPercent": 60, "maxPercent": 63, "points": 2.7, "passing": true},
      {"letter": "C+", "minPercent": 57, "maxPercent": 59, "points": 2.3, "passing": true},
      {"letter": "C", "minPercent": 54, "maxPercent": 56, "points": 2.0, "passing": true},
      {"letter": "C-", "minPercent": 50, "maxPercent": 53, "points": 1.7, "passing": true},
      {"letter": "D", "minPercent": 40, "maxPercent": 49, "points": 1.0, "passing": true},
      {"letter": "F", "minPercent": 0, "maxPercent": 39, "points": 0.0, "passing": false}
    ],
    "attendance": {
      "required": true,
      "minPercentage": 75,
      "warningThreshold": 80,
      "maxAbsenceDays": 7,
      "presentWeight": 100,
      "lateWeight": 100,
      "excusedWeight": 100,
      "countExcusedInRate": true,
      "countLateAsFull": true,
      "enableWarnings": true,
      "sendNotifications": true,
      "enforceMaxAbsence": true,
      "createAlertAtMax": true,
      "editWindowHours": 24,
      "requireApprovalAfterWindow": true,
      "allowInstructorOverride": true,
      "lateArrivalGraceMinutes": 15,
      "lateArrivalCutoffMinutes": 30,
      "earlyDepartureMinutes": 15,
      "contestDeadlineDays": 7,
      "contestReviewDeadlineDays": 14,
      "maxContestDocumentSizeMB": 5,
      "autoRejectExpired": true,
      "requireDocumentForContests": true,
      "defaultUpcomingSessionsDays": 7,
      "maxUpcomingSessionsDays": 30,
      "autoExcludeWeekends": true,
      "autoDropEnabled": true,
      "autoDropThreshold": 50
    },
    "courseRegistration": {
      "enablePrerequisiteChecking": true,
      "allowWaitlist": true,
      "addDropPeriodDays": 14
    }
  }'::jsonb,
  '{
    "paymentGateway": {
      "tapApiKey": "",
      "tapSecretKey": "",
      "testMode": true
    },
    "discounts": {
      "enableEarlyPayment": true,
      "earlyPaymentPercent": 5,
      "earlyPaymentDays": 10,
      "enableSiblingDiscount": true,
      "siblingDiscountPercent": 10
    },
    "lateFees": {
      "enabled": true,
      "amount": 25,
      "percentage": 5,
      "gracePeriodDays": 7
    },
    "installments": {
      "minInstallments": 2,
      "maxInstallments": 24
    },
    "reminders": {
      "daysBeforeDue": 3,
      "minDaysBetween": 2,
      "upcomingDueWindow": 7
    },
    "invoice": {
      "prefix": "INV",
      "format": "{prefix}-{year}-{sequence:D6}",
      "dueDays": 30
    },
    "currency": {
      "code": "USD",
      "symbol": "$",
      "decimalPlaces": 2
    },
    "refund": {
      "allowRefunds": true,
      "fullRefundPeriodDays": 7,
      "partialRefundPeriodDays": 30,
      "partialRefundPercent": 50
    }
  }'::jsonb,
  '{
    "smtp": {
      "host": "smtp.gmail.com",
      "port": 587,
      "enableSsl": true,
      "username": "",
      "password": "",
      "fromEmail": "noreply@testuniversity.edu",
      "fromName": "Test University"
    },
    "notifications": {
      "enableEmailNotifications": true
    },
    "testEmail": "test@example.com"
  }'::jsonb,
  '{
    "application": {
      "enableOnlineApplications": true,
      "deadlineDays": 30,
      "requireDocumentUpload": true,
      "applicationFee": 100,
      "offerAcceptanceDays": 14,
      "documentSubmissionDays": 7,
      "autoArchiveDays": 365,
      "minApplicantAge": 16,
      "maxApplicantAge": 100,
      "minScholarshipPercent": 1,
      "maxScholarshipPercent": 100,
      "personalStatementMinLength": 100,
      "personalStatementMaxLength": 2000,
      "scholarshipJustificationMinLength": 50,
      "scholarshipJustificationMaxLength": 1000,
      "defaultPriority": "normal",
      "defaultInterviewType": "in_person"
    },
    "documents": {
      "maxSizeMB": 5,
      "allowedTypes": ["PDF", "JPG", "JPEG", "PNG", "DOC", "DOCX"]
    },
    "committee": {
      "minMembers": 3,
      "requireUnanimous": false,
      "decisionTimeoutDays": 30
    }
  }'::jsonb,
  '{
    "security": {
      "sessionTimeoutMinutes": 30,
      "passwordExpiryDays": 90,
      "maxLoginAttempts": 5,
      "accountLockoutMinutes": 15,
      "enableTwoFactor": false
    },
    "fileUpload": {
      "maxSizeMB": 10,
      "storageProvider": "local"
    },
    "maintenance": {
      "enabled": false,
      "message": ""
    },
    "backup": {
      "enabled": true,
      "retentionDays": 30,
      "schedule": "0 2 * * *"
    },
    "localization": {
      "defaultLanguage": "en",
      "autoDetectLanguage": true,
      "enableRTL": true
    }
  }'::jsonb,
  '{
    "grading": {
      "minPassingPercentage": 50,
      "minPassingGradePoints": 2,
      "minExcellencePercentage": 90,
      "minGoodPercentage": 75
    },
    "examTypes": {
      "defaultMidtermWeight": 30,
      "defaultFinalWeight": 40,
      "defaultQuizWeight": 10,
      "defaultAssignmentWeight": 20,
      "enforceWeightSum100": true,
      "allowCustomTypes": true
    },
    "scheduling": {
      "generationWindowDays": 90,
      "defaultUpcomingExamsWindowDays": 7,
      "minPreparationDays": 7,
      "maxExamsPerDay": 3,
      "allowWeekendExams": false,
      "allowOverlappingExams": false
    },
    "makeup": {
      "allowMakeupExams": true,
      "requestDeadlineDays": 3,
      "maxAttempts": 2,
      "penaltyPercentage": 0
    },
    "roomAllocation": {
      "requireRoomAllocation": true,
      "studentsPerRoom": 30,
      "socialDistancingCapacityPercent": 50,
      "enforceSocialDistancing": false
    },
    "invigilator": {
      "requireInvigilators": true,
      "minInvigilatorsPerRoom": 1,
      "maxAssignmentsPerDay": 3,
      "studentsPerInvigilator": 30
    },
    "conflictDetection": {
      "enabled": true,
      "checkStudentConflicts": true,
      "checkInvigilatorConflicts": true,
      "checkRoomConflicts": true
    }
  }'::jsonb
) ON CONFLICT (code) DO UPDATE SET
  name_en = EXCLUDED.name_en,
  name_ar = EXCLUDED.name_ar,
  academic_settings = EXCLUDED.academic_settings,
  financial_settings = EXCLUDED.financial_settings,
  email_settings = EXCLUDED.email_settings,
  onboarding_settings = EXCLUDED.onboarding_settings,
  system_settings = EXCLUDED.system_settings,
  examination_settings = EXCLUDED.examination_settings,
  updated_at = now();




