import { useMemo } from 'react'
import { Link } from 'react-router-dom'
import { useAuthStore } from '../../shared/store/authStore.js'
import { visibleGroups, settingsPath, loadFavorites, loadRecents, itemsByKeys } from './settingsNav.js'

// `/settings` eskiden doğrudan Personel listesine atıyordu: Ayarlar'ın neler
// içerdiğini görmenin hiçbir yolu yoktu, kullanıcı bir personel tablosunun
// içinde buluyordu kendini.
//
// Burası artık genel bakış: hangi bölümde ne var, her kalemin ne işe yaradığı
// tek ekranda. Rolün göremeyeceği kalem hiç çizilmez.

function Kart({ item }) {
  return (
    <Link
      to={settingsPath(item.key)}
      style={{
        display: 'flex', gap: 10, alignItems: 'flex-start', textDecoration: 'none',
        border: '1px solid var(--border)', borderRadius: 10, padding: '10px 12px',
        background: 'var(--surface)', color: 'var(--text)', minWidth: 0,
        transition: 'border-color .15s',
      }}
    >
      <span style={{ fontSize: 17, lineHeight: 1.2, flexShrink: 0 }}>{item.icon}</span>
      <span style={{ minWidth: 0 }}>
        <span style={{ display: 'block', fontSize: 13, fontWeight: 600 }}>{item.label}</span>
        <span style={{ display: 'block', fontSize: 11, color: 'var(--text3)', marginTop: 2 }}>{item.desc}</span>
      </span>
    </Link>
  )
}

function Serit({ baslik, items }) {
  if (!items.length) return null
  return (
    <section style={{ marginBottom: 18 }}>
      <div style={{ fontFamily: 'var(--mono)', fontSize: 9, letterSpacing: 2, color: 'var(--accent)', marginBottom: 8 }}>
        {baslik}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 8 }}>
        {items.map(i => <Kart key={i.key} item={i} />)}
      </div>
    </section>
  )
}

export default function SettingsHomePage() {
  const role = useAuthStore(s => s.user?.role)
  const gruplar = useMemo(() => visibleGroups(role), [role])
  const favoriler = useMemo(() => itemsByKeys(loadFavorites(), role), [role])
  const sonlar = useMemo(
    () => itemsByKeys(loadRecents(), role).filter(i => !favoriler.some(f => f.key === i.key)).slice(0, 4),
    [role, favoriler])

  const toplam = gruplar.reduce((t, g) => t + g.items.length, 0)

  return (
    <div className="fade-up" style={{ padding: '20px 22px', maxWidth: 1100 }}>
      <h1 style={{ fontFamily: 'var(--display)', fontSize: 20, letterSpacing: 1, margin: '0 0 4px' }}>AYARLAR</h1>
      <div style={{ fontSize: 12, color: 'var(--text3)', marginBottom: 18 }}>
        {toplam === 0
          // Boş ekran "ayar yok" değil, "senin rolüne açık ayar yok" demektir.
          ? 'Rolünüze açık bir ayar sayfası yok.'
          : `${toplam} ayar sayfası · soldaki aramadan (Ctrl+K) hızlıca ulaşabilirsiniz`}
      </div>

      <Serit baslik="★ SIK KULLANILAN" items={favoriler} />
      <Serit baslik="SON GİDİLENLER" items={sonlar} />

      {gruplar.map(g => (
        <section key={g.key} style={{ marginBottom: 20 }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 8, flexWrap: 'wrap' }}>
            <span style={{ fontFamily: 'var(--mono)', fontSize: 10, letterSpacing: 2, color: 'var(--accent)' }}>
              {g.label}
            </span>
            <span style={{ fontSize: 11, color: 'var(--text3)' }}>{g.hint}</span>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 8 }}>
            {g.items.map(i => <Kart key={i.key} item={i} />)}
          </div>
        </section>
      ))}
    </div>
  )
}
