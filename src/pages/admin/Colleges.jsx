import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useLanguage } from '../../contexts/LanguageContext'
import { supabase } from '../../lib/supabase'
import { getLocalizedName } from '../../utils/localizedName'
import { Plus, Building2, Search, MoreVertical, Edit, Trash2, Eye, BarChart3 } from 'lucide-react'

export default function Colleges() {
  const { t } = useTranslation()
  const { isRTL } = useLanguage()
  const [colleges, setColleges] = useState([])
  const [loading, setLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState('')
  const [updatingId, setUpdatingId] = useState(null)
  const [statusError, setStatusError] = useState('')
  const navigate = useNavigate()

  useEffect(() => {
    fetchColleges()
  }, [])

  const fetchColleges = async () => {
    try {
      const { data, error } = await supabase
        .from('colleges')
        .select('*')
        .order('created_at', { ascending: false })

      if (error) throw error
      setColleges(data || [])
    } catch (error) {
      console.error('Error fetching colleges:', error)
    } finally {
      setLoading(false)
    }
  }

  const getStatusLabel = (status) => {
    if (!status) return '-'
    return t(`common.${String(status).toLowerCase()}`, status)
  }

  const toggleCollegeStatus = async (college) => {
    const nextStatus = college.status === 'active' ? 'inactive' : 'active'
    const confirmed = window.confirm(
      nextStatus === 'inactive' ? t('colleges.confirmDeactivate') : t('colleges.confirmActivate')
    )
    if (!confirmed) return

    setUpdatingId(college.id)
    setStatusError('')
    try {
      const { error } = await supabase.from('colleges').update({ status: nextStatus }).eq('id', college.id)
      if (error) throw error
      setColleges((prev) => prev.map((row) => (row.id === college.id ? { ...row, status: nextStatus } : row)))
    } catch (error) {
      console.error('Error updating college status:', error)
      setStatusError(error.message || t('colleges.statusUpdateFailed'))
    } finally {
      setUpdatingId(null)
    }
  }

  return (
    <div className="space-y-6">
      <div className={`flex items-center ${isRTL ? 'flex-row-reverse justify-between' : 'justify-between'}`}>
        <div>
          <h1 className="text-3xl font-bold text-gray-900">{t('colleges.title')}</h1>
          <p className="text-gray-600 mt-1">{t('colleges.subtitle')}</p>
        </div>
        <button
          onClick={() => navigate('/admin/colleges/create')}
          className={`flex items-center ${isRTL ? 'flex-row-reverse space-x-reverse' : 'space-x-2'} bg-primary-gradient text-white px-6 py-3 rounded-xl font-semibold shadow-lg hover:shadow-xl transform hover:-translate-y-0.5 transition-all`}
        >
          <Plus className="w-5 h-5" />
          <span>{t('colleges.create')}</span>
        </button>
      </div>

      <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-6">
        <div className="relative">
          <Search className={`absolute ${isRTL ? 'right-3' : 'left-3'} top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400`} />
          <input
            type="text"
            placeholder={t('colleges.searchPlaceholder')}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className={`w-full ${isRTL ? 'pr-10 pl-4' : 'pl-10 pr-4'} py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-primary-500 focus:border-transparent`}
          />
        </div>
      </div>

      {statusError && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-red-700 text-sm">{statusError}</div>
      )}

      {loading ? (
        <div className="text-center py-12">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600 mx-auto"></div>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {colleges.map((college) => (
            <div
              key={college.id}
              className="bg-white rounded-2xl shadow-sm border border-gray-200 p-6 hover:shadow-md transition-shadow"
            >
              <div className="flex items-start justify-between mb-4">
                <div className={`flex items-center ${isRTL ? 'space-x-reverse space-x-3' : 'space-x-3'}`}>
                  <div
                    className="w-12 h-12 rounded-lg flex items-center justify-center"
                    style={{ backgroundColor: college.primary_color || '#952562' }}
                  >
                    <Building2 className="w-6 h-6 text-white" />
                  </div>
                  <div>
                    <h3 className="text-lg font-bold text-gray-900">{getLocalizedName(college, isRTL) || college.name_en}</h3>
                    <p className="text-sm text-gray-500">{college.code}</p>
                  </div>
                </div>
              </div>

              <div className={`space-y-2 mb-4 ${isRTL ? 'text-right' : 'text-left'}`}>
                <div className={`text-sm text-gray-600 ${isRTL ? 'grid grid-cols-[auto,1fr] items-center gap-x-3' : 'flex items-center justify-start gap-2'}`}>
                  <span className={`font-medium ${isRTL ? 'col-start-1 text-right' : 'w-24'}`}>{t('colleges.email')}:</span>
                  <span
                    className={`truncate inline-block ${isRTL ? 'col-start-2 justify-self-start text-left' : ''}`}
                    dir="ltr"
                    style={{ unicodeBidi: 'isolate' }}
                  >
                    {college.official_email || '-'}
                  </span>
                </div>
                <div className={`text-sm text-gray-600 ${isRTL ? 'grid grid-cols-[auto,1fr] items-center gap-x-3' : 'flex items-center justify-start gap-2'}`}>
                  <span className={`font-medium ${isRTL ? 'col-start-1 text-right' : 'w-24'}`}>{t('colleges.status')}:</span>
                  <span
                    className={`px-2 py-1 rounded-full text-xs font-medium ${isRTL ? 'col-start-2 justify-self-start' : ''} ${
                      college.status === 'active'
                        ? 'bg-green-100 text-green-800'
                        : 'bg-gray-100 text-gray-800'
                    }`}
                  >
                    {getStatusLabel(college.status)}
                  </span>
                </div>
              </div>

              <div className="pt-4 border-t border-gray-200 space-y-2">
                <button
                  onClick={() => navigate(`/admin/colleges/${college.id}`)}
                  className="w-full bg-primary-50 text-primary-600 py-2 rounded-xl font-medium hover:bg-primary-100 transition-colors"
                >
                  {t('colleges.viewDetails')}
                </button>
                <button
                  onClick={() => navigate(`/admin/colleges/${college.id}/kpis`)}
                  className={`w-full flex items-center justify-center ${isRTL ? 'flex-row-reverse space-x-reverse' : 'space-x-2'} bg-gradient-to-r from-purple-50 to-pink-50 text-purple-600 py-2 rounded-xl font-medium hover:from-purple-100 hover:to-pink-100 transition-colors`}
                >
                  <BarChart3 className="w-4 h-4" />
                  <span>{t('colleges.graphs') || 'Graphs'}</span>
                </button>
                <button
                  type="button"
                  onClick={() => toggleCollegeStatus(college)}
                  disabled={updatingId === college.id}
                  className={`w-full py-2 rounded-xl font-medium transition-colors disabled:opacity-50 ${
                    college.status === 'active'
                      ? 'bg-amber-50 text-amber-700 hover:bg-amber-100'
                      : 'bg-green-50 text-green-700 hover:bg-green-100'
                  }`}
                >
                  {college.status === 'active' ? t('colleges.deactivate') : t('colleges.activate')}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
