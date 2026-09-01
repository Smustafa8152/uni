import Select from 'react-select'

/**
 * Searchable multi-select (react-select). Options: { value: number|string, label: string }[]
 */
export default function SearchableMultiSelect({
  value,
  onChange,
  options,
  placeholder,
  noOptionsMessage,
  isDisabled,
  isRTL,
  inputId,
}) {
  const idSet = new Set((value || []).map((v) => String(v)))
  const selected = options.filter((o) => idSet.has(String(o.value)))

  return (
    <Select
      inputId={inputId}
      instanceId={inputId}
      isMulti
      isClearable
      isSearchable
      isDisabled={isDisabled}
      closeMenuOnSelect={false}
      hideSelectedOptions={false}
      blurInputOnSelect={false}
      options={options}
      value={selected}
      onChange={(next) => {
        const ids = next ? next.map((o) => o.value) : []
        onChange(ids)
      }}
      placeholder={placeholder}
      noOptionsMessage={() => noOptionsMessage || '—'}
      rtl={!!isRTL}
      menuPlacement="auto"
      menuPortalTarget={typeof document !== 'undefined' ? document.body : null}
      styles={{
        control: (base, state) => ({
          ...base,
          minHeight: 42,
          borderRadius: '0.5rem',
          borderColor: state.isFocused ? '#6366f1' : '#d1d5db',
          boxShadow: state.isFocused ? '0 0 0 2px rgba(99, 102, 241, 0.15)' : 'none',
          '&:hover': { borderColor: state.isFocused ? '#6366f1' : '#9ca3af' },
        }),
        menuPortal: (base) => ({ ...base, zIndex: 9999 }),
        menu: (base) => ({ ...base, zIndex: 9999 }),
        multiValue: (base) => ({
          ...base,
          backgroundColor: '#e0e7ff',
          borderRadius: '0.375rem',
        }),
        multiValueLabel: (base) => ({ ...base, color: '#3730a3', fontSize: '0.8125rem' }),
        multiValueRemove: (base) => ({
          ...base,
          ':hover': { backgroundColor: '#c7d2fe', color: '#1e1b4b' },
        }),
      }}
    />
  )
}
