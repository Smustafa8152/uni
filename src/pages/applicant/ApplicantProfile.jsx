import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useLanguage } from '../../contexts/LanguageContext'
import { useAuth } from '../../contexts/AuthContext'
import { supabase, SUPABASE_STORAGE_BUCKET } from '../../lib/supabase'
import { syncApplicantProfile } from '../../utils/syncApplicantProfile'
import { Loader2, Save, Camera } from 'lucide-react'

const emptyForm = {
  first_name: '',
  father_name: '',
  grandfather_name: '',
  last_name: '',
  national_id: '',
  date_of_birth: '',
  gender: '',
  nationality: '',
  phone: '',
  address: '',
}

export default function ApplicantProfile() {
  const { t } = useTranslation()
  const { isRTL } = useLanguage()
  const { user, refreshUserRole } = useAuth()
  const [internalUserId, setInternalUserId] = useState(null)
  const [form, setForm] = useState(emptyForm)
  const [photoPath, setPhotoPath] = useState('')
  const [photoPreview, setPhotoPreview] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [feedback, setFeedback] = useState(null)
  const [newPassword, setNewPassword] = useState('')
  const [newPassword2, setNewPassword2] = useState('')
  const [passwordBusy, setPasswordBusy] = useState(false)

  const load = useCallback(async () => {
    if (!user?.id) {
      setLoading(false)
      return
    }
    setLoading(true)
    setFeedback(null)
    try {
      let { data: urow, error: uErr } = await supabase
        .from('users')
        .select('id, role')
        .eq('openId', user.id)
        .maybeSingle()
      if (uErr) throw uErr
      if (!urow?.id) {
        await syncApplicantProfile({ name: user.email?.split('@')[0] || '' })
        const r2 = await supabase.from('users').select('id, role').eq('openId', user.id).maybeSingle()
        urow = r2.data
        if (r2.error) throw r2.error
      }
      if (!urow?.id || urow.role !== 'applicant') {
        setInternalUserId(null)
        setLoading(false)
        return
      }
      setInternalUserId(urow.id)

      const { data: prof, error: pErr } = await supabase
        .from('applicant_profiles')
        .select('*')
        .eq('user_id', urow.id)
        .maybeSingle()
      if (pErr) throw pErr

      if (prof) {
        setForm({
          first_name: prof.first_name ?? '',
          father_name: prof.father_name ?? '',
          grandfather_name: prof.grandfather_name ?? '',
          last_name: prof.last_name ?? '',
          national_id: prof.national_id ?? '',
          date_of_birth: prof.date_of_birth ? String(prof.date_of_birth).slice(0, 10) : '',
          gender: prof.gender ?? '',
          nationality: prof.nationality ?? '',
          phone: prof.phone ?? '',
          address: prof.address ?? '',
        })
        setPhotoPath(prof.photo_path || '')
        if (prof.photo_path) {
          const { data: pub } = supabase.storage.from(SUPABASE_STORAGE_BUCKET).getPublicUrl(prof.photo_path)
          setPhotoPreview(pub?.publicUrl || '')
        } else {
          setPhotoPreview('')
        }
      } else {
        setForm(emptyForm)
        setPhotoPath('')
        setPhotoPreview('')
      }
    } catch (e) {
      setFeedback({ kind: 'error', text: e.message || t('applicantProfile.loadFailed') })
    } finally {
      setLoading(false)
    }
  }, [user?.id, t])

  useEffect(() => {
    load()
  }, [load])

  const setField = (key, value) => {
    setForm((prev) => ({ ...prev, [key]: value }))
  }

  const handleSave = async (e) => {
    e.preventDefault()
    if (!internalUserId) {
      setFeedback({ kind: 'error', text: t('applicantProfile.noApplicantRow') })
      return
    }
    if (!form.first_name?.trim() || !form.father_name?.trim() || !form.last_name?.trim()) {
      setFeedback({ kind: 'error', text: t('applicantProfile.requiredNames') })
      return
    }
    if (!form.national_id?.trim() || !form.date_of_birth) {
      setFeedback({ kind: 'error', text: t('applicantProfile.requiredIdDob') })
      return
    }
    if (!form.phone?.trim()) {
      setFeedback({ kind: 'error', text: t('applicantProfile.requiredPhone') })
      return
    }

    setSaving(true)
    setFeedback(null)
    try {
      const row = {
        user_id: internalUserId,
        first_name: form.first_name.trim(),
        father_name: form.father_name.trim(),
        grandfather_name: form.grandfather_name.trim() || null,
        last_name: form.last_name.trim(),
        national_id: form.national_id.trim(),
        date_of_birth: form.date_of_birth,
        gender: form.gender || null,
        nationality: form.nationality.trim() || null,
        phone: form.phone.trim(),
        address: form.address.trim() || null,
        photo_path: photoPath || null,
      }
      const { error: upErr } = await supabase.from('applicant_profiles').upsert(row, { onConflict: 'user_id' })
      if (upErr) throw upErr

      const displayName = [form.first_name, form.father_name, form.grandfather_name, form.last_name]
        .map((s) => (s || '').trim())
        .filter(Boolean)
        .join(' ')
      await supabase.from('users').update({ name: displayName }).eq('id', internalUserId).eq('openId', user.id)
      await refreshUserRole()
      setFeedback({ kind: 'ok', text: t('applicantProfile.saveSuccess') })
    } catch (err) {
      setFeedback({ kind: 'error', text: err.message || t('applicantProfile.saveFailed') })
    } finally {
      setSaving(false)
    }
  }

  const handlePhoto = async (e) => {
    const file = e.target.files?.[0]
    if (!file || !user?.id || !internalUserId) return
    if (!file.type.startsWith('image/')) {
      setFeedback({ kind: 'error', text: t('applicantProfile.photoInvalid') })
      return
    }
    if (file.size > 2 * 1024 * 1024) {
      setFeedback({ kind: 'error', text: t('applicantProfile.photoTooLarge') })
      return
    }
    const { data: existing } = await supabase.from('applicant_profiles').select('user_id').eq('user_id', internalUserId).maybeSingle()
    if (!existing) {
      setFeedback({ kind: 'error', text: t('applicantProfile.saveProfileBeforePhoto') })
      e.target.value = ''
      return
    }
    const ext = (file.name.split('.').pop() || 'jpg').toLowerCase().replace(/[^a-z0-9]/g, '') || 'jpg'
    const path = `applicant-profiles/${user.id}/avatar.${ext}`
    setSaving(true)
    setFeedback(null)
    try {
      const { error: upErr } = await supabase.storage.from(SUPABASE_STORAGE_BUCKET).upload(path, file, {
        upsert: true,
        contentType: file.type,
      })
      if (upErr) throw upErr
      setPhotoPath(path)
      const { data: pub } = supabase.storage.from(SUPABASE_STORAGE_BUCKET).getPublicUrl(path)
      setPhotoPreview(pub?.publicUrl || '')
      const { error: pErr } = await supabase.from('applicant_profiles').update({ photo_path: path }).eq('user_id', internalUserId)
      if (pErr) throw pErr
      setFeedback({ kind: 'ok', text: t('applicantProfile.photoSaved') })
    } catch (err) {
      setFeedback({ kind: 'error', text: err.message || t('applicantProfile.photoUploadFailed') })
    } finally {
      setSaving(false)
      e.target.value = ''
    }
  }

  const handleChangePassword = async () => {
    if (!newPassword || newPassword.length < 8) {
      setFeedback({ kind: 'error', text: t('applicantProfile.passwordShort') })
      return
    }
    if (newPassword !== newPassword2) {
      setFeedback({ kind: 'error', text: t('applicantProfile.passwordMismatch') })
      return
    }
    setPasswordBusy(true)
    setFeedback(null)
    try {
      const { error } = await supabase.auth.updateUser({ password: newPassword })
      if (error) throw error
      setNewPassword('')
      setNewPassword2('')
      setFeedback({ kind: 'ok', text: t('applicantProfile.passwordChanged') })
    } catch (err) {
      setFeedback({ kind: 'error', text: err.message || t('applicantProfile.passwordFailed') })
    } finally {
      setPasswordBusy(false)
    }
  }

  if (loading) {
    return (
      <div className="flex justify-center py-20" dir={isRTL ? 'rtl' : 'ltr'}>
        <Loader2 className="w-10 h-10 text-[#1a3a6b] animate-spin" />
      </div>
    )
  }

  if (!internalUserId) {
    return (
      <div className="max-w-xl mx-auto rounded-xl border border-amber-200 bg-amber-50 text-amber-900 px-4 py-3 text-sm" dir={isRTL ? 'rtl' : 'ltr'}>
        {t('applicantProfile.noApplicantRow')}
      </div>
    )
  }

  const inputCls =
    'w-full rounded-md border border-[#dde3ef] px-3.5 py-2.5 text-sm text-[#1e2a3a] bg-white focus:ring-2 focus:ring-[#2a5298] focus:border-transparent outline-none'
  const labelCls = 'block text-sm font-semibold text-[#1e2a3a] mb-1.5'
  const cardCls = 'rounded-[10px] border border-[#dde3ef] bg-white shadow-sm p-5 md:p-6 mb-6'
  const cardHdCls = 'flex items-center justify-between border-b border-[#dde3ef] pb-3.5 mb-5'
  const cardTitleCls = 'text-base font-bold text-[#1a3a6b]'

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
        <span className="text-[#1a3a6b] font-semibold">{t('applicantProfile.breadcrumb')}</span>
      </nav>

      <div className={`flex flex-col lg:flex-row lg:items-start lg:justify-between gap-4 mb-6 ${isRTL ? 'lg:flex-row-reverse' : ''}`}>
        <div>
          <h2 className="text-2xl md:text-3xl font-extrabold text-[#1a3a6b] mb-1">{t('applicantProfile.title')}</h2>
          <p className="text-sm text-[#6b7a99]">{t('applicantProfile.subtitle')}</p>
        </div>
        <button
          type="submit"
          form="applicant-profile-form"
          disabled={saving}
          className="inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-md bg-[#1a3a6b] text-white text-sm font-bold shadow hover:bg-[#2a5298] disabled:opacity-50 shrink-0"
        >
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
          {t('applicantProfile.save')}
        </button>
      </div>

      {feedback?.kind === 'ok' && (
        <div className="rounded-md border border-[#1a7a4a] bg-[#e6f7ef] text-[#1a7a4a] px-4 py-3 text-sm mb-5 border-s-4 border-s-[#1a7a4a]">
          {feedback.text}
        </div>
      )}
      {feedback?.kind === 'error' && (
        <div className="rounded-md border border-[#b91c1c] bg-[#fee2e2] text-[#b91c1c] px-4 py-3 text-sm mb-5 border-s-4 border-s-[#b91c1c]">
          {feedback.text}
        </div>
      )}

      <form id="applicant-profile-form" onSubmit={handleSave}>
        <div className="grid grid-cols-1 lg:grid-cols-[2fr_1fr] gap-6">
          <div className="min-w-0">
            <div className={cardCls}>
              <div className={cardHdCls}>
                <div className={cardTitleCls}>{t('applicantProfile.cardPersonal')}</div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className={labelCls}>
                    {t('applicantProfile.firstName')} <span className="text-[#b91c1c]">*</span>
                  </label>
                  <input className={inputCls} value={form.first_name} onChange={(e) => setField('first_name', e.target.value)} required />
                </div>
                <div>
                  <label className={labelCls}>
                    {t('applicantProfile.fatherName')} <span className="text-[#b91c1c]">*</span>
                  </label>
                  <input className={inputCls} value={form.father_name} onChange={(e) => setField('father_name', e.target.value)} required />
                </div>
                <div>
                  <label className={labelCls}>{t('applicantProfile.grandfatherName')}</label>
                  <input className={inputCls} value={form.grandfather_name} onChange={(e) => setField('grandfather_name', e.target.value)} />
                </div>
                <div>
                  <label className={labelCls}>
                    {t('applicantProfile.lastName')} <span className="text-[#b91c1c]">*</span>
                  </label>
                  <input className={inputCls} value={form.last_name} onChange={(e) => setField('last_name', e.target.value)} required />
                </div>
                <div>
                  <label className={labelCls}>
                    {t('applicantProfile.nationalId')} <span className="text-[#b91c1c]">*</span>
                  </label>
                  <input className={inputCls} value={form.national_id} onChange={(e) => setField('national_id', e.target.value)} required />
                </div>
                <div>
                  <label className={labelCls}>
                    {t('applicantProfile.dob')} <span className="text-[#b91c1c]">*</span>
                  </label>
                  <input className={inputCls} type="date" value={form.date_of_birth} onChange={(e) => setField('date_of_birth', e.target.value)} required />
                </div>
                <div>
                  <label className={labelCls}>{t('applicantProfile.gender')}</label>
                  <select className={inputCls} value={form.gender} onChange={(e) => setField('gender', e.target.value)}>
                    <option value="">{t('applicantProfile.genderPlaceholder')}</option>
                    <option value="male">{t('applicantProfile.genderMale')}</option>
                    <option value="female">{t('applicantProfile.genderFemale')}</option>
                  </select>
                </div>
                <div>
                  <label className={labelCls}>{t('applicantProfile.nationality')}</label>
                  <input className={inputCls} value={form.nationality} onChange={(e) => setField('nationality', e.target.value)} placeholder={t('applicantProfile.nationalityPlaceholder')} />
                </div>
              </div>
            </div>

            <div className={cardCls}>
              <div className={cardHdCls}>
                <div className={cardTitleCls}>{t('applicantProfile.cardContact')}</div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="sm:col-span-2">
                  <label className={labelCls}>{t('applicantProfile.email')}</label>
                  <input className={`${inputCls} bg-[#f4f6fb] text-[#6b7a99]`} type="email" value={user?.email || ''} readOnly />
                  <p className="text-xs text-[#6b7a99] mt-1">{t('applicantProfile.emailReadOnly')}</p>
                </div>
                <div>
                  <label className={labelCls}>
                    {t('applicantProfile.phone')} <span className="text-[#b91c1c]">*</span>
                  </label>
                  <input className={inputCls} type="tel" value={form.phone} onChange={(e) => setField('phone', e.target.value)} required />
                </div>
                <div className="sm:col-span-2">
                  <label className={labelCls}>{t('applicantProfile.address')}</label>
                  <input className={inputCls} value={form.address} onChange={(e) => setField('address', e.target.value)} />
                </div>
              </div>
            </div>
          </div>

          <div className="min-w-0">
            <div className={cardCls}>
              <div className={cardHdCls}>
                <div className={cardTitleCls}>{t('applicantProfile.cardPhoto')}</div>
              </div>
              {photoPreview ? (
                <img src={photoPreview} alt="" className="w-32 h-32 rounded-lg object-cover border border-[#dde3ef] mb-3" />
              ) : null}
              <label className="flex flex-col items-center justify-center rounded-[10px] border-2 border-dashed border-[#dde3ef] bg-[#f4f6fb] px-4 py-8 text-center cursor-pointer hover:border-[#2a5298] hover:bg-[#f0f4fb] transition-colors">
                <Camera className="w-9 h-9 text-[#6b7a99] mb-2" />
                <span className="text-sm font-semibold text-[#1e2a3a]">{t('applicantProfile.uploadPhoto')}</span>
                <span className="text-xs text-[#6b7a99] mt-1">{t('applicantProfile.uploadHint')}</span>
                <input type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={handlePhoto} disabled={saving} />
              </label>
            </div>

            <div className={cardCls}>
              <div className={cardHdCls}>
                <div className={cardTitleCls}>{t('applicantProfile.cardSecurity')}</div>
              </div>
              <div className="space-y-4">
                <div>
                  <label className={labelCls}>{t('applicantProfile.newPassword')}</label>
                  <input
                    className={inputCls}
                    type="password"
                    autoComplete="new-password"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    placeholder="••••••••"
                  />
                </div>
                <div>
                  <label className={labelCls}>{t('applicantProfile.newPasswordAgain')}</label>
                  <input
                    className={inputCls}
                    type="password"
                    autoComplete="new-password"
                    value={newPassword2}
                    onChange={(e) => setNewPassword2(e.target.value)}
                    placeholder="••••••••"
                  />
                </div>
                <button
                  type="button"
                  onClick={handleChangePassword}
                  disabled={passwordBusy}
                  className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-md border border-[#dde3ef] bg-[#f4f6fb] text-sm font-semibold text-[#1e2a3a] hover:bg-[#dde3ef] disabled:opacity-50"
                >
                  {passwordBusy ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                  {t('applicantProfile.changePassword')}
                </button>
              </div>
            </div>
          </div>
        </div>
      </form>
    </div>
  )
}
