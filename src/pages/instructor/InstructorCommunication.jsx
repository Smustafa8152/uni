import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useAuth } from '../../contexts/AuthContext'
import { useLanguage } from '../../contexts/LanguageContext'
import { getLocalizedName } from '../../utils/localizedName'
import { supabase } from '../../lib/supabase'
import { getActiveInstructorByEmail } from '../../utils/getActiveInstructorByEmail'
import {
  ANNOUNCEMENT_CATEGORIES,
  ALLOWED_ATTACHMENT_EXT,
  ALLOWED_ATTACHMENT_TYPES,
  buildInstructorCommunicationEmailHtml,
  categoryLabel,
  fileToAttachment,
  parseManualEmails,
} from '../../utils/instructorCommunicationEmail'
import { sendInstructorAnnouncement, sendInstructorPrivateMessage } from '../../utils/sendInstructorCommunication'
import {
  BUILTIN_ANNOUNCEMENT_TEMPLATES,
  buildTemplateVars,
  resolveBuiltinTemplate,
  resolveCustomTemplate,
} from '../../utils/announcementTemplates'

const MAX_ATTACHMENT_BYTES = 8 * 1024 * 1024
const MAX_ATTACHMENTS = 5

/** Instructor ↔ students communication — announcements, email (SMTP), attachments, preview. */
export default function InstructorCommunication({ embedded = false, embedClassId = null } = {}) {
  const { t } = useTranslation()
  const { isRTL, language } = useLanguage()
  const { user } = useAuth()
  const isAr = language === 'ar'
  const [searchParams, setSearchParams] = useSearchParams()
  const urlClassId = useMemo(() => {
    const p = searchParams.get('classId')
    return p ? Number(p) : null
  }, [searchParams])
  const embeddedClassId = useMemo(() => {
    if (embedded && embedClassId != null && embedClassId !== '' && embedClassId !== 0) {
      const n = Number(embedClassId)
      return Number.isNaN(n) ? null : n
    }
    return null
  }, [embedded, embedClassId])

  const [loading, setLoading] = useState(true)
  const [loadingClass, setLoadingClass] = useState(false)
  const [instructorClasses, setInstructorClasses] = useState([])
  const [selectedClassId, setSelectedClassId] = useState('')
  const [classRow, setClassRow] = useState(null)
  const [instructor, setInstructor] = useState(null)
  const [students, setStudents] = useState([])
  const [pastAnnouncements, setPastAnnouncements] = useState([])
  const [sending, setSending] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  // Announcement form
  const [annTitle, setAnnTitle] = useState('')
  const [annBody, setAnnBody] = useState('')
  const [annCategory, setAnnCategory] = useState('general')
  const [annAudience, setAnnAudience] = useState('all')
  const [annDelivery, setAnnDelivery] = useState('both')
  const [selectedStudentIds, setSelectedStudentIds] = useState([])
  const [studentSearch, setStudentSearch] = useState('')
  const [annAttachments, setAnnAttachments] = useState([])
  const [showPreview, setShowPreview] = useState(false)
  const [manualEmails, setManualEmails] = useState('')
  const [customTemplates, setCustomTemplates] = useState([])
  const [selectedTemplateId, setSelectedTemplateId] = useState('')
  const [showSaveTemplate, setShowSaveTemplate] = useState(false)
  const [saveTemplateName, setSaveTemplateName] = useState('')
  const [savingTemplate, setSavingTemplate] = useState(false)

  // Private message form
  const [msgStudentId, setMsgStudentId] = useState('')
  const [msgSubject, setMsgSubject] = useState('')
  const [msgBody, setMsgBody] = useState('')
  const [msgDelivery, setMsgDelivery] = useState('both')
  const [msgAttachments, setMsgAttachments] = useState([])
  const [msgStudentSearch, setMsgStudentSearch] = useState('')

  const logoUrl = `${window.location.origin}/assets/Logo.png`

  const activeClassId = useMemo(() => {
    if (embeddedClassId) return embeddedClassId
    const n = Number(selectedClassId)
    return selectedClassId && !Number.isNaN(n) ? n : null
  }, [embeddedClassId, selectedClassId])

  const loadInstructorClasses = useCallback(async () => {
    if (!user?.email) {
      setLoading(false)
      return
    }
    setLoading(true)
    setError('')
    try {
      const inst = await getActiveInstructorByEmail(user.email)
      if (!inst) throw new Error(t('instructorPortal.commErrNoInstructor'))
      setInstructor(inst)

      const { data: templates } = await supabase
        .from('instructor_announcement_templates')
        .select('id, name, title, body, category, updated_at')
        .eq('instructor_id', inst.id)
        .order('updated_at', { ascending: false })
      setCustomTemplates(templates || [])

      const { data: classes, error: clsErr } = await supabase
        .from('classes')
        .select('id, section, subject_id, subjects ( id, code, name_en, name_ar ), semesters ( name_en, name_ar, code )')
        .eq('instructor_id', inst.id)
        .eq('status', 'active')
        .order('id', { ascending: false })

      if (clsErr) throw clsErr
      const list = classes || []
      setInstructorClasses(list)

      const preferredId = embeddedClassId || urlClassId || (list[0]?.id ?? '')
      setSelectedClassId((prev) => {
        if (prev && list.some((c) => String(c.id) === String(prev))) return prev
        return preferredId ? String(preferredId) : ''
      })
    } catch (e) {
      setError(e.message || t('instructorPortal.commErrLoad'))
      setInstructorClasses([])
    } finally {
      setLoading(false)
    }
  }, [user?.email, embeddedClassId, urlClassId, t])

  const loadClassData = useCallback(async () => {
    if (!instructor?.id || !activeClassId) {
      setClassRow(null)
      setStudents([])
      setPastAnnouncements([])
      return
    }
    setLoadingClass(true)
    setError('')
    try {
      const { data: cls, error: clsErr } = await supabase
        .from('classes')
        .select('id, subject_id, subjects ( id, code, name_en, name_ar )')
        .eq('id', activeClassId)
        .eq('instructor_id', instructor.id)
        .maybeSingle()
      if (clsErr || !cls) throw new Error(t('instructorPortal.commErrNoClass'))
      setClassRow(cls)

      const { data: enrollments, error: enrErr } = await supabase
        .from('enrollments')
        .select('student_id, students ( id, student_id, name_en, name_ar, email, status )')
        .eq('class_id', activeClassId)
        .eq('status', 'enrolled')

      if (enrErr) console.error(enrErr)

      const list = (enrollments || [])
        .map((e) => e.students)
        .filter((s) => s && String(s.email || '').trim())
        .sort((a, b) => getLocalizedName(a, isAr).localeCompare(getLocalizedName(b, isAr), isAr ? 'ar' : 'en'))
      setStudents(list)

      const { data: past } = await supabase
        .from('course_announcements')
        .select('id, title, body, category, sent_at, recipient_count, email_sent_count, delivery_channel')
        .eq('class_id', activeClassId)
        .order('sent_at', { ascending: false })
        .limit(20)
      setPastAnnouncements(past || [])
    } catch (e) {
      setError(e.message || t('instructorPortal.commErrLoad'))
      setClassRow(null)
      setStudents([])
      setPastAnnouncements([])
    } finally {
      setLoadingClass(false)
    }
  }, [instructor?.id, activeClassId, isAr, t])

  useEffect(() => {
    loadInstructorClasses()
  }, [loadInstructorClasses])

  useEffect(() => {
    loadClassData()
  }, [loadClassData])

  const handleCourseChange = (classIdValue) => {
    setSelectedClassId(classIdValue)
    setSelectedStudentIds([])
    setManualEmails('')
    if (!embedded && classIdValue) {
      setSearchParams({ classId: classIdValue })
    }
  }

  const classLabel = (cls) => {
    const code = cls.subjects?.code || '—'
    const name = getLocalizedName(cls.subjects, isAr)
    const section = cls.section ? ` · ${cls.section}` : ''
    const sem = cls.semesters ? ` (${getLocalizedName(cls.semesters, isAr)})` : ''
    return `${code}${section} — ${name}${sem}`
  }

  const subjectCode = classRow?.subjects?.code || '—'
  const courseName = classRow?.subjects ? getLocalizedName(classRow.subjects, isAr) : ''
  const subjectId = classRow?.subject_id
  const crumbHref = subjectId ? `/instructor/subjects/${subjectId}` : '/instructor/courses'
  const instructorName = instructor ? getLocalizedName(instructor, isAr) : ''

  const templateVars = useMemo(
    () => buildTemplateVars({ courseCode: subjectCode, courseName, instructorName }),
    [subjectCode, courseName, instructorName],
  )

  const handleApplyTemplate = (templateId) => {
    if (!templateId) return
    setSelectedTemplateId(templateId)

    if (templateId.startsWith('builtin:')) {
      const builtin = BUILTIN_ANNOUNCEMENT_TEMPLATES.find((x) => x.id === templateId)
      if (!builtin) return
      const resolved = resolveBuiltinTemplate(builtin, t, templateVars)
      setAnnCategory(resolved.category)
      setAnnTitle(resolved.title)
      setAnnBody(resolved.body)
      return
    }

    if (templateId.startsWith('custom:')) {
      const id = Number(templateId.replace('custom:', ''))
      const row = customTemplates.find((x) => x.id === id)
      if (!row) return
      const resolved = resolveCustomTemplate(row, templateVars)
      setAnnCategory(resolved.category)
      setAnnTitle(resolved.title)
      setAnnBody(resolved.body)
    }
  }

  const handleSaveAsTemplate = async () => {
    if (!instructor?.id || !saveTemplateName.trim() || !annTitle.trim()) {
      setError(t('instructorPortal.commTplSaveErrRequired'))
      return
    }
    setSavingTemplate(true)
    setError('')
    try {
      const { data, error: saveErr } = await supabase
        .from('instructor_announcement_templates')
        .insert({
          instructor_id: instructor.id,
          name: saveTemplateName.trim(),
          title: annTitle.trim(),
          body: annBody.trim(),
          category: annCategory,
        })
        .select('id, name, title, body, category, updated_at')
        .single()
      if (saveErr) throw saveErr
      setCustomTemplates((prev) => [data, ...prev])
      setSaveTemplateName('')
      setShowSaveTemplate(false)
      setSuccess(t('instructorPortal.commTplSaveSuccess'))
    } catch (e) {
      setError(e.message || t('instructorPortal.commTplSaveFailed'))
    } finally {
      setSavingTemplate(false)
    }
  }

  const handleDeleteTemplate = async (id) => {
    if (!window.confirm(t('instructorPortal.commTplDeleteConfirm'))) return
    try {
      const { error: delErr } = await supabase
        .from('instructor_announcement_templates')
        .delete()
        .eq('id', id)
      if (delErr) throw delErr
      setCustomTemplates((prev) => prev.filter((x) => x.id !== id))
      if (selectedTemplateId === `custom:${id}`) setSelectedTemplateId('')
      setSuccess(t('instructorPortal.commTplDeleteSuccess'))
    } catch (e) {
      setError(e.message || t('instructorPortal.commTplDeleteFailed'))
    }
  }

  const filteredStudents = useMemo(() => {
    const q = studentSearch.trim().toLowerCase()
    if (!q) return students
    return students.filter((s) => {
      const name = getLocalizedName(s, isAr).toLowerCase()
      return name.includes(q) || String(s.student_id || '').toLowerCase().includes(q) || String(s.email || '').toLowerCase().includes(q)
    })
  }, [students, studentSearch, isAr])

  const filteredMsgStudents = useMemo(() => {
    const q = msgStudentSearch.trim().toLowerCase()
    if (!q) return students
    return students.filter((s) => {
      const name = getLocalizedName(s, isAr).toLowerCase()
      return name.includes(q) || String(s.student_id || '').toLowerCase().includes(q)
    })
  }, [students, msgStudentSearch, isAr])

  const parsedManualEmails = useMemo(() => parseManualEmails(manualEmails), [manualEmails])

  const resolvedRecipients = useMemo(() => {
    if (annAudience === 'manual_emails') {
      return parsedManualEmails.map((email) => ({ id: null, email }))
    }
    if (annAudience === 'specific') {
      return students.filter((s) => selectedStudentIds.includes(s.id))
    }
    return students
  }, [annAudience, students, selectedStudentIds, parsedManualEmails])

  const recipientCount = resolvedRecipients.length

  const recipientCountLabel = useMemo(() => {
    if (annAudience === 'manual_emails') {
      if (parsedManualEmails.length) {
        return t('instructorPortal.commManualEmailsCount', {
          count: parsedManualEmails.length,
          emails: parsedManualEmails.join(', '),
        })
      }
      return t('instructorPortal.commRecipientsCount', { count: 0 })
    }
    const count = annAudience === 'specific' ? selectedStudentIds.length : students.length
    if (!activeClassId) return t('instructorPortal.commPickCourseFirst')
    if (annAudience === 'specific' && count > 0) {
      const names = students
        .filter((s) => selectedStudentIds.includes(s.id))
        .map((s) => getLocalizedName(s, isAr))
        .join(isAr ? ' ، ' : ', ')
      return t('instructorPortal.commRecipientsSelected', { count, names })
    }
    return t('instructorPortal.commRecipientsCount', { count })
  }, [annAudience, selectedStudentIds, students, parsedManualEmails, activeClassId, isAr, t])

  const toggleStudent = (id) => {
    setSelectedStudentIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    )
  }

  const handleAttachmentPick = async (files, setter) => {
    const list = Array.from(files || [])
    if (!list.length) return
    const next = []
    for (const file of list) {
      if (!ALLOWED_ATTACHMENT_TYPES.includes(file.type) && !file.name.match(/\.(pdf|docx?|pptx?|jpe?g|png|gif|webp)$/i)) {
        setError(t('instructorPortal.commAttachTypeError', { name: file.name }))
        return
      }
      if (file.size > MAX_ATTACHMENT_BYTES) {
        setError(t('instructorPortal.commAttachSizeError', { name: file.name }))
        return
      }
      next.push(file)
    }
    setter((prev) => [...prev, ...next].slice(0, MAX_ATTACHMENTS))
    setError('')
  }

  const previewHtml = useMemo(
    () =>
      buildInstructorCommunicationEmailHtml({
        logoUrl,
        courseCode: subjectCode,
        instructorName,
        title: annTitle || t('instructorPortal.commPreviewTitlePlaceholder'),
        body: annBody || t('instructorPortal.commPreviewBodyPlaceholder'),
        category: annCategory,
        isArabic: isAr,
      }),
    [logoUrl, subjectCode, instructorName, annTitle, annBody, annCategory, isAr, t],
  )

  const prepareAttachments = async (files) => {
    const out = []
    for (const f of files) {
      out.push(await fileToAttachment(f))
    }
    return out
  }

  const handlePublish = async () => {
    if (!activeClassId) {
      setError(t('instructorPortal.commErrPickCourse'))
      return
    }
    if (!annTitle.trim() || !annBody.trim()) {
      setError(t('instructorPortal.commErrRequired'))
      return
    }
    if (annAudience === 'specific' && !selectedStudentIds.length) {
      setError(t('instructorPortal.commErrNoRecipients'))
      return
    }
    if (annAudience === 'manual_emails' && !parsedManualEmails.length) {
      setError(t('instructorPortal.commErrNoManualEmails'))
      return
    }
    setShowPreview(true)
  }

  const confirmPublish = async () => {
    setSending(true)
    setError('')
    setSuccess('')
    try {
      const attachments = await prepareAttachments(annAttachments)
      const result = await sendInstructorAnnouncement({
        classId: activeClassId,
        title: annTitle.trim(),
        body: annBody.trim(),
        category: annCategory,
        targetAudience: annAudience,
        recipientStudentIds: annAudience === 'specific' ? selectedStudentIds : undefined,
        manualEmailsRaw: annAudience === 'manual_emails' ? manualEmails : undefined,
        deliveryChannel: annDelivery,
        attachments,
        logoUrl,
        isArabic: isAr,
      })
      setSuccess(
        t('instructorPortal.commPublishSuccess', {
          count: result.recipientCount,
          emailed: result.emailSentCount || 0,
        }),
      )
      setAnnTitle('')
      setAnnBody('')
      setAnnAttachments([])
      setSelectedStudentIds([])
      setManualEmails('')
      setShowPreview(false)
      loadClassData()
    } catch (e) {
      setError(e.message || t('instructorPortal.commErrSend'))
    } finally {
      setSending(false)
    }
  }

  const handleSendMessage = async () => {
    if (!activeClassId) {
      setError(t('instructorPortal.commErrPickCourse'))
      return
    }
    if (!msgStudentId || !msgSubject.trim() || !msgBody.trim()) {
      setError(t('instructorPortal.commErrRequired'))
      return
    }
    setSending(true)
    setError('')
    setSuccess('')
    try {
      const attachments = await prepareAttachments(msgAttachments)
      await sendInstructorPrivateMessage({
        classId: activeClassId,
        studentId: Number(msgStudentId),
        subject: msgSubject.trim(),
        body: msgBody.trim(),
        deliveryChannel: msgDelivery,
        attachments,
        logoUrl,
        isArabic: isAr,
      })
      setSuccess(t('instructorPortal.commMessageSuccess'))
      setMsgSubject('')
      setMsgBody('')
      setMsgStudentId('')
      setMsgAttachments([])
    } catch (e) {
      setError(e.message || t('instructorPortal.commErrSend'))
    } finally {
      setSending(false)
    }
  }

  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: 200 }}>
        <div style={{ width: 40, height: 40, border: '3px solid var(--bdr)', borderTopColor: 'var(--p)', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
      </div>
    )
  }

  if (embedded && !embeddedClassId) {
    return <div className="alert alert-info">{t('instructorPortal.analyticsPickClass')}</div>
  }

  return (
    <>
      {!embedded && (
        <>
          <nav className="bc" aria-label={t('instructorPortal.breadcrumbMain')}>
            <Link to="/instructor/dashboard">{t('instructorPortal.dashboard')}</Link>
            <span className="bc-sep">›</span>
            <Link to={crumbHref}>{subjectCode}</Link>
            <span className="bc-sep">›</span>
            <span>{t('instructorPortal.communicationBreadcrumb')}</span>
          </nav>
          <div className="ph">
            <div>
              <h1>{t('instructorPortal.communicationPageTitle')}</h1>
              <p className="ph-sub">{t('instructorPortal.communicationPageSubtitle', { code: subjectCode })}</p>
            </div>
          </div>
        </>
      )}

      {error && <div className="alert alert-err" style={{ marginBottom: 12 }}>{error}</div>}
      {success && <div className="alert alert-ok" style={{ marginBottom: 12 }}>{success}</div>}

      <div className="grid2">
        <div>
          <div className="card">
            <div className="card-hd">
              <div className="card-title">📢 {t('instructorPortal.commCardAnnounceTitle')}</div>
            </div>

            {!embedded && (
              <div className="fg">
                <label className="fl"><span className="req">*</span>{t('instructorPortal.commCourseLabel')}</label>
                <select
                  className="fc"
                  value={selectedClassId}
                  onChange={(e) => handleCourseChange(e.target.value)}
                  disabled={loadingClass}
                >
                  <option value="">{t('instructorPortal.commCoursePlaceholder')}</option>
                  {instructorClasses.map((cls) => (
                    <option key={cls.id} value={cls.id}>{classLabel(cls)}</option>
                  ))}
                </select>
                {loadingClass && (
                  <p style={{ fontSize: 12, color: 'var(--muted)', marginTop: 4 }}>{t('common.loading')}</p>
                )}
              </div>
            )}

            <div className="fg">
              <label className="fl">{t('instructorPortal.commTplLabel')}</label>
              <select
                className="fc"
                value={selectedTemplateId}
                onChange={(e) => {
                  const val = e.target.value
                  if (val) handleApplyTemplate(val)
                  else setSelectedTemplateId('')
                }}
              >
                <option value="">{t('instructorPortal.commTplSelect')}</option>
                <optgroup label={t('instructorPortal.commTplBuiltin')}>
                  {BUILTIN_ANNOUNCEMENT_TEMPLATES.map((tpl) => (
                    <option key={tpl.id} value={tpl.id}>{t(tpl.nameKey)}</option>
                  ))}
                </optgroup>
                {customTemplates.length > 0 && (
                  <optgroup label={t('instructorPortal.commTplMyTemplates')}>
                    {customTemplates.map((tpl) => (
                      <option key={tpl.id} value={`custom:${tpl.id}`}>{tpl.name}</option>
                    ))}
                  </optgroup>
                )}
              </select>
              <p style={{ fontSize: 11, color: 'var(--muted)', marginTop: 4 }}>{t('instructorPortal.commTplHint')}</p>
            </div>

            {customTemplates.length > 0 && (
              <div style={{ marginBottom: 12, display: 'flex', flexDirection: 'column', gap: 6 }}>
                {customTemplates.map((tpl) => (
                  <div key={tpl.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, fontSize: 13, padding: '6px 10px', background: 'var(--bg)', borderRadius: 'var(--rs)' }}>
                    <button type="button" className="btn btn-gh btn-sm" onClick={() => handleApplyTemplate(`custom:${tpl.id}`)}>
                      {tpl.name}
                    </button>
                    <button type="button" className="btn btn-gh btn-sm" onClick={() => handleDeleteTemplate(tpl.id)} title={t('common.delete')}>
                      ×
                    </button>
                  </div>
                ))}
              </div>
            )}

            <div className="fg">
              <label className="fl"><span className="req">*</span>{t('instructorPortal.commAnnCategoryLabel')}</label>
              <select className="fc" value={annCategory} onChange={(e) => setAnnCategory(e.target.value)}>
                {ANNOUNCEMENT_CATEGORIES.map((c) => (
                  <option key={c.value} value={c.value}>{t(c.labelKey)}</option>
                ))}
              </select>
            </div>

            <div className="fg">
              <label className="fl"><span className="req">*</span>{t('instructorPortal.commAnnTitleLabel')}</label>
              <input type="text" className="fc" value={annTitle} onChange={(e) => setAnnTitle(e.target.value)} placeholder={t('instructorPortal.commAnnTitlePlaceholder')} />
            </div>

            <div className="fg">
              <label className="fl">{t('instructorPortal.commAnnBodyLabel')}</label>
              <textarea className="fc" rows={4} value={annBody} onChange={(e) => setAnnBody(e.target.value)} placeholder={t('instructorPortal.commAnnBodyPlaceholder')} />
            </div>

            <div className="fg">
              <label className="fl">{t('instructorPortal.commAttachLabel')}</label>
              <input type="file" className="fc" multiple accept={ALLOWED_ATTACHMENT_EXT} onChange={(e) => { handleAttachmentPick(e.target.files, setAnnAttachments); e.target.value = '' }} />
              {annAttachments.length > 0 && (
                <ul style={{ margin: '8px 0 0', padding: 0, listStyle: 'none', fontSize: 13 }}>
                  {annAttachments.map((f, i) => (
                    <li key={`${f.name}-${i}`} style={{ display: 'flex', justifyContent: 'space-between', gap: 8, padding: '4px 0' }}>
                      <span>{f.name}</span>
                      <button type="button" className="btn btn-gh btn-sm" onClick={() => setAnnAttachments((p) => p.filter((_, j) => j !== i))}>×</button>
                    </li>
                  ))}
                </ul>
              )}
              <p style={{ fontSize: 11, color: 'var(--muted)', marginTop: 4 }}>{t('instructorPortal.commAttachHint')}</p>
            </div>

            <div className="fr">
              <div className="fg">
                <label className="fl">{t('instructorPortal.commTargetLabel')}</label>
                <select className="fc" value={annAudience} onChange={(e) => { setAnnAudience(e.target.value); if (e.target.value !== 'specific') setSelectedStudentIds([]); if (e.target.value !== 'manual_emails') setManualEmails('') }}>
                  <option value="all">{t('instructorPortal.commTargetAll')}</option>
                  <option value="at_risk">{t('instructorPortal.commTargetAtRisk')}</option>
                  <option value="no_homework">{t('instructorPortal.commTargetNoHw')}</option>
                  <option value="specific">{t('instructorPortal.commTargetSpecific')}</option>
                  <option value="manual_emails">{t('instructorPortal.commTargetManualEmails')}</option>
                </select>
                <p style={{ fontSize: 12, color: 'var(--info)', marginTop: 6, fontWeight: 600 }}>{recipientCountLabel}</p>
              </div>
              <div className="fg">
                <label className="fl">{t('instructorPortal.commDeliveryLabel')}</label>
                <select className="fc" value={annDelivery} onChange={(e) => setAnnDelivery(e.target.value)}>
                  <option value="portal">{t('instructorPortal.commDeliveryPortal')}</option>
                  <option value="both">{t('instructorPortal.commDeliveryBoth')}</option>
                  <option value="email">{t('instructorPortal.commDeliveryEmail')}</option>
                </select>
              </div>
            </div>

            {annAudience === 'manual_emails' && (
              <div className="fg">
                <label className="fl">{t('instructorPortal.commManualEmailsLabel')}</label>
                <textarea
                  className="fc"
                  rows={3}
                  value={manualEmails}
                  onChange={(e) => setManualEmails(e.target.value)}
                  placeholder={t('instructorPortal.commManualEmailsPlaceholder')}
                />
                <p style={{ fontSize: 11, color: 'var(--muted)', marginTop: 4 }}>{t('instructorPortal.commManualEmailsHint')}</p>
              </div>
            )}

            {annAudience === 'specific' && (
              <div className="fg" style={{ border: '1px solid var(--bdr)', borderRadius: 'var(--rs)', padding: 12, background: 'var(--bg)' }}>
                <label className="fl">{t('instructorPortal.commSelectStudentsLabel')}</label>
                <input type="text" className="fc" value={studentSearch} onChange={(e) => setStudentSearch(e.target.value)} placeholder={t('instructorPortal.commSelectStudentsPlaceholder')} style={{ marginBottom: 8 }} />
                <div style={{ maxHeight: 200, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 4 }}>
                  {filteredStudents.length === 0 && (
                    <p style={{ fontSize: 13, color: 'var(--muted)' }}>{t('instructorPortal.commNoStudents')}</p>
                  )}
                  {filteredStudents.map((s) => (
                    <label key={s.id} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, cursor: 'pointer', padding: '4px 0' }}>
                      <input type="checkbox" checked={selectedStudentIds.includes(s.id)} onChange={() => toggleStudent(s.id)} />
                      <span>{getLocalizedName(s, isAr)}</span>
                      <span style={{ color: 'var(--muted)', fontSize: 11 }}>({s.student_id || s.email})</span>
                    </label>
                  ))}
                </div>
                {selectedStudentIds.length > 0 && (
                  <p style={{ fontSize: 12, marginTop: 8, color: 'var(--ok)', fontWeight: 600 }}>
                    {t('instructorPortal.commSelectedCount', { count: selectedStudentIds.length })}
                  </p>
                )}
              </div>
            )}

            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 8 }}>
              <button type="button" className="btn btn-gh btn-sm" onClick={() => setShowSaveTemplate((v) => !v)}>
                💾 {t('instructorPortal.commTplSaveAs')}
              </button>
            </div>

            {showSaveTemplate && (
              <div className="fg" style={{ border: '1px solid var(--bdr)', borderRadius: 'var(--rs)', padding: 12, background: 'var(--bg)', marginBottom: 12 }}>
                <label className="fl">{t('instructorPortal.commTplSaveNameLabel')}</label>
                <input
                  type="text"
                  className="fc"
                  value={saveTemplateName}
                  onChange={(e) => setSaveTemplateName(e.target.value)}
                  placeholder={t('instructorPortal.commTplSaveNamePlaceholder')}
                  style={{ marginBottom: 8 }}
                />
                <div style={{ display: 'flex', gap: 8 }}>
                  <button type="button" className="btn btn-p btn-sm" onClick={handleSaveAsTemplate} disabled={savingTemplate}>
                    {savingTemplate ? t('instructorPortal.commSending') : t('common.save')}
                  </button>
                  <button type="button" className="btn btn-gh btn-sm" onClick={() => { setShowSaveTemplate(false); setSaveTemplateName('') }}>
                    {t('common.cancel')}
                  </button>
                </div>
              </div>
            )}

            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <button type="button" className="btn btn-gh" onClick={() => setShowPreview(true)} disabled={!annTitle.trim()}>
                👁 {t('instructorPortal.commPreviewBtn')}
              </button>
              <button type="button" className="btn btn-p btn-bl" onClick={handlePublish} disabled={sending}>
                📢 {sending ? t('instructorPortal.commSending') : t('instructorPortal.commPublishBtn')}
              </button>
            </div>
          </div>

          <div className="card">
            <div className="card-hd">
              <div className="card-title">📧 {t('instructorPortal.commPrivateTitle')}</div>
            </div>
            <div className="fg">
              <label className="fl">{t('instructorPortal.commPrivateTo')}</label>
              <input type="text" className="fc" value={msgStudentSearch} onChange={(e) => setMsgStudentSearch(e.target.value)} placeholder={t('instructorPortal.commPrivateToPlaceholder')} style={{ marginBottom: 6 }} />
              <select className="fc" value={msgStudentId} onChange={(e) => setMsgStudentId(e.target.value)}>
                <option value="">{t('instructorPortal.commPrivateSelectStudent')}</option>
                {filteredMsgStudents.map((s) => (
                  <option key={s.id} value={s.id}>{getLocalizedName(s, isAr)} — {s.student_id || s.email}</option>
                ))}
              </select>
            </div>
            <div className="fg">
              <label className="fl">{t('instructorPortal.commPrivateSubject')}</label>
              <input type="text" className="fc" value={msgSubject} onChange={(e) => setMsgSubject(e.target.value)} placeholder={t('instructorPortal.commPrivateSubjectPlaceholder')} />
            </div>
            <div className="fg">
              <label className="fl">{t('instructorPortal.commPrivateBody')}</label>
              <textarea className="fc" rows={4} value={msgBody} onChange={(e) => setMsgBody(e.target.value)} placeholder={t('instructorPortal.commPrivateBodyPlaceholder')} />
            </div>
            <div className="fg">
              <label className="fl">{t('instructorPortal.commAttachLabel')}</label>
              <input type="file" className="fc" multiple accept={ALLOWED_ATTACHMENT_EXT} onChange={(e) => { handleAttachmentPick(e.target.files, setMsgAttachments); e.target.value = '' }} />
              {msgAttachments.length > 0 && (
                <ul style={{ margin: '8px 0 0', padding: 0, listStyle: 'none', fontSize: 13 }}>
                  {msgAttachments.map((f, i) => (
                    <li key={`${f.name}-${i}`} style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                      <span>{f.name}</span>
                      <button type="button" className="btn btn-gh btn-sm" onClick={() => setMsgAttachments((p) => p.filter((_, j) => j !== i))}>×</button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <div className="fg">
              <label className="fl">{t('instructorPortal.commDeliveryLabel')}</label>
              <select className="fc" value={msgDelivery} onChange={(e) => setMsgDelivery(e.target.value)}>
                <option value="portal">{t('instructorPortal.commDeliveryPortal')}</option>
                <option value="both">{t('instructorPortal.commDeliveryBoth')}</option>
                <option value="email">{t('instructorPortal.commDeliveryEmail')}</option>
              </select>
            </div>
            <button type="button" className="btn btn-p btn-bl" onClick={handleSendMessage} disabled={sending}>
              📧 {sending ? t('instructorPortal.commSending') : t('instructorPortal.commSendBtn')}
            </button>
          </div>
        </div>

        <div>
          <div className="card">
            <div className="card-hd">
              <div className="card-title">📋 {t('instructorPortal.commPrevTitle')}</div>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {pastAnnouncements.length === 0 && (
                <p style={{ fontSize: 13, color: 'var(--muted)' }}>{t('instructorPortal.commNoAnnouncements')}</p>
              )}
              {pastAnnouncements.map((a) => (
                <div key={a.id} style={{ background: 'var(--bg)', borderRadius: 'var(--rs)', padding: 14 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 6, gap: 8 }}>
                    <div>
                      <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 999, background: 'var(--info-bg)', color: 'var(--info)', marginBottom: 4, display: 'inline-block' }}>
                        {categoryLabel(a.category, isAr)}
                      </span>
                      <div style={{ fontWeight: 700, fontSize: 13 }}>{a.title}</div>
                    </div>
                    <span style={{ fontSize: 11, color: 'var(--muted)', whiteSpace: 'nowrap' }}>
                      {new Date(a.sent_at).toLocaleDateString(isAr ? 'ar-SA-u-nu-latn' : 'en-GB')}
                    </span>
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--muted)' }}>{a.body?.slice(0, 120)}{a.body?.length > 120 ? '…' : ''}</div>
                  <div style={{ fontSize: 11, color: 'var(--ok)', marginTop: 6 }}>
                    {t('instructorPortal.commPrevStats', { sent: a.recipient_count, emailed: a.email_sent_count || 0 })}
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="card">
            <div className="card-hd">
              <div className="card-title">💬 {t('instructorPortal.commInboxTitle')}</div>
            </div>
            <p style={{ fontSize: 13, color: 'var(--muted)' }}>{t('instructorPortal.commInboxComingSoon')}</p>
          </div>
        </div>
      </div>

      {showPreview && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 2000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }} onClick={() => !sending && setShowPreview(false)}>
          <div style={{ background: 'var(--sur)', borderRadius: 'var(--r)', maxWidth: 720, width: '100%', maxHeight: '90vh', overflow: 'auto', padding: 20 }} onClick={(e) => e.stopPropagation()}>
            <h2 style={{ margin: '0 0 12px', fontSize: 18 }}>{t('instructorPortal.commPreviewTitle')}</h2>
            <p style={{ fontSize: 13, color: 'var(--muted)', marginBottom: 12 }}>{t('instructorPortal.commPreviewHint', { count: recipientCount })}</p>
            <div style={{ border: '1px solid var(--bdr)', borderRadius: 'var(--rs)', overflow: 'hidden', marginBottom: 16 }}>
              <iframe title="preview" srcDoc={previewHtml} style={{ width: '100%', height: 420, border: 'none' }} />
            </div>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button type="button" className="btn btn-gh" onClick={() => setShowPreview(false)} disabled={sending}>{t('common.cancel')}</button>
              <button type="button" className="btn btn-p" onClick={confirmPublish} disabled={sending}>
                {sending ? t('instructorPortal.commSending') : t('instructorPortal.commConfirmSend')}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
