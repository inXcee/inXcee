import { useQuery } from '@tanstack/react-query'
import api from '../../shared/api/client.js'
import HelpHint from '../../shared/components/HelpHint.jsx'

function StarBar({ value, max = 5 }) {
  if (value == null) return <span style={{ color: 'var(--text3)' }}>—</span>
  const pct = (value / max) * 100
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <div style={{ flex: 1, height: 6, background: 'var(--surface3)', borderRadius: 3, overflow: 'hidden' }}>
        <div style={{ width: `${pct}%`, height: '100%', background: value >= 4 ? 'var(--green, #22c55e)' : value >= 3 ? 'var(--orange, #f97316)' : 'var(--red, #ef4444)' }} />
      </div>
      <span style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--text)', width: 30 }}>{value}</span>
    </div>
  )
}

export default function SurveysPage() {
  const { data: stats } = useQuery({
    queryKey: ['survey-stats', 30],
    queryFn: () => api.get('/surveys/stats?days=30').then(r => r.data),
  })
  const { data: surveys = [] } = useQuery({
    queryKey: ['surveys'],
    queryFn: () => api.get('/surveys?limit=200').then(r => r.data),
  })

  const summary = stats?.summary || {}

  return (
    <div style={{ padding: 16 }}>
      <div style={{ marginBottom: 16 }}>
        <h2 style={{ fontSize: 22, letterSpacing: 4 }}>MEMNUNİYET ANKETİ<HelpHint topic="surveys" title="MEMNUNİYET ANKETİ" /></h2>
        <p style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--text3)', letterSpacing: 2 }}>
          SON 30 GUN — SAKIN GERIBILDIRIMI
        </p>
      </div>

      <div className="panel" style={{ marginBottom: 16 }}>
        <div style={{ height: 2, background: 'var(--accent)' }} />
        <div className="panel-header"><div className="panel-title">ORTALAMA PUANLAR (son 30 gün, {summary.total || 0} cevap)</div></div>
        <div className="panel-body">
          <div style={{ display: 'grid', gridTemplateColumns: '120px 1fr', gap: 12, alignItems: 'center' }}>
            <span>Oda</span><StarBar value={summary.avg_room} />
            <span>Temizlik</span><StarBar value={summary.avg_cleaning} />
            <span>Yemek</span><StarBar value={summary.avg_food} />
            <span>Çamaşır</span><StarBar value={summary.avg_laundry} />
            <span style={{ fontWeight: 600 }}>Genel</span><StarBar value={summary.avg_overall} />
          </div>
        </div>
      </div>

      <div className="panel">
        <div style={{ height: 2, background: 'var(--accent)' }} />
        <div className="panel-header"><div className="panel-title">CEVAPLAR ({surveys.length})</div></div>
        <div className="panel-body" style={{ padding: 0 }}>
          <div style={{ overflow: 'auto' }}>
            <table className="data-table" style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr>
                  <th style={{ textAlign: 'left', padding: 8 }}>Tarih</th>
                  <th style={{ textAlign: 'left', padding: 8 }}>Kişi</th>
                  <th style={{ textAlign: 'center', padding: 8 }}>Oda</th>
                  <th style={{ textAlign: 'center', padding: 8 }}>Tem.</th>
                  <th style={{ textAlign: 'center', padding: 8 }}>Yem.</th>
                  <th style={{ textAlign: 'center', padding: 8 }}>Çam.</th>
                  <th style={{ textAlign: 'center', padding: 8 }}>Genel</th>
                  <th style={{ textAlign: 'left', padding: 8 }}>Yorum</th>
                </tr>
              </thead>
              <tbody>
                {surveys.length === 0 && (
                  <tr><td colSpan={8} style={{ padding: 24, textAlign: 'center', color: 'var(--text3)' }}>Henüz cevap yok</td></tr>
                )}
                {surveys.map(s => (
                  <tr key={s.id} style={{ borderTop: '1px solid var(--border)' }}>
                    <td style={{ padding: 8, fontFamily: 'var(--mono)', fontSize: 11 }}>{new Date(s.created_at).toLocaleDateString('tr-TR')}</td>
                    <td style={{ padding: 8, fontSize: 12 }}>{s.personnel_name || <span style={{ color: 'var(--text3)' }}>anonim</span>}</td>
                    <td style={{ padding: 8, textAlign: 'center' }}>{s.room_score ?? '-'}</td>
                    <td style={{ padding: 8, textAlign: 'center' }}>{s.cleaning_score ?? '-'}</td>
                    <td style={{ padding: 8, textAlign: 'center' }}>{s.food_score ?? '-'}</td>
                    <td style={{ padding: 8, textAlign: 'center' }}>{s.laundry_score ?? '-'}</td>
                    <td style={{ padding: 8, textAlign: 'center', fontWeight: 600,
                      color: s.overall_score >= 4 ? 'var(--green, #22c55e)' : s.overall_score >= 3 ? 'var(--orange, #f97316)' : 'var(--red, #ef4444)'
                    }}>{s.overall_score ?? '-'}</td>
                    <td style={{ padding: 8, fontSize: 11, color: 'var(--text2)' }}>{s.comment || ''}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  )
}
