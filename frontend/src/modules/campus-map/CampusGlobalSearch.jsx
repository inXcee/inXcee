import { useMemo } from 'react'
import { buildCampusSearchResults } from './logic/campusWorkspace.js'

const TYPE_LABEL = {
  block: 'BLOK',
  room: 'ODA',
  person: 'KİŞİ',
  fault: 'ARIZA',
  command: 'KOMUT',
}

export default function CampusGlobalSearch({
  searchRef,
  query,
  open,
  onQueryChange,
  onOpenChange,
  blocks,
  rooms,
  personnel,
  faults,
  permissions,
  role,
  onSelect,
}) {
  const results = useMemo(() => buildCampusSearchResults({
    query, blocks, rooms, personnel, faults, permissions, role,
  }), [blocks, faults, permissions, personnel, query, role, rooms])

  return (
    <div style={{ position: 'relative', minWidth: 280, flex: '1 1 340px', maxWidth: 520 }}>
      <input
        ref={searchRef}
        type="search"
        aria-label="Kampüs genel araması"
        placeholder="◎ Blok, oda, kişi, arıza veya komut ara…"
        value={query}
        onChange={event => { onQueryChange(event.target.value); onOpenChange(true) }}
        onFocus={() => onOpenChange(true)}
        onBlur={() => setTimeout(() => onOpenChange(false), 180)}
        style={{
          width: '100%', background: 'var(--surface2)', border: '1px solid var(--border)',
          borderRadius: 7, padding: '8px 11px', color: 'var(--text)',
          fontFamily: 'var(--mono)', fontSize: 11, letterSpacing: 0.4,
        }}
      />
      {open && query.trim() && (
        <div style={{
          position: 'absolute', top: 'calc(100% + 4px)', left: 0, right: 0,
          background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 7,
          maxHeight: 360, overflowY: 'auto', zIndex: 80,
          boxShadow: '0 8px 24px rgba(0,0,0,.45)',
        }}>
          {results.length === 0 ? (
            <div style={{ padding: 14, color: 'var(--text3)', fontSize: 11 }}>Sonuç bulunamadı.</div>
          ) : results.map(result => (
            <button
              key={`${result.type}-${result.id}`}
              type="button"
              onMouseDown={() => onSelect(result)}
              style={{
                display: 'flex', alignItems: 'center', gap: 9, width: '100%',
                padding: '8px 10px', background: 'transparent', color: 'var(--text)',
                border: 0, borderBottom: '1px solid var(--border)', cursor: 'pointer', textAlign: 'left',
              }}
            >
              <span style={{
                minWidth: 46, fontFamily: 'var(--mono)', fontSize: 8, letterSpacing: 1,
                color: result.type === 'fault' ? '#dc2626' : result.type === 'command' ? 'var(--accent)' : 'var(--text3)',
              }}>{TYPE_LABEL[result.type]}</span>
              <span style={{ flex: 1, minWidth: 0 }}>
                <strong style={{ display: 'block', fontSize: 11, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {result.title}
                </strong>
                <span style={{ display: 'block', fontSize: 9, color: 'var(--text3)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {result.meta}
                </span>
              </span>
              <span style={{ color: 'var(--text3)' }}>›</span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
