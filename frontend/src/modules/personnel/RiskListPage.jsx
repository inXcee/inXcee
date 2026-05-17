import { useQuery } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import api from '../../shared/api/client.js'

export default function RiskListPage() {
  const nav = useNavigate()
  const { data = [], isLoading } = useQuery({
    queryKey: ['personnel-risk'],
    queryFn: () => api.get('/personnel/risk?limit=50').then(r => r.data),
  })

  return (
    <div style={{ maxWidth: 1280 }} className="fade-up">
      <div style={{ marginBottom: 20 }}>
        <h1 style={{ fontSize: 28, letterSpacing: 4, color: 'var(--text)', margin: 0 }}>RİSK LİSTESİ</h1>
        <p style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--text3)', marginTop: 4, letterSpacing: 1.5 }}>
          VARDİYA DEVAMSIZLIK · SERVİS NO-SHOW · DİSİPLİN · SÖZLEŞME BİTİYOR (skor toplam)
        </p>
      </div>

      {isLoading ? (
        <div style={{ padding: 40, color: 'var(--text3)' }}>Yükleniyor…</div>
      ) : !data.length ? (
        <div style={{ padding: 60, textAlign: 'center', background: 'var(--surface)', borderRadius: 14, border: '1px solid var(--border)' }}>
          <div style={{ fontSize: 40, opacity: 0.3, marginBottom: 10 }}>✓</div>
          <div style={{ fontFamily: 'var(--display)', fontSize: 14, letterSpacing: 2, marginBottom: 6 }}>RİSKLİ PERSONEL YOK</div>
          <div style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--text3)' }}>Tüm personel kabul edilir aralıkta</div>
        </div>
      ) : (
        <div style={{ background: 'var(--surface)', borderRadius: 14, border: '1px solid var(--border)', overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
            <thead>
              <tr style={{ background: 'var(--surface2)' }}>
                <th style={{ padding: 10, textAlign: 'left', fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--text3)' }}>SKOR</th>
                <th style={{ padding: 10, textAlign: 'left', fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--text3)' }}>PERSONEL</th>
                <th style={{ padding: 10, textAlign: 'left', fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--text3)' }}>DEPARTMAN</th>
                <th style={{ padding: 10, textAlign: 'left', fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--text3)' }}>FİRMA</th>
                <th style={{ padding: 10, textAlign: 'right', fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--red)' }}>VARDIYA✗</th>
                <th style={{ padding: 10, textAlign: 'right', fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--red)' }}>SERVİS✗</th>
                <th style={{ padding: 10, textAlign: 'right', fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--amber)' }}>DİSİPLİN</th>
                <th style={{ padding: 10, textAlign: 'center', fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--text3)' }}>SÖZ.</th>
              </tr>
            </thead>
            <tbody>
              {data.map(r => {
                const sev = r.risk_score > 15 ? 'var(--red)' : r.risk_score > 7 ? 'var(--amber)' : 'var(--text3)'
                return (
                  <tr key={r.id} onClick={() => nav(`/personnel/${r.id}`)} style={{ borderTop: '1px solid var(--border)', cursor: 'pointer', transition: 'background .15s' }}
                    onMouseEnter={e => e.currentTarget.style.background = 'var(--surface2)'}
                    onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                    <td style={{ padding: 10 }}>
                      <span style={{ fontFamily: 'var(--display)', fontSize: 18, color: sev, fontWeight: 700 }}>{r.risk_score}</span>
                    </td>
                    <td style={{ padding: 10 }}>
                      <strong>{r.full_name}</strong>
                      {r.phone && <div style={{ fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--text3)' }}>{r.phone}</div>}
                    </td>
                    <td style={{ padding: 10, fontFamily: 'var(--mono)', fontSize: 10, color: r.dept_color || 'var(--text)' }}>{r.dept_name || '—'}</td>
                    <td style={{ padding: 10, fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--text3)' }}>{r.company_name || '—'}</td>
                    <td style={{ padding: 10, textAlign: 'right', fontFamily: 'var(--mono)', fontWeight: 700, color: r.shift_absent > 0 ? 'var(--red)' : 'var(--text4)' }}>{r.shift_absent || 0}</td>
                    <td style={{ padding: 10, textAlign: 'right', fontFamily: 'var(--mono)', fontWeight: 700, color: r.transport_no_show > 0 ? 'var(--red)' : 'var(--text4)' }}>{r.transport_no_show || 0}</td>
                    <td style={{ padding: 10, textAlign: 'right', fontFamily: 'var(--mono)', fontWeight: 700, color: r.discipline_score > 0 ? 'var(--amber)' : 'var(--text4)' }}>{r.discipline_score || 0}</td>
                    <td style={{ padding: 10, textAlign: 'center' }}>
                      {r.contract_expiring ? <span title={`Bitiş: ${r.contract_end}`} style={{ color: 'var(--amber)' }}>⚠ {r.contract_end}</span> : <span style={{ color: 'var(--text4)' }}>—</span>}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      <div style={{ fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--text4)', marginTop: 14, padding: '0 4px' }}>
        Skor hesabı: vardiya devamsızlık×2 + servis no-show×1 + disiplin (kırmızı×3, sarı×1) + sözleşme 30g içinde bitiyorsa +5
      </div>
    </div>
  )
}
