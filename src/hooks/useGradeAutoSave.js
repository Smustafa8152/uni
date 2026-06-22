import { useCallback, useEffect, useRef } from 'react'

/**
 * Auto-save dirty grade rows on interval and debounced blur save.
 */
export function useGradeAutoSave({
  dirtyIds,
  saveRows,
  enabled = true,
  intervalMs = 60000,
  debounceMs = 300,
}) {
  const dirtyRef = useRef(dirtyIds)
  const saveRowsRef = useRef(saveRows)
  const debounceTimers = useRef({})
  const savingRef = useRef(false)

  dirtyRef.current = dirtyIds
  saveRowsRef.current = saveRows

  const flushDirty = useCallback(async (source = 'autosave') => {
    if (!enabled || savingRef.current) return
    const ids = [...dirtyRef.current]
    if (ids.length === 0) return
    savingRef.current = true
    try {
      await saveRowsRef.current(ids, source)
    } finally {
      savingRef.current = false
    }
  }, [enabled])

  useEffect(() => {
    if (!enabled) return undefined
    const timer = setInterval(() => flushDirty('autosave'), intervalMs)
    return () => clearInterval(timer)
  }, [enabled, intervalMs, flushDirty])

  const scheduleRowSave = useCallback(
    (enrollmentId) => {
      if (!enabled) return
      const key = String(enrollmentId)
      if (debounceTimers.current[key]) clearTimeout(debounceTimers.current[key])
      debounceTimers.current[key] = setTimeout(() => {
        delete debounceTimers.current[key]
        if (dirtyRef.current.has(enrollmentId)) {
          saveRowsRef.current([enrollmentId], 'autosave')
        }
      }, debounceMs)
    },
    [enabled, debounceMs]
  )

  return { flushDirty, scheduleRowSave }
}
