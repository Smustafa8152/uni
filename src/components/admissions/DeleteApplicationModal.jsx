import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { getPersonName } from '../../utils/localizedName'
import { supabase } from '../../lib/supabase'
import { Button } from '../ui'

export default function DeleteApplicationModal({ application, isArabic, open, onClose, onDeleted }) {
  const { t } = useTranslation()
  const [preview, setPreview] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!open || !application?.id) return
    let cancelled = false
    setPreview(null)
    setError('')
    setLoading(true)
    ;(async () => {
      try {
        const { data, error: rpcError } = await supabase.rpc('preview_application_delete', {
          p_application_id: application.id,
        })
        if (rpcError) throw rpcError
        if (!cancelled) setPreview(data)
      } catch (err) {
        if (!cancelled) setError(err.message || t('admissions.applicationsPage.deleteFailed'))
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [open, application?.id, t])

  if (!open || !application) return null

  const person = preview || application
  const displayName = getPersonName(person, isArabic) || application.email || `#${application.id}`
  const counts = [
    { key: 'documents', label: t('admissions.applicationsPage.deleteDocuments') },
    { key: 'messages', label: t('admissions.applicationsPage.deleteMessages') },
    { key: 'document_requests', label: t('admissions.applicationsPage.deleteDocRequests') },
    { key: 'applicant_requests', label: t('admissions.applicationsPage.deleteApplicantRequests') },
    { key: 'application_fee_payments', label: t('admissions.applicationsPage.deleteAppFeePayments') },
    { key: 'registration_fee_payments', label: t('admissions.applicationsPage.deleteRegFeePayments') },
    { key: 'bank_transfers', label: t('admissions.applicationsPage.deleteBankTransfers') },
    { key: 'invoices', label: t('admissions.applicationsPage.deleteInvoices') },
  ]
  const linked = preview
    ? counts.filter((row) => Number(preview[row.key] || 0) > 0)
    : []

  const confirmDelete = async () => {
    setLoading(true)
    setError('')
    try {
      const { error: rpcError } = await supabase.rpc('delete_application', {
        p_application_id: application.id,
      })
      if (rpcError) throw rpcError
      onDeleted?.(application.id)
      onClose?.()
    } catch (err) {
      setError(err.message || t('admissions.applicationsPage.deleteFailed'))
    } finally {
      setLoading(false)
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/40 p-4 sm:items-center"
      onClick={() => !loading && onClose?.()}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="delete-application-title"
        className="max-h-[85vh] w-full max-w-lg overflow-y-auto rounded-2xl bg-white p-5 text-start shadow-2xl"
        onClick={(event) => event.stopPropagation()}
      >
        <h2 id="delete-application-title" className="text-lg font-bold text-gray-900">
          {t('admissions.applicationsPage.deleteTitle')}
        </h2>
        <p className="mt-1 text-sm font-semibold text-gray-800">
          {displayName}
          {application.application_number ? (
            <span className="ms-2 font-mono text-xs text-gray-500" dir="ltr">
              {application.application_number}
            </span>
          ) : null}
        </p>
        <p className="mt-2 text-sm leading-6 text-gray-600">
          {t('admissions.applicationsPage.deleteIntro')}
        </p>

        {loading && !preview ? (
          <p className="mt-4 text-sm text-gray-500">{t('common.loading')}</p>
        ) : null}

        {preview && linked.length === 0 ? (
          <p className="mt-4 rounded-xl bg-gray-50 px-3 py-3 text-sm text-gray-600">
            {t('admissions.applicationsPage.deleteNone')}
          </p>
        ) : null}

        {linked.length > 0 ? (
          <ul className="mt-4 space-y-1 text-sm text-gray-700">
            {linked.map((row) => (
              <li key={row.key} className="rounded-lg bg-gray-50 px-3 py-2">
                {row.label}: <span className="font-semibold">{preview[row.key]}</span>
              </li>
            ))}
          </ul>
        ) : null}

        {error ? (
          <p className="mt-4 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            {error}
          </p>
        ) : null}

        <div className="mt-5 flex flex-wrap justify-end gap-2">
          <Button variant="quiet" onClick={onClose} disabled={loading}>
            {t('common.cancel')}
          </Button>
          <Button variant="danger" onClick={confirmDelete} loading={loading} disabled={loading}>
            {t('admissions.applicationsPage.deleteConfirm')}
          </Button>
        </div>
      </div>
    </div>
  )
}
