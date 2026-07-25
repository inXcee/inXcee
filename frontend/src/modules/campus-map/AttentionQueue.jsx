import { useMemo } from 'react'
import { buildAttentionQueue } from './logic/campusOverview.js'

// Blok seçili değilken sağ sütunda duran "şu an ne yapılmalı" listesi.
// Satıra tıklayınca harita o bloğa odaklanır.
const KIND_STYLE = {
  fault: { icon: '⚠', color: '#dc2626', label: 'ARIZA' },
  full: { icon: '●', color: '#dc2626', label: 'DOLU' },
  cleaning: { icon: '◈', color: '#f59e0b', label: 'TEMİZLİK' },
  quarantine: { icon: '⊘', color: '#a855f7', label: 'KARANTİNA' },
  maintenance: { icon: '⚒', color: '#f59e0b', label: 'BAKIM' },
}

export default function AttentionQueue({ stats, onSelect, modeDesc }) {
  const queue = useMemo(() => buildAttentionQueue(stats), [stats])

  return (
    <div style={{
      width: 320, background: 'var(--surface)', border: '1px solid var(--border)',
      borderRadius: 8, padding: 12, display: 'flex', flexDirection: 'column', gap: 8,
      maxHeight: '100%', overflowY: 'auto',
    }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <span style={{ fontFamily: 'var(--mono)', fontSize: 10, letterSpacing: 1, color: 'var(--text2)', fontWeight: 700 }}>
          ⚠ DİKKAT GEREKENLER
        </span>
        <span style={{
          marginLeft: 'auto', fontFamily: 'var(--mono)', fontSize: 10,
          color: queue.length ? '#dc2626' : 'var(--accent)', fontWeight: 700,
        }}
        >
          {queue.length}
        </span>
      </div>

      {queue.length === 0 ? (
        <div style={{ textAlign: 'center', color: 'var(--text3)', fontFamily: 'var(--mono)', fontSize: 11, padding: '18px 4px' }}>
          <div style={{ fontSize: 26, marginBottom: 6, opacity: 0.5 }}>✓</div>
          AKSİYON BEKLEYEN YOK
          <div style={{ fontSize: 9, color: 'var(--text4)', marginTop: 6 }}>{modeDesc}</div>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          {queue.map((item, index) => {
            const style = KIND_STYLE[item.kind] || KIND_STYLE.fault
            return (
              <button
                key={`${item.block}-${item.kind}-${index}`}
                type="button"
                onClick={() => onSelect?.(item.block)}
                title={`${item.block} — ${item.text}`}
                style={{
                  display: 'flex', alignItems: 'center', gap: 8, width: '100%', textAlign: 'left',
                  background: 'var(--surface2, transparent)', border: '1px solid var(--border)',
                  borderLeft: `3px solid ${style.color}`, borderRadius: 6,
                  padding: '6px 8px', cursor: 'pointer', color: 'var(--text)',
                }}
              >
                <span style={{ color: style.color, fontSize: 12 }}>{style.icon}</span>
                <span style={{ fontFamily: 'var(--mono)', fontWeight: 700, fontSize: 11, minWidth: 26 }}>{item.block}</span>
                <span style={{ fontSize: 11, color: 'var(--text2)', flex: '1 1 auto', minWidth: 0 }}>{item.text}</span>
                <span style={{ color: 'var(--text3)', fontSize: 12 }}>›</span>
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}
