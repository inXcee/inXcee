import { useEffect, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import api from '../../shared/api/client.js'

// Tam ekran TV pano — auth gerekmiyor, 30sn'de bir refresh.
// URL: /display (public route)

export default function DisplayPage() {
  const [now, setNow] = useState(new Date())
  const [announcementIdx, setAnnouncementIdx] = useState(0)

  const { data } = useQuery({
    queryKey: ['display-snapshot'],
    queryFn: () => api.get('/display/snapshot').then(r => r.data),
    refetchInterval: 30000,
  })

  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000)
    return () => clearInterval(t)
  }, [])

  const announcements = data?.announcements || []
  useEffect(() => {
    if (announcements.length <= 1) return
    const t = setInterval(() => setAnnouncementIdx(i => (i + 1) % announcements.length), 8000)
    return () => clearInterval(t)
  }, [announcements.length])

  if (!data) {
    return <div style={{ ...styles.shell, color: '#666' }}>Yükleniyor...</div>
  }

  const occ = data.occupancy
  const announcement = announcements[announcementIdx]

  return (
    <div style={styles.shell}>
      {/* Header */}
      <div style={styles.header}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 24 }}>
          <div style={{ fontSize: 56, fontWeight: 700, letterSpacing: 8, color: '#f0a500' }}>YYS</div>
          <div>
            <div style={{ fontSize: 16, color: '#999', letterSpacing: 3 }}>ŞANTİYE YÖNETİM SİSTEMİ</div>
            <div style={{ fontSize: 12, color: '#666', letterSpacing: 2, marginTop: 4 }}>CANLI PANO</div>
          </div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontSize: 64, fontFamily: 'var(--mono)', color: '#fff', fontWeight: 600 }}>
            {now.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })}
          </div>
          <div style={{ fontSize: 14, color: '#999', letterSpacing: 2 }}>
            {now.toLocaleDateString('tr-TR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
          </div>
        </div>
      </div>

      {/* Main grid */}
      <div style={styles.grid}>
        {/* Doluluk büyük kart */}
        <div style={{ ...styles.bigCard, gridColumn: 'span 2' }}>
          <div style={styles.cardLabel}>GENEL DOLULUK</div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 16 }}>
            <div style={{ fontSize: 120, fontWeight: 700, color: occ.rate >= 90 ? '#ef4444' : occ.rate >= 70 ? '#f97316' : '#22c55e', lineHeight: 1 }}>
              %{occ.rate}
            </div>
            <div style={{ fontSize: 24, color: '#fff' }}>
              <div>{occ.occupied} / {occ.beds} yatak</div>
              <div style={{ color: '#22c55e', fontSize: 18 }}>{occ.empty} boş</div>
            </div>
          </div>
          <div style={{ height: 16, background: '#222', borderRadius: 8, overflow: 'hidden', marginTop: 24 }}>
            <div style={{
              width: `${occ.rate}%`, height: '100%',
              background: occ.rate >= 90 ? '#ef4444' : occ.rate >= 70 ? '#f97316' : '#22c55e',
              transition: 'width 0.6s ease',
            }} />
          </div>
        </div>

        <Stat label="Bugün Giriş" value={data.today.check_in} color="#22c55e" />
        <Stat label="Bugün Çıkış" value={data.today.check_out} color="#f97316" />
        <Stat label="Açık Arıza" value={data.open_maintenance} color={data.open_maintenance > 5 ? '#ef4444' : '#fff'} />
        <Stat label="İçerdeki Ziyaretçi" value={data.active_visitors} color="#fff" />
      </div>

      {/* Blok bar grafik */}
      <div style={{ ...styles.bigCard, marginTop: 16 }}>
        <div style={styles.cardLabel}>BLOK BAZINDA DOLULUK</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(120px, 1fr))', gap: 12, marginTop: 16 }}>
          {data.blocks.map(b => {
            const r = b.beds > 0 ? Math.round((b.occupied / b.beds) * 100) : 0
            return (
              <div key={b.block} style={{ textAlign: 'center' }}>
                <div style={{ fontSize: 22, fontWeight: 600, color: '#fff' }}>{b.block}</div>
                <div style={{
                  height: 64, background: '#222', borderRadius: 6, overflow: 'hidden',
                  display: 'flex', flexDirection: 'column-reverse', marginTop: 4,
                }}>
                  <div style={{
                    height: `${r}%`,
                    background: r >= 90 ? '#ef4444' : r >= 70 ? '#f97316' : '#22c55e',
                    transition: 'height 0.6s ease',
                  }} />
                </div>
                <div style={{ fontSize: 14, fontFamily: 'var(--mono)', color: '#999', marginTop: 4 }}>
                  {b.occupied}/{b.beds} · %{r}
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {/* Footer — duyuru + tatbikat */}
      <div style={{ display: 'flex', gap: 16, marginTop: 16 }}>
        <div style={{ ...styles.bigCard, flex: 2 }}>
          <div style={styles.cardLabel}>DUYURU</div>
          {announcement ? (
            <div key={announcement.title} style={{ animation: 'fadeUp 0.6s ease' }}>
              <div style={{ fontSize: 22, color: '#f0a500', fontWeight: 600, marginTop: 8 }}>{announcement.title}</div>
              <div style={{ fontSize: 16, color: '#ccc', marginTop: 8, lineHeight: 1.5 }}>{announcement.body}</div>
            </div>
          ) : (
            <div style={{ fontSize: 14, color: '#666', marginTop: 16 }}>Aktif duyuru yok</div>
          )}
          {announcements.length > 1 && (
            <div style={{ display: 'flex', gap: 4, marginTop: 12 }}>
              {announcements.map((_, i) => (
                <div key={i} style={{
                  flex: 1, height: 3, borderRadius: 2,
                  background: i === announcementIdx ? '#f0a500' : '#333',
                  transition: 'background 0.3s',
                }} />
              ))}
            </div>
          )}
        </div>
        <div style={{ ...styles.bigCard, flex: 1 }}>
          <div style={styles.cardLabel}>SIRADAKİ TATBİKAT</div>
          {data.upcoming_drill ? (
            <div style={{ marginTop: 12 }}>
              <div style={{ fontSize: 28, color: '#f0a500', fontWeight: 600 }}>{data.upcoming_drill.drill_type.toUpperCase()}</div>
              <div style={{ fontSize: 18, color: '#fff', fontFamily: 'var(--mono)', marginTop: 8 }}>{data.upcoming_drill.next_drill_date}</div>
            </div>
          ) : (
            <div style={{ fontSize: 14, color: '#666', marginTop: 16 }}>Planlanmış tatbikat yok</div>
          )}
        </div>
      </div>
    </div>
  )
}

function Stat({ label, value, color }) {
  return (
    <div style={styles.bigCard}>
      <div style={styles.cardLabel}>{label}</div>
      <div style={{ fontSize: 72, fontWeight: 700, color, marginTop: 8, lineHeight: 1 }}>{value}</div>
    </div>
  )
}

const styles = {
  shell: {
    minHeight: '100vh', background: '#0a0a0a', color: '#fff',
    padding: 32, fontFamily: 'system-ui, -apple-system, sans-serif',
  },
  header: {
    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
    marginBottom: 24, paddingBottom: 16, borderBottom: '1px solid #222',
  },
  grid: {
    display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16,
  },
  bigCard: {
    background: '#111', border: '1px solid #222', borderRadius: 12,
    padding: 24, display: 'flex', flexDirection: 'column',
  },
  cardLabel: {
    fontSize: 12, color: '#666', letterSpacing: 3, fontFamily: 'var(--mono, monospace)',
  },
}
