import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { supabase } from '../../lib/supabase'
import { getLocalizedName } from '../../utils/localizedName'

function flattenTree(nodes, depth = 0, out = []) {
  for (const n of nodes) {
    out.push({ ...n, depth })
    if (n.children?.length) flattenTree(n.children, depth + 1, out)
  }
  return out
}

export function buildCategoryTree(flat) {
  const map = new Map()
  ;(flat || []).forEach((c) => map.set(c.id, { ...c, children: [] }))
  const roots = []
  map.forEach((node) => {
    if (node.parent_id && map.has(node.parent_id)) {
      map.get(node.parent_id).children.push(node)
    } else {
      roots.push(node)
    }
  })
  return roots
}

export default function QuestionBankCategoryPanel({
  subjectId,
  tree,
  selectedCategoryId,
  onSelect,
  onReload,
  questionCounts,
  isArabic,
  platformUserId,
}) {
  const { t } = useTranslation()
  const [name, setName] = useState('')
  const [parentId, setParentId] = useState('')
  const flat = useMemo(() => flattenTree(tree), [tree])

  const createCategory = async () => {
    if (!subjectId || !name.trim()) return
    await supabase.from('subject_question_categories').insert({
      subject_id: subjectId,
      parent_id: parentId ? Number(parentId) : null,
      name_en: name.trim(),
      name_ar: name.trim(),
      created_by: platformUserId,
    })
    setName('')
    setParentId('')
    onReload?.()
  }

  const deleteCategory = async (cat) => {
    const count = questionCounts?.[cat.id] || 0
    if (count > 0) {
      alert(t('instructorPortal.categoryHasQuestions', 'Cannot delete category with questions.'))
      return
    }
    if (!window.confirm(t('instructorPortal.confirmDeleteCategory', 'Delete this category?'))) return
    await supabase.from('subject_question_categories').delete().eq('id', cat.id)
    if (selectedCategoryId === cat.id) onSelect(null)
    onReload?.()
  }

  return (
    <div className="qb-categories card">
      <div className="card-hd">
        <div className="card-title">{t('instructorPortal.categories', 'Categories')}</div>
      </div>
      <div className="qb-cat-list">
        <button
          type="button"
          className={`qb-cat-item${selectedCategoryId == null ? ' active' : ''}`}
          onClick={() => onSelect(null)}
        >
          {t('instructorPortal.allCategories', 'All questions')}
        </button>
        {flat.map((cat) => (
          <div key={cat.id} className="qb-cat-row" style={{ paddingInlineStart: 8 + cat.depth * 14 }}>
            <button
              type="button"
              className={`qb-cat-item${selectedCategoryId === cat.id ? ' active' : ''}`}
              onClick={() => onSelect(cat.id)}
            >
              {getLocalizedName(cat, isArabic)} ({questionCounts?.[cat.id] || 0})
            </button>
            <button type="button" className="btn btn-gh btn-sm" onClick={() => deleteCategory(cat)} title={t('common.delete')}>
              ×
            </button>
          </div>
        ))}
      </div>
      <div className="qb-cat-add" style={{ padding: 12, borderTop: '1px solid var(--bdr)' }}>
        <input className="fc" placeholder={t('instructorPortal.categoryName', 'Category name')} value={name} onChange={(e) => setName(e.target.value)} />
        <select className="fc" style={{ marginTop: 8 }} value={parentId} onChange={(e) => setParentId(e.target.value)}>
          <option value="">{t('instructorPortal.rootCategory', 'Root category')}</option>
          {flat.map((c) => (
            <option key={c.id} value={c.id}>{getLocalizedName(c, isArabic)}</option>
          ))}
        </select>
        <button type="button" className="btn btn-p btn-sm" style={{ marginTop: 8, width: '100%' }} onClick={createCategory}>
          + {t('instructorPortal.createCategory', 'Create category')}
        </button>
      </div>
    </div>
  )
}
