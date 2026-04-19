import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useLanguage } from '../../contexts/LanguageContext'
import { supabase } from '../../lib/supabase'
import { MAJOR_STATUS_FOR_APPLICATION_DROPDOWN } from '../../utils/majorAdmissionStatus'
import { getLocalizedName } from '../../utils/localizedName'
import { GraduationCap, ArrowRight, Loader2, Building2, Info } from 'lucide-react'

export default function ApplicantSelectMajor() {
  const { t } = useTranslation()
  const { isRTL } = useLanguage()
  const navigate = useNavigate()

  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [colleges, setColleges] = useState([])
  const [selectedCollegeId, setSelectedCollegeId] = useState('')
  const [majors, setMajors] = useState([])

  useEffect(() => {
    let cancelled = false
    async function loadColleges() {
      setLoading(true)
      setError('')
      try {
        const { data, error: qErr } = await supabase
          .from('colleges')
          .select('id, name_en, name_ar, code, abbreviation')
          .eq('status', 'active')
          .order('name_en')
        if (qErr) throw qErr
        if (!cancelled) setColleges(data || [])
      } catch (e) {
        if (!cancelled) setError(e.message || 'Failed to load colleges')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    loadColleges()
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    let cancelled = false
    async function loadMajors() {
      if (!selectedCollegeId) {
        setMajors([])
        return
      }
      setLoading(true)
      setError('')
      try {
        const { data, error: qErr } = await supabase
          .from('majors')
          .select('id, name_en, name_ar, code, degree_level, college_id, is_university_wide')
          .in('major_status', MAJOR_STATUS_FOR_APPLICATION_DROPDOWN)
          .or(`college_id.eq.${selectedCollegeId},is_university_wide.eq.true`)
          .order('name_en')
        if (qErr) throw qErr
        if (!cancelled) setMajors(data || [])
      } catch (e) {
        if (!cancelled) setError(e.message || 'Failed to load programs')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    loadMajors()
    return () => {
      cancelled = true
    }
  }, [selectedCollegeId])

  const selectedCollege = useMemo(
    () => colleges.find((c) => String(c.id) === String(selectedCollegeId)),
    [colleges, selectedCollegeId],
  )

  const handleChoose = (majorId) => {
    navigate(`/portal/apply/new?collegeId=${encodeURIComponent(selectedCollegeId)}&majorId=${encodeURIComponent(String(majorId))}`)
  }

  return (
    <div className="max-w-6xl mx-auto w-full min-w-0 text-start" dir={isRTL ? 'rtl' : 'ltr'}>
      <nav className="flex flex-wrap items-center gap-1.5 text-sm text-[#6b7a99] mb-5">
        <Link to="/" className="hover:text-[#1a3a6b] no-underline">
          {t('applicantPortal.breadcrumbHome')}
        </Link>
        <span className="text-[#dde3ef]">/</span>
        <Link to="/portal" className="hover:text-[#1a3a6b] no-underline">
          {t('applicantPortal.breadcrumbPortal')}
        </Link>
        <span className="text-[#dde3ef]">/</span>
        <span className="text-[#1a3a6b] font-semibold">{t('applicantApplySelect.title', 'New application')}</span>
      </nav>

      <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4 mb-6">
        <div>
          <h2 className="text-2xl md:text-3xl font-extrabold text-[#1a3a6b] mb-1">
            {t('applicantApplySelect.header', 'Choose your program')}
          </h2>
          <p className="text-sm text-[#6b7a99]">
            {t('applicantApplySelect.subheader', 'Select a college first, then choose a major to start your application.')}
          </p>
        </div>
      </div>

      <div className="rounded-xl border border-[#dde3ef] bg-white shadow-sm p-4 md:p-5 mb-6">
        <div className="flex items-start gap-3">
          <div className="mt-0.5 w-9 h-9 rounded-lg bg-blue-50 text-blue-700 flex items-center justify-center shrink-0">
            <Info className="w-5 h-5" />
          </div>
          <div>
            <div className="font-bold text-[#1a3a6b]">{t('applicantApplySelect.noteTitle', 'Note')}</div>
            <div className="text-sm text-[#6b7a99] mt-0.5">
              {t(
                'applicantApplySelect.noteBody',
                'You can submit one application per term. Choose the right program before continuing.',
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="rounded-xl border border-[#dde3ef] bg-white shadow-sm p-4 md:p-6 mb-6">
        <div className="flex items-center gap-2.5 mb-3 text-[#1a3a6b] font-extrabold">
          <Building2 className="w-5 h-5" />
          {t('applicantApplySelect.collegeLabel', 'College')}
        </div>
        <select
          value={selectedCollegeId}
          onChange={(e) => setSelectedCollegeId(e.target.value)}
          className="w-full rounded-lg border border-[#dde3ef] px-3.5 py-2.5 text-sm focus:ring-2 focus:ring-[#2a5298] focus:border-transparent outline-none bg-white text-start"
        >
          <option value="">{t('applicantApplySelect.collegePlaceholder', 'Select a college')}</option>
          {colleges.map((c) => (
            <option key={c.id} value={c.id}>
              {(getLocalizedName(c, isRTL) || c.name_en || c.code) + (c.abbreviation ? ` — ${c.abbreviation}` : '')}
            </option>
          ))}
        </select>
        {selectedCollege && (
          <div className="text-xs text-[#6b7a99] mt-2">
            {t('applicantApplySelect.collegeSelected', 'Selected')}: {getLocalizedName(selectedCollege, isRTL) || selectedCollege.name_en}
          </div>
        )}
      </div>

      {loading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="w-10 h-10 text-[#1a3a6b] animate-spin" />
        </div>
      ) : error ? (
        <div className="rounded-lg border border-red-200 bg-red-50 text-red-800 px-4 py-3 text-sm">{error}</div>
      ) : !selectedCollegeId ? (
        <div className="rounded-lg border border-amber-200 bg-amber-50 text-amber-900 px-4 py-3 text-sm">
          {t('applicantApplySelect.selectCollegeFirst', 'Please select a college to see available programs.')}
        </div>
      ) : majors.length === 0 ? (
        <div className="rounded-lg border border-slate-200 bg-slate-50 text-slate-700 px-4 py-3 text-sm">
          {t('applicantApplySelect.noPrograms', 'No programs are available for admission right now.')}
        </div>
      ) : (
        <div>
          <div className="flex items-center gap-2 mb-4 text-[#1a3a6b] font-extrabold">
            <GraduationCap className="w-5 h-5" />
            {t('applicantApplySelect.programsTitle', 'Available programs')}
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
            {majors.map((m) => {
              const title = getLocalizedName(m, isRTL) || m.name_en || '—'
              const degree = m.degree_level ? String(m.degree_level) : ''
              const code = m.code ? String(m.code) : ''
              const isUniWide = Boolean(m.is_university_wide)
              return (
                <div
                  key={m.id}
                  className="rounded-xl border border-[#dde3ef] bg-white shadow-sm overflow-hidden hover:shadow-md transition-shadow"
                >
                  <div className="bg-[#1a3a6b] px-5 py-4">
                    <div className="text-white font-extrabold text-base leading-snug">{title}</div>
                    <div className="text-[#c8a84b] text-xs font-semibold mt-1">
                      {degree ? degree : t('applicantApplySelect.degreeUnknown', 'Program')}
                      {code ? ` — ${code}` : ''}
                    </div>
                  </div>
                  <div className="px-5 py-4">
                    <div className="flex flex-wrap gap-2 mb-3">
                      {isUniWide && (
                        <span className="inline-flex items-center rounded-full bg-blue-50 text-blue-800 border border-blue-200 px-2.5 py-0.5 text-xs font-bold">
                          {t('applicantApplySelect.universityWide', 'University-wide')}
                        </span>
                      )}
                      <span className="inline-flex items-center rounded-full bg-slate-50 text-slate-700 border border-slate-200 px-2.5 py-0.5 text-xs font-bold">
                        {t('applicantApplySelect.ready', 'Open for admission')}
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleChoose(m.id)}
                      className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-[#1a3a6b] text-white text-sm font-bold hover:bg-[#2a5298]"
                    >
                      {t('applicantApplySelect.choose', 'Choose this program')}
                      <ArrowRight className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}

