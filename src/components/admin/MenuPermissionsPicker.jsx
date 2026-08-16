import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { useLanguage } from '../../contexts/LanguageContext'
import {
  MENU_MODULES,
  MENU_PRESETS,
  MENU_MODULE_KEYS,
  normalizeMenuPermissions,
  defaultMenuPermissions,
} from '../../utils/menuPermissions'

/**
 * Checkbox list + quick presets for college staff menu access.
 * value: string[] of module keys (never null while editing — use full list for "all").
 */
export default function MenuPermissionsPicker({ value, onChange, disabled = false }) {
  const { t } = useTranslation()
  const { isRTL, language } = useLanguage()
  const isArabic =
    isRTL ||
    language === 'ar' ||
    (typeof document !== 'undefined' && document?.documentElement?.dir === 'rtl')

  const selected = useMemo(() => {
    const n = normalizeMenuPermissions(value)
    return new Set(n?.length ? n : defaultMenuPermissions())
  }, [value])

  const emit = (nextSet) => {
    const always = MENU_MODULES.filter((m) => m.always).map((m) => m.key)
    const keys = MENU_MODULE_KEYS.filter((k) => nextSet.has(k) || always.includes(k))
    onChange?.(keys)
  }

  const toggle = (key) => {
    const mod = MENU_MODULES.find((m) => m.key === key)
    if (mod?.always || disabled) return
    const next = new Set(selected)
    if (next.has(key)) next.delete(key)
    else next.add(key)
    emit(next)
  }

  const applyPreset = (preset) => {
    if (disabled) return
    onChange?.([...(preset.keys || [])])
  }

  const allSelected = MENU_MODULE_KEYS.every((k) => selected.has(k))

  return (
    <div className="space-y-3">
      <div>
        <div className={`text-sm font-medium text-gray-800 mb-2 ${isArabic ? 'text-right' : 'text-left'}`}>
          {t('settings.staffUser.menuAccess', 'Menu access')}
        </div>
        <p className={`text-xs text-gray-500 mb-3 ${isArabic ? 'text-right' : 'text-left'}`}>
          {t(
            'settings.staffUser.menuAccessHint',
            'Choose which sidebar sections this user can see. Use a quick option, then adjust checkboxes if needed.',
          )}
        </p>
        <div className={`flex flex-wrap gap-2 ${isArabic ? 'justify-end' : 'justify-start'}`}>
          {MENU_PRESETS.map((preset) => {
            const label = isArabic ? preset.labelAr : preset.label
            const active =
              preset.keys.length === selected.size && preset.keys.every((k) => selected.has(k))
            return (
              <button
                key={preset.id}
                type="button"
                disabled={disabled}
                onClick={() => applyPreset(preset)}
                className={`px-3 py-1.5 rounded-lg text-sm font-semibold border transition-colors ${
                  active
                    ? 'bg-primary-600 text-white border-primary-600'
                    : 'bg-white text-gray-700 border-gray-300 hover:border-primary-400 hover:text-primary-700'
                } disabled:opacity-50`}
              >
                {t(`settings.staffUser.preset.${preset.id}`, label)}
              </button>
            )
          })}
          <button
            type="button"
            disabled={disabled || allSelected}
            onClick={() => onChange?.(defaultMenuPermissions())}
            className="px-3 py-1.5 rounded-lg text-sm font-medium border border-gray-200 text-gray-600 hover:bg-gray-50 disabled:opacity-50"
          >
            {t('settings.staffUser.selectAll', 'Select all')}
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2 p-3 rounded-xl border border-gray-200 bg-gray-50">
        {MENU_MODULES.map((mod) => {
          const checked = selected.has(mod.key)
          const label = isArabic ? mod.labelAr : mod.label
          return (
            <label
              key={mod.key}
              className={`flex items-center gap-2 text-sm text-gray-800 ${
                isArabic ? 'flex-row-reverse text-right' : ''
              } ${mod.always || disabled ? 'opacity-70' : 'cursor-pointer'}`}
            >
              <input
                type="checkbox"
                checked={checked}
                disabled={disabled || mod.always}
                onChange={() => toggle(mod.key)}
                className="rounded border-gray-300 text-primary-600 focus:ring-primary-500"
              />
              <span>
                {t(`settings.staffUser.module.${mod.key}`, label)}
                {mod.always ? (
                  <span className="text-xs text-gray-400 ms-1">
                    ({t('settings.staffUser.alwaysOn', 'always')})
                  </span>
                ) : null}
              </span>
            </label>
          )
        })}
      </div>
    </div>
  )
}
