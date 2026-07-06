// Birleşik hareket geçmişi — sunumsal (presentational) bileşen.
// Hem admin (açık tema, var(--) panel) hem AVS kiosk (koyu tema, slate) içinde
// kullanılır; tema farkı `dark` prop'u ile kontrol edilen küçük bir paletle çözülür.

const KIND_COLOR = {
  access: '#2563eb', meal: '#ea580c', equipment: '#7c3aed',
  leave: '#0891b2', transport: '#0d9488', kiosk: '#64748b',
}

// Tarih filtre çipleri için açık liste (admin kullanır)
export const KIND_FILTERS = [
  { key: 'access', label: 'Okutma', icon: '⌁' },
  { key: 'meal', label: 'Yemek', icon: '🍽' },
  { key: 'equipment', label: 'Zimmet', icon: '📦' },
  { key: 'leave', label: 'İzin', icon: '📝' },
  { key: 'transport', label: 'Servis', icon: '🚌' },
  { key: 'kiosk', label: 'Kiosk', icon: '📱' },
]

function fmt(ts) {
  // SQLite UTC metni → yerel saat
  const d = new Date(ts.replace(' ', 'T') + 'Z')
  if (isNaN(d)) return ts
  return d.toLocaleString('tr-TR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
}

export default function ActivityTimeline({ items = [], loading, emptyText = 'Henüz hareket yok', dark = false }) {
  const c = dark
    ? { line: '#334155', primary: '#e2e8f0', secondary: '#94a3b8', chipBg: '#1e293b', rowHover: 'transparent' }
    : { line: 'var(--border)', primary: 'var(--text)', secondary: 'var(--text3)', chipBg: 'var(--surface2)', rowHover: 'var(--surface2)' }

  if (loading) {
    return <div style={{ padding: 16, fontFamily: 'var(--mono)', fontSize: 12, color: c.secondary }}>Yükleniyor…</div>
  }
  if (!items.length) {
    return <div style={{ padding: 16, fontFamily: 'var(--mono)', fontSize: 12, color: c.secondary }}>{emptyText}</div>
  }

  return (
    <div style={{ position: 'relative', padding: '4px 0' }}>
      {/* dikey çizgi */}
      <div style={{ position: 'absolute', left: 27, top: 8, bottom: 8, width: 2, background: c.line }} />
      {items.map((it, i) => {
        const denied = it.result && it.result !== 'ok'
        const accent = denied ? '#dc2626' : (KIND_COLOR[it.kind] || '#64748b')
        return (
          <div key={i} style={{ display: 'flex', gap: 12, padding: '8px 16px', alignItems: 'flex-start' }}>
            {/* ikon noktası */}
            <div style={{
              position: 'relative', zIndex: 1, flexShrink: 0,
              width: 24, height: 24, borderRadius: '50%',
              background: `${accent}22`, border: `2px solid ${accent}`,
              display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11,
            }}>{it.icon || '•'}</div>

            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' }}>
                <span style={{ fontFamily: 'var(--sans)', fontSize: 13, fontWeight: 500, color: c.primary }}>{it.title}</span>
                {denied && (
                  <span style={{ fontFamily: 'var(--mono)', fontSize: 9, padding: '1px 6px', borderRadius: 4, background: '#dc262622', color: '#dc2626' }}>RED</span>
                )}
                <span style={{ marginLeft: 'auto', fontFamily: 'var(--mono)', fontSize: 10, color: c.secondary, flexShrink: 0 }}>{fmt(it.ts)}</span>
              </div>
              {it.detail && <div style={{ fontFamily: 'var(--mono)', fontSize: 11, color: c.secondary, marginTop: 2 }}>{it.detail}</div>}
            </div>

            {it.photo_url && (
              <img src={it.photo_url} alt="" style={{ width: 36, height: 36, borderRadius: 6, objectFit: 'cover', flexShrink: 0 }} />
            )}
          </div>
        )
      })}
    </div>
  )
}
