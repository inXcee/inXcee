import { useEffect, useState } from 'react'

// Sayfaya ozel kayitli filtre setleri — localStorage'da kullanici bazinda.
// Kullanim:
//   const { presets, save, remove, apply, current, setCurrent } = useSavedFilters('bulk-actions', filters, setFilters)
//   <SavedFiltersBar presets={presets} ... />

export function useSavedFilters(key, currentFilters, setFilters) {
  const lsKey = `yys-filters:${key}`
  const [presets, setPresets] = useState(() => {
    try { return JSON.parse(localStorage.getItem(lsKey) || '[]') } catch { return [] }
  })

  useEffect(() => {
    localStorage.setItem(lsKey, JSON.stringify(presets))
  }, [lsKey, presets])

  function save(name) {
    if (!name?.trim()) return
    const trimmed = name.trim()
    setPresets(p => {
      const without = p.filter(x => x.name !== trimmed)
      return [...without, { name: trimmed, filters: { ...currentFilters }, ts: Date.now() }]
    })
  }

  function remove(name) {
    setPresets(p => p.filter(x => x.name !== name))
  }

  function apply(preset) {
    setFilters({ ...preset.filters })
  }

  return { presets, save, remove, apply }
}

export function SavedFiltersBar({ presets, onApply, onSave, onRemove, hasActiveFilter }) {
  const [showSave, setShowSave] = useState(false)
  const [name, setName] = useState('')

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 8 }}>
      {presets.length > 0 && (
        <>
          <span style={{ fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--text3)', letterSpacing: 1 }}>
            KAYITLI FİLTRELER:
          </span>
          {presets.map(p => (
            <div key={p.name} style={{
              display: 'inline-flex', alignItems: 'center', gap: 4,
              padding: '4px 8px', background: 'var(--surface2)',
              border: '1px solid var(--border)', borderRadius: 4,
              fontFamily: 'var(--mono)', fontSize: 10,
            }}>
              <button
                onClick={() => onApply(p)}
                style={{ background: 'none', border: 'none', color: 'var(--accent)', cursor: 'pointer', padding: 0 }}
                title="Uygula"
              >{p.name}</button>
              <button
                onClick={() => onRemove(p.name)}
                style={{ background: 'none', border: 'none', color: 'var(--text3)', cursor: 'pointer', padding: 0, fontSize: 12 }}
                title="Sil"
              >×</button>
            </div>
          ))}
        </>
      )}
      {hasActiveFilter && !showSave && (
        <button
          onClick={() => setShowSave(true)}
          style={{
            padding: '4px 8px', fontSize: 10, fontFamily: 'var(--mono)',
            background: 'transparent', border: '1px dashed var(--border)',
            color: 'var(--text3)', borderRadius: 4, cursor: 'pointer',
          }}
        >+ Bu filtreyi kaydet</button>
      )}
      {showSave && (
        <div style={{ display: 'inline-flex', gap: 4 }}>
          <input
            autoFocus
            value={name}
            onChange={e => setName(e.target.value)}
            placeholder="Filtre adı"
            style={{ padding: '3px 8px', fontSize: 11, fontFamily: 'var(--mono)', borderRadius: 4, border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text)' }}
            onKeyDown={e => {
              if (e.key === 'Enter') { onSave(name); setName(''); setShowSave(false) }
              if (e.key === 'Escape') { setShowSave(false); setName('') }
            }}
          />
          <button
            onClick={() => { onSave(name); setName(''); setShowSave(false) }}
            disabled={!name.trim()}
            style={{ padding: '3px 8px', fontSize: 10, background: 'var(--accent)', color: '#000', border: 'none', borderRadius: 4, cursor: 'pointer' }}
          >Kaydet</button>
          <button
            onClick={() => { setShowSave(false); setName('') }}
            style={{ padding: '3px 8px', fontSize: 10, background: 'transparent', color: 'var(--text3)', border: '1px solid var(--border)', borderRadius: 4, cursor: 'pointer' }}
          >İptal</button>
        </div>
      )}
    </div>
  )
}
