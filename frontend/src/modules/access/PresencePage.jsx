import { useQuery } from '@tanstack/react-query'
import api from '../../shared/api/client.js'
import { SkeletonTable } from '../../shared/components/Skeleton.jsx'

const HOLDER_LABEL = { staff: 'Personel', personnel: 'İşçi', visitor: 'Ziyaretçi' }

function fmt(ts) {
  if (!ts) return '—'
  const d = new Date(ts.replace(' ', 'T'))
  return isNaN(d) ? ts : d.toLocaleString('tr-TR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
}

export default function PresencePage() {
  const { data: presence, isLoading } = useQuery({
    queryKey: ['access-presence'],
    queryFn: () => api.get('/access/presence').then(r => r.data),
    refetchInterval: 20000,
  })
  const { data: anomalies } = useQuery({
    queryKey: ['access-anomalies'],
    queryFn: () => api.get('/access/anomalies').then(r => r.data),
    refetchInterval: 20000,
  })

  const onCampus = presence?.on_campus ?? []
  const noExit = anomalies?.no_exit ?? []
  const passback = anomalies?.passback ?? []

  async function downloadCsv() {
    const res = await api.get('/reports/access-events.csv', { responseType: 'blob' })
    const url = URL.createObjectURL(res.data)
    const a = document.createElement('a')
    a.href = url
    a.download = `erisim-hareketleri-${new Date().toISOString().slice(0, 10)}.csv`
    document.body.appendChild(a); a.click(); a.remove()
    URL.revokeObjectURL(url)
  }

  return (
    <div style={{ padding: 24, maxWidth: 1100, margin: '0 auto' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
        <h1 style={{ fontSize: 24, fontWeight: 800, marginBottom: 4 }}>Kampüs Mevcudiyeti</h1>
        <button onClick={downloadCsv}
          style={{ padding: '8px 14px', borderRadius: 8, border: '1px solid #cbd5e1', background: '#fff', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
          ⬇ Hareket CSV
        </button>
      </div>
      <p style={{ color: '#64748b', marginBottom: 20 }}>Son giriş/çıkış okutmalarından türetilir · 20 sn'de bir yenilenir</p>

      <div style={{ display: 'flex', gap: 16, marginBottom: 24, flexWrap: 'wrap' }}>
        <StatCard label="Şu an içeride" value={presence?.count ?? '—'} color="#16a34a" />
        <StatCard label="Çıkışsız uzun süre" value={noExit.length} color="#b45309" hint={anomalies ? `${anomalies.overdue_hours}+ saat` : ''} />
        <StatCard label="Anti-passback şüphesi" value={passback.length} color="#dc2626" />
      </div>

      {(noExit.length > 0 || passback.length > 0) && (
        <div style={{ marginBottom: 24 }}>
          <h2 style={{ fontSize: 16, fontWeight: 700, marginBottom: 8 }}>⚠ Anomaliler</h2>
          {noExit.map(a => (
            <AnomalyRow key={`ne-${a.holder_type}-${a.holder_id}`} color="#b45309"
              text={`${a.full_name || 'Bilinmiyor'} (${HOLDER_LABEL[a.holder_type] || a.holder_type}) — ${a.hours_inside} saattir çıkış yapmadı`}
              sub={`Giriş: ${fmt(a.since)}`} />
          ))}
          {passback.map(a => (
            <AnomalyRow key={`pb-${a.holder_type}-${a.holder_id}`} color="#dc2626"
              text={`${a.full_name || 'Bilinmiyor'} (${HOLDER_LABEL[a.holder_type] || a.holder_type}) — art arda "${a.last_dir === 'entry' ? 'giriş' : 'çıkış'}" (passback)`}
              sub={`Son: ${fmt(a.since)}`} />
          ))}
        </div>
      )}

      <h2 style={{ fontSize: 16, fontWeight: 700, marginBottom: 8 }}>İçeridekiler</h2>
      {isLoading ? <SkeletonTable /> : onCampus.length === 0 ? (
        <p style={{ color: '#94a3b8' }}>Şu an içeride kayıtlı kimse yok.</p>
      ) : (
        <table style={{ width: '100%', borderCollapse: 'collapse', background: '#fff', borderRadius: 8, overflow: 'hidden' }}>
          <thead>
            <tr style={{ background: '#f1f5f9', textAlign: 'left' }}>
              <th style={th}>Ad</th><th style={th}>Tür</th><th style={th}>Giriş</th>
            </tr>
          </thead>
          <tbody>
            {onCampus.map(p => (
              <tr key={`${p.holder_type}-${p.holder_id}`} style={{ borderTop: '1px solid #e2e8f0' }}>
                <td style={td}>{p.full_name || 'Bilinmiyor'}</td>
                <td style={td}>{HOLDER_LABEL[p.holder_type] || p.holder_type}</td>
                <td style={td}>{fmt(p.since)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  )
}

const th = { padding: '10px 14px', fontSize: 13, fontWeight: 600, color: '#475569' }
const td = { padding: '10px 14px', fontSize: 14 }

function StatCard({ label, value, color, hint }) {
  return (
    <div style={{ flex: '1 1 180px', background: '#fff', borderRadius: 12, padding: 18, borderLeft: `4px solid ${color}` }}>
      <div style={{ fontSize: 13, color: '#64748b' }}>{label}</div>
      <div style={{ fontSize: 32, fontWeight: 800, color }}>{value}</div>
      {hint && <div style={{ fontSize: 12, color: '#94a3b8' }}>{hint}</div>}
    </div>
  )
}

function AnomalyRow({ color, text, sub }) {
  return (
    <div style={{ background: '#fff', borderRadius: 8, padding: '10px 14px', marginBottom: 6, borderLeft: `4px solid ${color}` }}>
      <div style={{ fontWeight: 600, fontSize: 14 }}>{text}</div>
      <div style={{ fontSize: 12, color: '#94a3b8' }}>{sub}</div>
    </div>
  )
}
