// Pin'e sağ tık ile açılan hızlı eylem menüsü. Dışarı tık / Escape ile kapanır,
// ekran kenarına taşmaz. Eylemler onAction(id) ile orkestratöre iletilir.
import { useEffect } from 'react'

export default function ContextMenu({ block, x, y, isManager, onClose, onAction }) {
  useEffect(() => {
    function onClick(e) {
      // Menu disinda click → kapat
      if (!e.target.closest('[data-ctx-menu]')) onClose()
    }
    function onKey(e) { if (e.key === 'Escape') onClose() }
    setTimeout(() => window.addEventListener('click', onClick), 0)
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('click', onClick)
      window.removeEventListener('keydown', onKey)
    }
  }, [onClose])

  // Ekran disina tasmamasi icin
  const menuW = 220, menuH = isManager ? 360 : 220
  const left = Math.min(x, window.innerWidth - menuW - 8)
  const top = Math.min(y, window.innerHeight - menuH - 8)

  const items = [
    { id: 'detail',   icon: '◉', label: 'Detay paneli ac', desc: 'Tam blok detayi' },
    { id: 'fault',    icon: '⚠', label: 'Hizli ariza bildir', desc: 'Bu bloga yeni talep', accent: true },
    { id: 'cleaning', icon: '◈', label: 'Temizlik gorevleri', desc: 'Housekeeping sayfasi' },
    { id: 'checkin',  icon: '↗', label: 'Yeni check-in', desc: 'Personel yerlestir' },
    { id: 'history',  icon: '⊙', label: 'Oda gecmisi' },
    { id: 'whatsapp', icon: '✉', label: 'WhatsApp / Mail' },
    'divider',
    isManager && { id: 'quarantine',  icon: '⊘', label: 'Karantinaya al', danger: true },
    isManager && { id: 'maintenance', icon: '⚒', label: 'Bakima al', warn: true },
    isManager && { id: 'active',      icon: '✓', label: 'Tum odalari aktif yap' },
    isManager && 'divider',
    { id: 'copy-link', icon: '🔗', label: 'Linki kopyala' },
  ].filter(Boolean)

  return (
    <div data-ctx-menu style={{
      position: 'fixed', left, top, width: menuW, zIndex: 200,
      background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8,
      boxShadow: '0 8px 24px rgba(0,0,0,0.5)', overflow: 'hidden',
    }}>
      <div style={{ padding: '8px 12px', borderBottom: '1px solid var(--border)',
        background: 'var(--surface2)' }}>
        <div style={{ fontFamily: 'var(--display)', fontSize: 14, color: 'var(--accent)', letterSpacing: 2 }}>
          BLOK {block}
        </div>
        <div style={{ fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--text3)', letterSpacing: 1 }}>
          HIZLI EYLEMLER
        </div>
      </div>
      {items.map((it, i) => {
        if (it === 'divider') return <div key={i} style={{ height: 1, background: 'var(--border)' }} />
        return (
          <button key={it.id} onClick={() => onAction(it.id)}
            style={{
              display: 'flex', alignItems: 'center', gap: 10, width: '100%',
              background: 'transparent', border: 'none', textAlign: 'left',
              padding: '8px 12px', cursor: 'pointer',
              color: it.danger ? '#dc2626' : it.warn ? '#f59e0b' : it.accent ? 'var(--accent)' : 'var(--text)',
              fontFamily: 'var(--sans)', fontSize: 12,
              transition: 'background .1s',
            }}
            onMouseEnter={e => e.currentTarget.style.background = 'var(--surface2)'}
            onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
            <span style={{ fontSize: 14, width: 16, textAlign: 'center' }}>{it.icon}</span>
            <span style={{ flex: 1 }}>{it.label}</span>
            {it.accent && <span style={{ fontFamily: 'var(--mono)', fontSize: 8, color: 'var(--accent)', letterSpacing: 1 }}>SIK</span>}
          </button>
        )
      })}
    </div>
  )
}
