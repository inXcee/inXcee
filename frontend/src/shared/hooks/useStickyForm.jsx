import { useEffect, useRef, useState } from 'react'

// Hafif localStorage tabanli form autosave.
// useDraft (IndexedDB) eski/agir formlar icin; useStickyForm yeni hizli formlar icin.
//
// Kullanim:
//   const [form, setForm] = useState(initial)
//   const sticky = useStickyForm('companies-form', form, setForm, initial)
//   {sticky.hasDraft && <DraftBar onRestore={sticky.restore} onDiscard={sticky.discard} />}
//   sticky.clear()  // form submit basariliysa

export function useStickyForm(key, state, setState, initState) {
  const [hasDraft, setHasDraft] = useState(false)
  const lsKey = `yys-form:${key}`
  const initJson = useRef(JSON.stringify(initState))

  // Ilk mount'ta kayitli draft var mi
  useEffect(() => {
    try {
      const raw = localStorage.getItem(lsKey)
      if (raw && raw !== initJson.current) setHasDraft(true)
    } catch {}
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lsKey])

  // State degisince debounced save (500ms)
  const timerRef = useRef(null)
  useEffect(() => {
    clearTimeout(timerRef.current)
    timerRef.current = setTimeout(() => {
      const json = JSON.stringify(state)
      if (json === initJson.current) {
        localStorage.removeItem(lsKey)
        return
      }
      try { localStorage.setItem(lsKey, json) } catch {}
    }, 500)
    return () => clearTimeout(timerRef.current)
  }, [lsKey, state])

  function restore() {
    try {
      const raw = localStorage.getItem(lsKey)
      if (raw) {
        setState(JSON.parse(raw))
        setHasDraft(false)
      }
    } catch {}
  }
  function discard() {
    try { localStorage.removeItem(lsKey) } catch {}
    setHasDraft(false)
  }
  function clear() {
    try { localStorage.removeItem(lsKey) } catch {}
    setHasDraft(false)
  }

  return { hasDraft, restore, discard, clear }
}

export function StickyDraftBanner({ hasDraft, onRestore, onDiscard }) {
  if (!hasDraft) return null
  return (
    <div style={{
      padding: '8px 12px', marginBottom: 12,
      background: 'rgba(240,165,0,.08)', border: '1px solid var(--accent)',
      borderRadius: 6, display: 'flex', alignItems: 'center', gap: 12,
      fontSize: 12, fontFamily: 'var(--mono)',
    }}>
      <span>📝 Yarım kalmış bir form taslağı var.</span>
      <div style={{ flex: 1 }} />
      <button onClick={onRestore} className="btn btn-primary btn-sm">Geri yükle</button>
      <button onClick={onDiscard} className="btn btn-ghost btn-sm">Sil</button>
    </div>
  )
}
