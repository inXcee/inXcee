import { useEffect, useRef, useCallback, useState } from 'react'
import { saveDraft, loadDraft, clearDraft } from '../utils/offlineDB.js'

export function useDraft(key, state, setState, initState) {
  const [hasDraft, setHasDraft] = useState(false)
  const timerRef = useRef(null)

  useEffect(() => {
    loadDraft(key).then(data => { if (data) setHasDraft(true) }).catch(() => {})
  }, [key])

  useEffect(() => {
    clearTimeout(timerRef.current)
    timerRef.current = setTimeout(() => {
      if (JSON.stringify(state) === JSON.stringify(initState)) {
        clearDraft(key).catch(() => {})
        return
      }
      saveDraft(key, state).catch(() => {})
    }, 800)
    return () => clearTimeout(timerRef.current)
  }, [key, state, initState])

  const restoreDraft = useCallback(async () => {
    try {
      const data = await loadDraft(key)
      if (data) { setState(data); setHasDraft(false) }
    } catch {}
  }, [key, setState])

  const discardDraft = useCallback(() => {
    clearDraft(key).catch(() => {})
    setHasDraft(false)
  }, [key])

  const onSubmitSuccess = useCallback(() => {
    clearDraft(key).catch(() => {})
    setHasDraft(false)
  }, [key])

  return { hasDraft, restoreDraft, discardDraft, onSubmitSuccess }
}
