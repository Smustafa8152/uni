import { useState, useEffect, useCallback } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useLanguage } from '../contexts/LanguageContext'
import { supabase } from '../lib/supabase'
import { getLocalizedName } from '../utils/localizedName'
import { ArrowLeft, Edit, User, Mail, Phone, Briefcase, GraduationCap, Award, BookOpen, Languages, FileText, BadgeCheck } from 'lucide-react'

export default function ViewInstructor() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { t, i18n } = useTranslation()
  const { isRTL } = useLanguage()
  const isArabicLayout = isRTL ||
    i18n?.language?.toLowerCase()?.startsWith('ar') ||
    (typeof document !== 'undefined' && document?.documentElement?.dir === 'rtl')

  const [instructor, setInstructor] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const fetchInstructor = useCallback(async () => {
    try {
      const { data, error: fetchError } = await supabase
        .from('instructors')
        .select('*, departments(id, name_en, name_ar, code), colleges(id, name_en, name_ar, code), academic_years(id, name_en, name_ar, code)')
        .eq('id', id)
        .single()

      if (fetchError) throw fetchError
      setInstructor(data)
    } catch (err) {
      console.error('Error fetching instructor:', err)
      setError(err.message || (isArabicLayout ? 'تعذر تحميل بيانات المدرس' : 'Failed to load instructor'))
    } finally {
      setLoading(false)
    }
  }, [id, isArabicLayout])

  useEffect(() => {
    fetchInstructor()
  }, [fetchInstructor])

  const txt = (ar, en) => (isArabicLayout ? ar : en)
  const valueOrDash = (value) => (value === null || value === undefined || value === '' ? '-' : value)

  const genderLabel = (g) => {
    if (g === null || g === undefined || g === '') return '-'
    const v = String(g).toLowerCase().trim()
    if (v === 'male' || v === 'm') return txt('ذكر', 'Male')
    if (v === 'female' || v === 'f') return txt('أنثى', 'Female')
    if (v === 'other' || v === 'o') return txt('آخر', 'Other')
    return valueOrDash(g)
  }
  const formatDate = (value) => {
    if (!value) return '-'
    return new Date(value).toLocaleDateString(isArabicLayout ? 'ar-SA' : 'en-US')
  }

  const statusMeta = {
    active: { cls: 'bg-green-100 text-green-800', label: txt('نشط', 'Active') },
    on_leave: { cls: 'bg-yellow-100 text-yellow-800', label: txt('في إجازة', 'On Leave') },
    inactive: { cls: 'bg-gray-100 text-gray-700', label: txt('غير نشط', 'Inactive') }
  }
  const statusKey = instructor?.status || 'active'
  const status = statusMeta[statusKey] || statusMeta.active

  const titleLabel = (value) => {
    const map = {
      professor: txt('أستاذ', 'Professor'),
      associate_professor: txt('أستاذ مشارك', 'Associate Professor'),
      assistant_professor: txt('أستاذ مساعد', 'Assistant Professor'),
      lecturer: txt('محاضر', 'Lecturer')
    }
    return map[value] || valueOrDash(value)
  }

  const primaryName = isArabicLayout
    ? (instructor?.name_ar || instructor?.name_en || '').trim() || '-'
    : (instructor?.name_en || instructor?.name_ar || '').trim() || '-'

  const secondaryName = isArabicLayout
    ? ((instructor?.name_ar || '').trim() && (instructor?.name_en || '').trim()
        ? (instructor.name_en).trim()
        : '')
    : (instructor?.name_ar || '').trim()

  /** Physical alignment for Arabic; field tiles use card chrome. */
  const alignMain = isArabicLayout ? 'text-right' : 'text-left'

  const fieldCardShell = isArabicLayout
    ? 'w-full min-w-0 rounded-xl border border-gray-100 bg-gray-50 p-4 shadow-sm'
    : 'w-full min-w-0 rounded-lg border border-gray-200 bg-white p-4 shadow-sm'

  const renderField = (label, value, opts = {}) => {
    const { dir: valueDir, valueClassName = '' } = opts
    const d = valueDir ?? (isArabicLayout ? 'rtl' : 'ltr')
    const ltrAlignFix = isArabicLayout && d === 'ltr' ? { textAlign: 'right' } : undefined
    const isBadge = Boolean(valueClassName?.includes('bg-'))
    return (
      <div className={`${fieldCardShell} ${alignMain}`}>
        <div className={`text-xs font-medium text-gray-500 mb-1.5 ${alignMain}`}>{label}</div>
        <div
          dir={d}
          style={ltrAlignFix}
          className={`text-sm font-semibold break-words text-gray-900 ${valueClassName} ${alignMain} ${
            isBadge ? 'inline-block max-w-full' : 'block w-full'
          }`}
        >
          {value}
        </div>
      </div>
    )
  }

  const infoItems = [
    { label: txt('الاسم (إنجليزي)', 'Name (English)'), value: valueOrDash(instructor?.name_en), dir: 'ltr' },
    { label: txt('الاسم (عربي)', 'Name (Arabic)'), value: valueOrDash(instructor?.name_ar) },
    { label: txt('الرقم الوظيفي', 'Employee ID'), value: valueOrDash(instructor?.employee_id) },
    { label: txt('الحالة', 'Status'), value: status.label, className: status.cls },
    { label: txt('البريد الإلكتروني', 'Email'), value: valueOrDash(instructor?.email), dir: 'ltr' },
    { label: txt('الهاتف', 'Phone'), value: valueOrDash(instructor?.phone), dir: 'ltr' },
    { label: txt('القسم', 'Department'), value: valueOrDash(getLocalizedName(instructor?.departments, isArabicLayout)) },
    { label: txt('الكلية', 'College'), value: valueOrDash(getLocalizedName(instructor?.colleges, isArabicLayout)) },
    { label: txt('العام الأكاديمي', 'Academic Year'), value: valueOrDash(getLocalizedName(instructor?.academic_years, isArabicLayout)) },
    { label: txt('اللقب الأكاديمي', 'Title'), value: titleLabel(instructor?.title) },
    { label: txt('تاريخ التعيين', 'Hire Date'), value: formatDate(instructor?.hire_date) },
    { label: txt('التخصص', 'Specialization'), value: valueOrDash(instructor?.specialization) }
  ]

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600"></div>
      </div>
    )
  }

  if (error && !instructor) {
    return (
      <div className="space-y-6">
        <button
          onClick={() => navigate(-1)}
          className={`flex items-center ${isArabicLayout ? 'flex-row-reverse space-x-reverse' : 'space-x-2'} text-gray-600 hover:text-gray-900`}
        >
          <ArrowLeft className="w-5 h-5" />
          <span>{t('common.back')}</span>
        </button>
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-red-700">
          {error}
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-8" dir={isArabicLayout ? 'rtl' : 'ltr'}>
      <div className="flex items-center justify-between">
        <button
          onClick={() => navigate(-1)}
          className={`flex items-center ${isArabicLayout ? 'flex-row-reverse space-x-reverse' : 'space-x-2'} text-gray-600 hover:text-gray-900`}
        >
          <ArrowLeft className="w-5 h-5" />
          <span>{t('common.back')}</span>
        </button>
        <button
          onClick={() => navigate(`/instructors/${id}/edit`)}
          className={`flex items-center ${isArabicLayout ? 'flex-row-reverse space-x-reverse' : 'space-x-2'} bg-primary-gradient text-white px-4 py-2 rounded-lg hover:shadow-lg transition-all`}
        >
          <Edit className="w-4 h-4" />
          <span>{t('common.edit')}</span>
        </button>
      </div>

      <div
        className={`bg-white rounded-2xl shadow-sm border border-gray-200 p-6 sm:p-8 ${alignMain}`}
      >
        {isArabicLayout ? (
          <div
            className="mb-8 flex w-full flex-col items-start gap-3 border-b border-gray-100 pb-8"
            dir="rtl"
          >
            <div className="flex w-full flex-row items-center justify-start gap-3">
              <div className="flex h-20 w-20 shrink-0 items-center justify-center rounded-2xl bg-primary-gradient">
                <User className="h-10 w-10 text-white" />
              </div>
              <div className="flex min-w-0 flex-1 flex-wrap items-center justify-start gap-2">
                <h1 className="text-2xl font-bold text-gray-900 sm:text-3xl" dir="rtl">
                  {primaryName}
                </h1>
                <span className={`shrink-0 rounded-full px-4 py-1.5 text-xs font-semibold ${status.cls}`}>
                  {status.label}
                </span>
              </div>
            </div>
            {!!secondaryName && (
              <p
                className="w-full text-base text-gray-500"
                dir="ltr"
                style={{ textAlign: 'right' }}
              >
                {secondaryName}
              </p>
            )}
            <p className={`w-full text-gray-600 ${alignMain}`}>
              <span className="text-gray-500">{txt('الرقم الوظيفي', 'Employee ID')}:</span>{' '}
              <span dir="ltr" className="font-medium text-gray-900 tabular-nums">
                {valueOrDash(instructor?.employee_id)}
              </span>
            </p>
          </div>
        ) : (
          <div className="flex flex-col sm:flex-row sm:items-start gap-4 mb-6 sm:mb-8" dir="ltr">
            <div className="w-20 h-20 bg-primary-gradient rounded-2xl flex items-center justify-center flex-shrink-0 mx-auto sm:mx-0">
              <User className="w-10 h-10 text-white" />
            </div>
            <div className="flex-1 min-w-0 text-left">
              <div className="flex flex-wrap items-center gap-3 mb-2">
                <h1 className="text-2xl sm:text-3xl font-bold text-gray-900">{primaryName}</h1>
                <span className={`px-4 py-1.5 rounded-full text-xs font-semibold ${status.cls}`}>{status.label}</span>
              </div>
              {!!secondaryName && <p className="text-gray-500 text-base">{secondaryName}</p>}
              <p className="text-gray-600 mt-1">
                {txt('الرقم الوظيفي', 'Employee ID')}: {valueOrDash(instructor?.employee_id)}
              </p>
            </div>
          </div>
        )}

        <div
          className="grid grid-cols-1 gap-3 sm:grid-cols-2"
          dir={isArabicLayout ? 'rtl' : 'ltr'}
        >
          {infoItems.map((item, idx) => (
            <div key={idx} className="min-w-0">
              {renderField(item.label, item.value, {
                dir: item.dir,
                valueClassName: item.className || ''
              })}
            </div>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
        <section
          className={`bg-white rounded-2xl shadow-sm border border-gray-200 p-6 ${alignMain}`}
          dir={isArabicLayout ? 'rtl' : 'ltr'}
        >
          <h2 className={`text-lg font-semibold text-gray-900 mb-5 flex items-center gap-2 ${isArabicLayout ? 'flex-row-reverse justify-start' : ''} ${alignMain}`}>
            <Mail className="w-5 h-5 shrink-0" />
            <span>{txt('معلومات التواصل', 'Contact Information')}</span>
          </h2>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {renderField(txt('البريد الإلكتروني', 'Email'), valueOrDash(instructor?.email), { dir: 'ltr' })}
            {renderField(txt('الهاتف', 'Phone'), valueOrDash(instructor?.phone), { dir: 'ltr' })}
            {renderField(txt('العنوان', 'Address'), valueOrDash(instructor?.address))}
            {renderField(txt('المدينة', 'City'), valueOrDash(instructor?.city))}
            {renderField(txt('الدولة', 'Country'), valueOrDash(instructor?.country))}
          </div>
        </section>

        <section
          className={`bg-white rounded-2xl shadow-sm border border-gray-200 p-6 ${alignMain}`}
          dir={isArabicLayout ? 'rtl' : 'ltr'}
        >
          <h2 className={`text-lg font-semibold text-gray-900 mb-5 flex items-center gap-2 ${isArabicLayout ? 'flex-row-reverse justify-start' : ''} ${alignMain}`}>
            <BadgeCheck className="w-5 h-5 shrink-0" />
            <span>{txt('البيانات الشخصية', 'Personal Information')}</span>
          </h2>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {renderField(txt('تاريخ الميلاد', 'Date of Birth'), formatDate(instructor?.date_of_birth))}
            {renderField(txt('الجنس', 'Gender'), genderLabel(instructor?.gender))}
            {renderField(txt('الجنسية', 'Nationality'), valueOrDash(instructor?.nationality))}
            {renderField(txt('الهوية الوطنية', 'National ID'), valueOrDash(instructor?.national_id), { dir: 'ltr' })}
            {renderField(txt('رقم الجواز', 'Passport Number'), valueOrDash(instructor?.passport_number), { dir: 'ltr' })}
          </div>
        </section>
      </div>

      {(Array.isArray(instructor?.education) && instructor.education.length > 0) && (
        <section className={`bg-white rounded-2xl shadow-sm border border-gray-200 p-6 ${alignMain}`} dir={isArabicLayout ? 'rtl' : 'ltr'}>
          <h2 className={`text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2 ${isArabicLayout ? 'flex-row-reverse justify-start' : ''} ${alignMain}`}>
            <GraduationCap className="w-5 h-5 shrink-0" />
            <span>{txt('المؤهلات العلمية', 'Education')}</span>
          </h2>
          <div className="flex flex-col gap-4" dir={isArabicLayout ? 'rtl' : 'ltr'}>
            {instructor.education.map((edu, index) => (
              <div
                key={index}
                className={`border border-gray-200 rounded-xl p-4 ${alignMain}`}
              >
                <h4 className={`mb-3 font-semibold text-gray-900 ${alignMain}`}>{valueOrDash(edu.degree)}</h4>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  {renderField(txt('التخصص', 'Field'), valueOrDash(edu.field))}
                  {renderField(txt('الجهة', 'Institution'), valueOrDash(edu.institution))}
                  {renderField(txt('بلد الدراسة', 'Country'), valueOrDash(edu.country))}
                  {renderField(txt('سنة التخرج', 'Graduation Year'), valueOrDash(edu.graduation_year))}
                  {renderField(txt('المعدل', 'GPA'), valueOrDash(edu.gpa))}
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {(Array.isArray(instructor?.work_experience) && instructor.work_experience.length > 0) && (
        <section className={`bg-white rounded-2xl shadow-sm border border-gray-200 p-6 ${alignMain}`} dir={isArabicLayout ? 'rtl' : 'ltr'}>
          <h2 className={`text-lg font-semibold text-gray-900 mb-5 flex items-center gap-2 ${isArabicLayout ? 'flex-row-reverse justify-start' : ''} ${alignMain}`}>
            <Briefcase className="w-5 h-5 shrink-0" />
            <span>{txt('الخبرات العملية', 'Work Experience')}</span>
          </h2>
          <div className="space-y-4">
            {instructor.work_experience.map((exp, index) => (
              <div key={index} className={`border border-gray-200 rounded-xl p-4 ${alignMain}`}>
                <div className={`flex flex-wrap items-center gap-2 mb-4 ${isArabicLayout ? 'justify-start' : 'justify-between'}`}>
                  <h4 className={`font-semibold text-gray-900 ${alignMain}`}>{valueOrDash(exp.position)}</h4>
                  {exp.current && (
                    <span className="px-2 py-1 bg-green-100 text-green-800 text-xs rounded-full shrink-0">
                      {txt('حالي', 'Current')}
                    </span>
                  )}
                </div>
                <div className="grid grid-cols-1 gap-3 text-sm sm:grid-cols-2">
                  {renderField(txt('الجهة', 'Organization'), valueOrDash(exp.organization))}
                  {renderField(
                    txt('الفترة', 'Period'),
                    `${formatDate(exp.start_date)} - ${exp.current ? txt('حتى الآن', 'Present') : formatDate(exp.end_date)}`
                  )}
                  {exp.description
                    ? renderField(txt('الوصف', 'Description'), exp.description, {
                        valueClassName: 'font-normal text-gray-700 whitespace-pre-wrap'
                      })
                    : null}
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {Array.isArray(instructor?.languages) && instructor.languages.length > 0 && (
        <section className={`bg-white rounded-2xl shadow-sm border border-gray-200 p-6 ${alignMain}`} dir={isArabicLayout ? 'rtl' : 'ltr'}>
          <h2 className={`text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2 ${isArabicLayout ? 'flex-row-reverse justify-start' : ''} ${alignMain}`}>
            <Languages className="w-5 h-5 shrink-0" />
            <span>{txt('اللغات', 'Languages')}</span>
          </h2>
          <div className="flex flex-wrap gap-2 justify-start">
            {instructor.languages.map((lang, index) => (
              <span key={index} className="px-3 py-1 bg-blue-100 text-blue-800 rounded-full text-sm">
                {valueOrDash(lang.language)} {lang.proficiency ? `(${lang.proficiency})` : ''}
              </span>
            ))}
          </div>
        </section>
      )}

      {(instructor?.research_interests || instructor?.bio || instructor?.bio_ar) && (
        <section className={`bg-white rounded-2xl shadow-sm border border-gray-200 p-6 ${alignMain}`} dir={isArabicLayout ? 'rtl' : 'ltr'}>
          <h2 className={`text-lg font-semibold text-gray-900 mb-5 flex items-center gap-2 ${isArabicLayout ? 'flex-row-reverse justify-start' : ''} ${alignMain}`}>
            <BookOpen className="w-5 h-5 shrink-0" />
            <span>{txt('ملف أكاديمي', 'Academic Profile')}</span>
          </h2>
          <div className="grid grid-cols-1 gap-3">
            {instructor?.research_interests &&
              renderField(txt('الاهتمامات البحثية', 'Research Interests'), instructor.research_interests, {
                valueClassName: 'font-normal whitespace-pre-wrap'
              })}
            {instructor?.bio && !isArabicLayout &&
              renderField(txt('السيرة الذاتية (إنجليزي)', 'Biography (English)'), instructor.bio, {
                dir: 'ltr',
                valueClassName: 'font-normal whitespace-pre-wrap'
              })}
            {instructor?.bio_ar &&
              renderField(txt('السيرة الذاتية (عربي)', 'Biography (Arabic)'), instructor.bio_ar, {
                valueClassName: 'font-normal whitespace-pre-wrap'
              })}
          </div>
        </section>
      )}

      {(Array.isArray(instructor?.publications) && instructor.publications.length > 0) && (
        <section className={`bg-white rounded-2xl shadow-sm border border-gray-200 p-6 ${alignMain}`} dir={isArabicLayout ? 'rtl' : 'ltr'}>
          <h2 className={`text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2 ${isArabicLayout ? 'flex-row-reverse justify-start' : ''} ${alignMain}`}>
            <FileText className="w-5 h-5 shrink-0" />
            <span>{txt('المنشورات', 'Publications')}</span>
          </h2>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {instructor.publications.map((pub, index) => (
              <div
                key={index}
                className={`${fieldCardShell} ${isArabicLayout ? 'border-e-4 border-e-primary-500' : 'border-s-4 border-s-primary-500'}`}
              >
                <p className="text-sm break-all text-gray-900">{typeof pub === 'string' ? pub : JSON.stringify(pub)}</p>
              </div>
            ))}
          </div>
        </section>
      )}

      {(Array.isArray(instructor?.certifications) && instructor.certifications.length > 0) && (
        <section className={`bg-white rounded-2xl shadow-sm border border-gray-200 p-6 ${alignMain}`} dir={isArabicLayout ? 'rtl' : 'ltr'}>
          <h2 className={`text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2 ${isArabicLayout ? 'flex-row-reverse justify-start' : ''} ${alignMain}`}>
            <Award className="w-5 h-5 shrink-0" />
            <span>{txt('الشهادات المهنية', 'Certifications')}</span>
          </h2>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {instructor.certifications.map((cert, index) => (
              <div
                key={index}
                className={`${fieldCardShell} ${isArabicLayout ? 'border-e-4 border-e-primary-500' : 'border-s-4 border-s-primary-500'}`}
              >
                <p className="text-sm break-all text-gray-900">{typeof cert === 'string' ? cert : JSON.stringify(cert)}</p>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  )
}
