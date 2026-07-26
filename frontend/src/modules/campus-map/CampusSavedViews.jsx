import { useEffect, useState } from 'react'

function loadViews(storageKey) {
  try {
    const value = JSON.parse(localStorage.getItem(storageKey) || '[]')
    return Array.isArray(value) ? value : []
  } catch {
    return []
  }
}

export default function CampusSavedViews({ userKey, view, onApply }) {
  const storageKey = `yys-campus-views:${userKey || 'anonymous'}`
  const [views, setViews] = useState(() => loadViews(storageKey))
  const [editing, setEditing] = useState(false)
  const [name, setName] = useState('')

  useEffect(() => {
    setViews(loadViews(storageKey))
  }, [storageKey])

  useEffect(() => {
    try { localStorage.setItem(storageKey, JSON.stringify(views)) } catch { /* depolama kapali olabilir */ }
  }, [storageKey, views])

  function save() {
    const trimmed = name.trim()
    if (!trimmed) return
    setViews(current => [
      ...current.filter(item => item.name !== trimmed),
      { name: trimmed, value: { ...view }, savedAt: Date.now() },
    ])
    setName('')
    setEditing(false)
  }

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 5, flexWrap: 'wrap' }}>
      {views.map(item => (
        <span key={item.name} style={{
          display: 'inline-flex', alignItems: 'center', gap: 3, padding: '3px 6px',
          border: '1px solid var(--border)', borderRadius: 5, background: 'var(--surface2)',
        }}>
          <button type="button" onClick={() => onApply(item.value)} style={{
            border: 0, background: 'transparent', color: 'var(--accent)', cursor: 'pointer',
            fontFamily: 'var(--mono)', fontSize: 9,
          }}>{item.name}</button>
          <button type="button" aria-label={`${item.name} görünümünü sil`} onClick={() => setViews(current => current.filter(viewItem => viewItem.name !== item.name))} style={{
            border: 0, background: 'transparent', color: 'var(--text3)', cursor: 'pointer', padding: 0,
          }}>×</button>
        </span>
      ))}
      {editing ? (
        <span style={{ display: 'inline-flex', gap: 4 }}>
          <input
            autoFocus
            value={name}
            onChange={event => setName(event.target.value)}
            onKeyDown={event => {
              if (event.key === 'Enter') save()
              if (event.key === 'Escape') setEditing(false)
            }}
            placeholder="Görünüm adı"
            aria-label="Görünüm adı"
            style={{
              width: 115, padding: '4px 6px', background: 'var(--surface2)', color: 'var(--text)',
              border: '1px solid var(--border)', borderRadius: 5, fontSize: 10,
            }}
          />
          <button type="button" onClick={save} disabled={!name.trim()} style={{
            border: 0, borderRadius: 5, background: 'var(--accent)', color: '#000', cursor: 'pointer',
          }}>✓</button>
        </span>
      ) : (
        <button type="button" onClick={() => setEditing(true)} style={{
          padding: '4px 7px', border: '1px dashed var(--border)', borderRadius: 5,
          background: 'transparent', color: 'var(--text3)', cursor: 'pointer',
          fontFamily: 'var(--mono)', fontSize: 9,
        }}>＋ GÖRÜNÜMÜ KAYDET</button>
      )}
    </div>
  )
}
