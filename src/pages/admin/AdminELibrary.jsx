import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { supabase } from '../../lib/supabase'
import { useLanguage } from '../../contexts/LanguageContext'
import { PageHeader, Panel } from '../../components/ui'
import { fieldClass } from '../../components/academic/catalogUi'

const UI = {
  bdr: '#dde3ef',
  p: '#1a3a6b',
  bg: '#f4f6fb',
  muted: '#6b7a99',
}

function pickLocalized(isArabic, ar, en) {
  return (isArabic ? ar : en) || en || ar || '—'
}

export default function AdminELibrary() {
  const { t } = useTranslation()
  const { language, isRTL } = useLanguage()
  const isArabic = language === 'ar'

  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [majors, setMajors] = useState([])
  const [selectedMajorId, setSelectedMajorId] = useState('')
  const [items, setItems] = useState([])

  const [showModal, setShowModal] = useState(false)
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState({
    id: null,
    title_en: '',
    title_ar: '',
    author_en: '',
    author_ar: '',
    tags: '',
    kind: 'book',
    url: '',
    cover_emoji: '📘',
    is_active: true,
  })

  useEffect(() => {
    let cancelled = false
    async function loadMajors() {
      setLoading(true)
      setError('')
      try {
        const { data, error: mErr } = await supabase
          .from('majors')
          .select('id, code, name_en, name_ar, is_university_wide, college_id')
          .order('name_en', { ascending: true })
        if (mErr) throw mErr
        if (cancelled) return
        setMajors(data || [])
      } catch (e) {
        if (!cancelled) setError(e?.message || 'Failed to load majors')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    loadMajors()
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    let cancelled = false
    async function loadItems() {
      if (!selectedMajorId) {
        setItems([])
        return
      }
      setError('')
      try {
        const { data, error: itErr } = await supabase
          .from('elibrary_items')
          .select('id, major_id, title_en, title_ar, author_en, author_ar, tags, kind, url, cover_emoji, is_active, created_at')
          .eq('major_id', Number(selectedMajorId))
          .order('created_at', { ascending: false })
        if (itErr) throw itErr
        if (!cancelled) setItems(data || [])
      } catch (e) {
        if (!cancelled) setError(e?.message || 'Failed to load e‑Library items')
      }
    }
    loadItems()
    return () => {
      cancelled = true
    }
  }, [selectedMajorId])

  const selectedMajorName = useMemo(() => {
    const m = majors.find((x) => String(x.id) === String(selectedMajorId))
    return m ? `${pickLocalized(isArabic, m.name_ar, m.name_en)}${m.code ? ` (${m.code})` : ''}` : '—'
  }, [majors, selectedMajorId, isArabic])

  const openCreate = () => {
    setForm({
      id: null,
      title_en: '',
      title_ar: '',
      author_en: '',
      author_ar: '',
      tags: '',
      kind: 'book',
      url: '',
      cover_emoji: '📘',
      is_active: true,
    })
    setShowModal(true)
  }

  const openEdit = (row) => {
    setForm({
      id: row.id,
      title_en: row.title_en || '',
      title_ar: row.title_ar || '',
      author_en: row.author_en || '',
      author_ar: row.author_ar || '',
      tags: Array.isArray(row.tags) ? row.tags.join(', ') : '',
      kind: row.kind || 'book',
      url: row.url || '',
      cover_emoji: row.cover_emoji || '📘',
      is_active: row.is_active !== false,
    })
    setShowModal(true)
  }

  const handleSave = async () => {
    if (!selectedMajorId) return
    const titleEn = String(form.title_en || '').trim()
    if (!titleEn) {
      setError('Title (EN) is required')
      return
    }
    setSaving(true)
    setError('')
    try {
      const payload = {
        major_id: Number(selectedMajorId),
        title_en: titleEn,
        title_ar: String(form.title_ar || '').trim() || null,
        author_en: String(form.author_en || '').trim() || null,
        author_ar: String(form.author_ar || '').trim() || null,
        tags: String(form.tags || '')
          .split(',')
          .map((x) => x.trim())
          .filter(Boolean),
        kind: form.kind,
        url: String(form.url || '').trim() || null,
        cover_emoji: String(form.cover_emoji || '').trim() || null,
        is_active: !!form.is_active,
      }

      if (form.id) {
        const { error: upErr } = await supabase.from('elibrary_items').update(payload).eq('id', form.id)
        if (upErr) throw upErr
      } else {
        const { error: insErr } = await supabase.from('elibrary_items').insert(payload)
        if (insErr) throw insErr
      }

      const { data, error: itErr } = await supabase
        .from('elibrary_items')
        .select('id, major_id, title_en, title_ar, author_en, author_ar, tags, kind, url, cover_emoji, is_active, created_at')
        .eq('major_id', Number(selectedMajorId))
        .order('created_at', { ascending: false })
      if (itErr) throw itErr
      setItems(data || [])
      setShowModal(false)
    } catch (e) {
      setError(e?.message || 'Failed to save')
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (row) => {
    if (!row?.id) return
    if (!confirm('Delete this item?')) return
    setError('')
    try {
      const { error: delErr } = await supabase.from('elibrary_items').delete().eq('id', row.id)
      if (delErr) throw delErr
      setItems((prev) => prev.filter((x) => x.id !== row.id))
    } catch (e) {
      setError(e?.message || 'Failed to delete')
    }
  }

  return (
    <div className={`space-y-6 ${isRTL ? 'text-right' : 'text-left'}`} dir={isArabic ? 'rtl' : 'ltr'}>
      <PageHeader
        title={t('admin.elibrary.title', 'e‑Library content')}
        subtitle={t('admin.elibrary.subtitle', 'Add and manage library resources per major.')}
      />

      {error && <div className="rounded-xl border border-red-200 bg-red-50 text-red-800 px-4 py-3 text-sm">{error}</div>}

      <Panel>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-end">
          <div className="md:col-span-2">
            <label className="block text-sm font-extrabold mb-2" style={{ color: UI.p }}>
              {t('admin.elibrary.pickMajor', 'Major')}
            </label>
            <select
              value={selectedMajorId}
              onChange={(e) => setSelectedMajorId(e.target.value)}
              className={fieldClass}
              disabled={loading}
            >
              <option value="">{t('admin.elibrary.chooseMajor', 'Choose a major…')}</option>
              {majors.map((m) => (
                <option key={m.id} value={m.id}>
                  {pickLocalized(isArabic, m.name_ar, m.name_en)}{m.code ? ` — ${m.code}` : ''}
                </option>
              ))}
            </select>
          </div>
          <button
            type="button"
            onClick={openCreate}
            disabled={!selectedMajorId}
            className="inline-flex h-10 items-center justify-center rounded-xl bg-[#1a3a6b] px-4 text-sm font-bold text-white disabled:opacity-50"
          >
            {t('admin.elibrary.addItem', 'Add item')}
          </button>
        </div>
        {selectedMajorId && (
          <div className="mt-3 text-xs" style={{ color: UI.muted }}>
            {t('admin.elibrary.selectedMajor', 'Selected major')}: <span className="font-bold">{selectedMajorName}</span>
          </div>
        )}
      </Panel>

      {selectedMajorId && (
        <div className="bg-white rounded-xl border shadow-sm overflow-hidden" style={{ borderColor: UI.bdr }}>
          <div className="px-5 py-4 border-b flex items-center justify-between" style={{ borderColor: UI.bdr }}>
            <div className="font-extrabold" style={{ color: UI.p }}>
              {t('admin.elibrary.items', 'Items')}
            </div>
            <div className="text-xs" style={{ color: UI.muted }}>{items.length} {t('admin.elibrary.count', 'items')}</div>
          </div>
          {items.length === 0 ? (
            <div className="p-6 text-sm" style={{ color: UI.muted }}>
              {t('admin.elibrary.empty', 'No items yet for this major.')}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-[#f4f6fb]" style={{ color: UI.p }}>
                    <th className="text-start p-3">{t('admin.elibrary.colTitle', 'Title')}</th>
                    <th className="text-start p-3">{t('admin.elibrary.colKind', 'Kind')}</th>
                    <th className="text-start p-3">{t('admin.elibrary.colActive', 'Active')}</th>
                    <th className="text-start p-3">{t('admin.elibrary.colActions', 'Actions')}</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((row) => (
                    <tr key={row.id} className="border-t" style={{ borderColor: UI.bdr }}>
                      <td className="p-3">
                        <div className="font-extrabold text-slate-900">
                          {(row.cover_emoji || '📘')}{' '}
                          {pickLocalized(isArabic, row.title_ar, row.title_en)}
                        </div>
                        <div className="text-xs" style={{ color: UI.muted }}>
                          {pickLocalized(isArabic, row.author_ar, row.author_en)}
                        </div>
                      </td>
                      <td className="p-3">{row.kind}</td>
                      <td className="p-3">{row.is_active ? '✅' : '—'}</td>
                      <td className="p-3">
                        <div className="flex gap-2 flex-wrap">
                          <button type="button" onClick={() => openEdit(row)} className="px-3 py-1.5 rounded-md border font-bold" style={{ borderColor: UI.bdr, backgroundColor: UI.bg }}>
                            {t('common.edit', 'Edit')}
                          </button>
                          <button type="button" onClick={() => handleDelete(row)} className="px-3 py-1.5 rounded-md border font-bold text-red-700" style={{ borderColor: '#fecaca', backgroundColor: '#fff1f2' }}>
                            {t('common.delete', 'Delete')}
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {showModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl shadow-xl max-w-lg w-full p-6">
            <div className="flex items-start justify-between gap-3 mb-4">
              <div>
                <div className="text-lg font-extrabold" style={{ color: UI.p }}>
                  {form.id ? t('admin.elibrary.editItem', 'Edit item') : t('admin.elibrary.addItem', 'Add item')}
                </div>
                <div className="text-xs" style={{ color: UI.muted }}>{selectedMajorName}</div>
              </div>
              <button type="button" onClick={() => setShowModal(false)} className="p-2 rounded-lg hover:bg-slate-100">✕</button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="sm:col-span-2">
                <label className="block text-sm font-bold mb-1">{t('admin.elibrary.titleEn', 'Title (EN)')}</label>
                <input className="w-full px-3 py-2 rounded-lg border" style={{ borderColor: UI.bdr }} value={form.title_en} onChange={(e) => setForm((p) => ({ ...p, title_en: e.target.value }))} />
              </div>
              <div className="sm:col-span-2">
                <label className="block text-sm font-bold mb-1">{t('admin.elibrary.titleAr', 'Title (AR)')}</label>
                <input className="w-full px-3 py-2 rounded-lg border" style={{ borderColor: UI.bdr }} value={form.title_ar} onChange={(e) => setForm((p) => ({ ...p, title_ar: e.target.value }))} />
              </div>
              <div>
                <label className="block text-sm font-bold mb-1">{t('admin.elibrary.authorEn', 'Author (EN)')}</label>
                <input className="w-full px-3 py-2 rounded-lg border" style={{ borderColor: UI.bdr }} value={form.author_en} onChange={(e) => setForm((p) => ({ ...p, author_en: e.target.value }))} />
              </div>
              <div>
                <label className="block text-sm font-bold mb-1">{t('admin.elibrary.authorAr', 'Author (AR)')}</label>
                <input className="w-full px-3 py-2 rounded-lg border" style={{ borderColor: UI.bdr }} value={form.author_ar} onChange={(e) => setForm((p) => ({ ...p, author_ar: e.target.value }))} />
              </div>
              <div className="sm:col-span-2">
                <label className="block text-sm font-bold mb-1">{t('admin.elibrary.url', 'URL')}</label>
                <input className="w-full px-3 py-2 rounded-lg border" style={{ borderColor: UI.bdr }} value={form.url} onChange={(e) => setForm((p) => ({ ...p, url: e.target.value }))} placeholder="https://…" />
              </div>
              <div className="sm:col-span-2">
                <label className="block text-sm font-bold mb-1">{t('admin.elibrary.tags', 'Tags (comma separated)')}</label>
                <input className="w-full px-3 py-2 rounded-lg border" style={{ borderColor: UI.bdr }} value={form.tags} onChange={(e) => setForm((p) => ({ ...p, tags: e.target.value }))} placeholder="CS201, Algorithms" />
              </div>
              <div>
                <label className="block text-sm font-bold mb-1">{t('admin.elibrary.kind', 'Kind')}</label>
                <select className="w-full px-3 py-2 rounded-lg border" style={{ borderColor: UI.bdr }} value={form.kind} onChange={(e) => setForm((p) => ({ ...p, kind: e.target.value }))}>
                  <option value="book">{t('admin.elibrary.kindBook', 'Book')}</option>
                  <option value="article">{t('admin.elibrary.kindArticle', 'Article')}</option>
                  <option value="audio">{t('admin.elibrary.kindAudio', 'Audio')}</option>
                  <option value="link">{t('admin.elibrary.kindLink', 'Link')}</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-bold mb-1">{t('admin.elibrary.coverEmoji', 'Cover emoji')}</label>
                <input className="w-full px-3 py-2 rounded-lg border" style={{ borderColor: UI.bdr }} value={form.cover_emoji} onChange={(e) => setForm((p) => ({ ...p, cover_emoji: e.target.value }))} />
              </div>
              <div className="sm:col-span-2 flex items-center gap-2">
                <input id="elib_active" type="checkbox" checked={!!form.is_active} onChange={(e) => setForm((p) => ({ ...p, is_active: e.target.checked }))} />
                <label htmlFor="elib_active" className="text-sm font-bold">{t('admin.elibrary.active', 'Active')}</label>
              </div>
            </div>

            <div className="mt-6 flex items-center justify-end gap-2">
              <button type="button" onClick={() => setShowModal(false)} className="px-4 py-2 rounded-lg border font-bold" style={{ borderColor: UI.bdr, backgroundColor: UI.bg }}>
                {t('common.cancel', 'Cancel')}
              </button>
              <button type="button" onClick={handleSave} disabled={saving} className="px-4 py-2 rounded-lg font-extrabold text-white disabled:opacity-60" style={{ backgroundColor: UI.p }}>
                {saving ? t('common.saving', 'Saving…') : t('common.save', 'Save')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

