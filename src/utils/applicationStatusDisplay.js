/** Applicant-facing view of admissions status codes. Staff names stay in the admin UI. */

const IN_REVIEW = { view: 'in_review', labelKey: 'track.applicant.inReview', tone: 'review' }

export const APPLICANT_PHASES = ['received', 'documents', 'review', 'decision']

export const APPLICANT_STATUS = {
  APDR: { phase: 'received', view: 'action', action: 'draft', labelKey: 'track.applicant.finishApplication', tone: 'action' },
  APSB: { phase: 'received', ...IN_REVIEW },
  APIV: { phase: 'received', view: 'action', action: 'documents', labelKey: 'track.applicant.correctApplication', tone: 'action' },
  APPN: { phase: 'documents', view: 'action', action: 'payment', labelKey: 'track.applicant.paymentDue', tone: 'action' },
  APPC: { phase: 'documents', ...IN_REVIEW },

  RVQU: { phase: 'review', ...IN_REVIEW },
  RVIN: { phase: 'review', ...IN_REVIEW },
  RVHL: { phase: 'review', ...IN_REVIEW },
  RVRI: { phase: 'review', view: 'action', action: 'documents', labelKey: 'track.applicant.sendInfo', tone: 'action' },
  RVRC: { phase: 'review', ...IN_REVIEW },
  RVDV: { phase: 'documents', ...IN_REVIEW },
  RVIV: { phase: 'review', view: 'action', action: 'interview', labelKey: 'track.applicant.interview', tone: 'action' },
  RVEX: { phase: 'review', view: 'action', action: 'exam', labelKey: 'track.applicant.exam', tone: 'action' },

  DCPN: { phase: 'decision', ...IN_REVIEW },
  DCCA: { phase: 'decision', view: 'outcome', action: 'offer', labelKey: 'track.applicant.respondOffer', tone: 'accepted' },
  DCFA: { phase: 'decision', view: 'outcome', action: 'offer', labelKey: 'track.applicant.admitted', tone: 'accepted' },
  DCWL: { phase: 'decision', view: 'outcome', labelKey: 'track.applicant.waitlisted', tone: 'waitlist' },
  DCRJ: { phase: 'decision', view: 'outcome', labelKey: 'track.applicant.rejected', tone: 'rejected' },

  ENPN: { phase: 'decision', view: 'action', action: 'enrollment', labelKey: 'track.applicant.completeEnrollment', tone: 'action' },
  ENCF: { phase: 'decision', view: 'outcome', labelKey: 'track.applicant.enrolled', tone: 'accepted' },
  ENAC: { phase: 'decision', view: 'outcome', labelKey: 'track.applicant.enrolled', tone: 'accepted' },
  ENDF: { phase: 'decision', view: 'outcome', labelKey: 'track.applicant.deferred', tone: 'waitlist' },
  ENCA: { phase: 'decision', view: 'outcome', labelKey: 'track.applicant.cancelled', tone: 'rejected' },
  ENCU: { phase: 'decision', view: 'outcome', labelKey: 'track.applicant.cancelledUniversity', tone: 'rejected' },

  ACAC: { phase: 'decision', view: 'outcome', labelKey: 'track.applicant.enrolled', tone: 'accepted' },
  ACPR: { phase: 'decision', view: 'outcome', labelKey: 'track.applicant.enrolled', tone: 'accepted' },
  ACSP: { phase: 'decision', view: 'outcome', labelKey: 'track.applicant.enrolled', tone: 'waitlist' },
  ACWD: { phase: 'decision', view: 'outcome', labelKey: 'track.applicant.cancelled', tone: 'rejected' },
  GRAD: { phase: 'decision', view: 'outcome', labelKey: 'track.applicant.enrolled', tone: 'accepted' },
  ALUM: { phase: 'decision', view: 'outcome', labelKey: 'track.applicant.enrolled', tone: 'accepted' },
}

/** Statuses where the applicant should see why, or what admissions still needs. */
export const APPLICANT_REASON = {
  DCRJ: { kind: 'reason', group: 'reject' },
  RVRI: { kind: 'needed', group: 'requestInfo' },
  APIV: { kind: 'reason', group: null },
  DCWL: { kind: 'reason', group: null },
  DCCA: { kind: 'conditions', group: null },
  ENDF: { kind: 'reason', group: null },
  ENCU: { kind: 'reason', group: null },
  ENCA: { kind: 'reason', group: null },
  ACWD: { kind: 'reason', group: null },
  ACSP: { kind: 'reason', group: null },
}

export function getApplicantReasonMeta(code) {
  return APPLICANT_REASON[String(code || '').toUpperCase()] || null
}

export function getApplicantStatus(code) {
  const key = String(code || '').toUpperCase()
  return APPLICANT_STATUS[key] || { phase: 'review', ...IN_REVIEW }
}

const REQUIRED_VERIFIED_TYPES = ['id_photo', 'transcript']

/** ID photo and transcript are verified, and every uploaded file has been verified. */
export function coreDocumentsVerified(docs) {
  const list = Array.isArray(docs) ? docs : []
  if (list.length === 0) return false
  const coreOk = REQUIRED_VERIFIED_TYPES.every((type) =>
    list.some((d) => d.document_type === type && d.verified_at)
  )
  return coreOk && list.every((d) => d.verified_at)
}

/**
 * Timeline states. Once the required documents are verified, that stage is complete
 * and the applicant moves to review, unless they still have an action on an earlier step.
 */
export function applicantProgress(code, { documentsVerified = false } = {}) {
  const info = getApplicantStatus(code)
  const docIdx = APPLICANT_PHASES.indexOf('documents')
  const reviewIdx = APPLICANT_PHASES.indexOf('review')
  let current = APPLICANT_PHASES.indexOf(info.phase)
  if (current < 0) current = 0
  const heldForApplicant = info.view === 'action' && current <= docIdx
  if (documentsVerified && !heldForApplicant && current < reviewIdx) {
    current = reviewIdx
  }
  return APPLICANT_PHASES.map((phase, idx) => {
    let state = 'pending'
    if (idx < current) state = 'done'
    else if (idx === current) state = info.view === 'outcome' ? info.tone : 'current'
    return { key: phase, state }
  })
}

export function applicantStatusClass(info) {
  if (info.tone === 'rejected') return 'bg-rose-50 text-rose-800 border-rose-200'
  if (info.tone === 'accepted') return 'bg-emerald-50 text-emerald-800 border-emerald-200'
  if (info.tone === 'waitlist' || info.tone === 'action') return 'bg-amber-50 text-amber-900 border-amber-200'
  return 'bg-blue-50 text-blue-800 border-blue-200'
}
