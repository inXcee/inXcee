import { useDroppable } from '@dnd-kit/core'
import { DraggableKanbanCard } from './KanbanCard.jsx'

// ── KanbanCol ──────────────────────────────────────────────────
export default function KanbanCol({ title, color, items, colStatus, isOver, machines, onDeliver, onDamage, onPersonClick, onFound, groupByRoom, batchMode, selectedIds, onSelect, onSelectBlock, emptyLabel = 'boş' }) {
  const { setNodeRef } = useDroppable({ id: colStatus })

  function renderItems() {
    // batchMode + ready kolonu → blok bazlı grupla + "Tümünü Seç" butonları
    if (batchMode && colStatus === 'ready') {
      const blocks = {}
      for (const item of items) {
        const key = item.block || 'Bilinmiyor'
        if (!blocks[key]) blocks[key] = []
        blocks[key].push(item)
      }
      return Object.entries(blocks).sort(([a], [b]) => a.localeCompare(b)).map(([block, blockItems]) => {
        const allSelected = blockItems.length > 0 && blockItems.every(item => selectedIds.has(item.id))
        return (
          <div key={block} style={{ marginBottom: 8 }}>
            <div style={{
              display: 'flex', alignItems: 'center', gap: 8,
              padding: '4px 6px', borderBottom: '1px solid var(--border)', marginBottom: 4,
            }}>
              <span style={{
                fontFamily: 'var(--mono)', fontSize: 8, fontWeight: 700,
                color: 'var(--green)', letterSpacing: 1.5, flex: 1,
              }}>
                {block} <span style={{ color: 'var(--text4)' }}>({blockItems.length})</span>
              </span>
              <button
                type="button"
                onClick={() => onSelectBlock(blockItems)}
                style={{
                  padding: '2px 8px', borderRadius: 4, fontSize: 8, fontFamily: 'var(--mono)',
                  background: allSelected ? 'rgba(16,185,129,0.1)' : 'var(--surface2)',
                  border: `1px solid ${allSelected ? 'rgba(16,185,129,0.3)' : 'var(--border)'}`,
                  color: allSelected ? 'var(--green)' : 'var(--text3)', cursor: 'pointer',
                }}
              >
                {allSelected ? '✓ Seçildi' : 'Tümünü Seç'}
              </button>
            </div>
            {blockItems.map(item => (
              <div
                key={item.id}
                style={{
                  marginBottom: 8, position: 'relative',
                  outline: selectedIds.has(item.id) ? '2px solid var(--green)' : 'none',
                  borderRadius: 8,
                }}
              >
                <DraggableKanbanCard item={item} machines={machines} onDeliver={onDeliver} onDamage={onDamage}
                  onPersonClick={onPersonClick} onFound={onFound} />
                <div
                  onClick={() => onSelect(item.id)}
                  style={{
                    position: 'absolute', inset: 0, cursor: 'pointer', borderRadius: 8,
                    background: selectedIds.has(item.id) ? 'rgba(16,185,129,0.05)' : 'transparent',
                  }}
                />
                <input
                  type="checkbox"
                  checked={selectedIds.has(item.id)}
                  onChange={() => onSelect(item.id)}
                  style={{ position: 'absolute', top: 8, right: 8, cursor: 'pointer', accentColor: 'var(--green)' }}
                />
              </div>
            ))}
          </div>
        )
      })
    }

    if (!groupByRoom) {
      return items.map(item => (
        <DraggableKanbanCard key={item.id} item={item} machines={machines} onDeliver={onDeliver} onDamage={onDamage}
          onPersonClick={onPersonClick} onFound={onFound} />
      ))
    }
    const groups = {}
    for (const item of items) {
      const key = item.room_no ? `${item.block}-${item.room_no}` : 'Bilinmiyor'
      if (!groups[key]) groups[key] = []
      groups[key].push(item)
    }
    return Object.entries(groups).map(([roomKey, roomItems]) => (
      <div key={roomKey} style={{ marginBottom: 4 }}>
        <div style={{
          fontFamily: 'var(--mono)', fontSize: 8, fontWeight: 700,
          color: 'var(--text3)', letterSpacing: 1.5,
          padding: '4px 6px', borderBottom: '1px solid var(--border)', marginBottom: 4,
        }}>
          {roomKey} <span style={{ color: 'var(--text4)' }}>({roomItems.length})</span>
        </div>
        {roomItems.map(item => (
          <div key={item.id} style={{ marginBottom: 8 }}>
            <DraggableKanbanCard item={item} machines={machines} onDeliver={onDeliver} onDamage={onDamage}
              onPersonClick={onPersonClick} onFound={onFound} />
          </div>
        ))}
      </div>
    ))
  }

  return (
    <div style={{
      flex: 1, minWidth: 260, display: 'flex', flexDirection: 'column',
      background: 'var(--surface)', border: `1px solid ${isOver ? color : 'var(--border)'}`,
      borderTop: `2px solid ${color}`, borderRadius: 10, overflow: 'hidden',
      transition: 'border-color 0.15s',
    }}>
      <div style={{
        padding: '10px 14px', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        borderBottom: '1px solid var(--border)',
        background: `linear-gradient(135deg, ${color}0d, transparent)`,
      }}>
        <span style={{ fontFamily: 'var(--display)', fontSize: 13, letterSpacing: 3, color }}>{title}</span>
        <span style={{ fontFamily: 'var(--display)', fontSize: 26, letterSpacing: 1, color, lineHeight: 1 }}>
          {items.length}
        </span>
      </div>
      <div
        ref={setNodeRef}
        style={{
          flex: 1, overflowY: 'auto', padding: 10, display: 'flex', flexDirection: 'column', gap: 8, maxHeight: 680,
          background: isOver ? `${color}08` : 'transparent',
          transition: 'background 0.15s',
        }}
      >
        {items.length === 0 ? (
          <div style={{ padding: '28px 0', textAlign: 'center', fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--text4)' }}>
            {emptyLabel}
          </div>
        ) : renderItems()}
      </div>
    </div>
  )
}
