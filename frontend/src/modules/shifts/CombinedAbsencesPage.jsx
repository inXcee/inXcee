import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import api from '../../shared/api/client.js'
import { SkeletonTable } from '../../shared/components/Skeleton.jsx'

export default function CombinedAbsencesPage() {
  const nav = useNavigate()
  const today = new Date().toISOString().slice(0, 10)
  const ago30 = new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10)
  const [start, setStart] = useState(ago30)
  const [end, setEnd] = useState(today)

  const { data = [], isLoading } = useQuery({
    queryKey: ['combined-absences', start, end],
    queryFn: () => api.get(`/shifts/combined-absences?start=${start}&end=${end}`).then(r => r.data),
  })

  return (
    <div style={{ maxWidth: 1100 }} className="fade-up">
      <div style={{ marginBottom: 20, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', gap: 10, flexWrap: 'wrap' }}>
        <div>
          <h1 style={{ fontSize: 28, letterSpacing: 4, color: 'var(--text)', margin: 0 }}>DEVAMSIZLIK</h1>
          <p style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--text3)', marginTop: 4, letterSpacing: 1.5 }}>
            VARDİYA "YOK" + SERVİS BİNMEDİ — BİRLEŞİK TABLO
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <input type="date" className="form-input" value={start} onChange={e => setStart(e.target.value)} style={{ width: 'auto', fontSize: 12 }} />
          <span style={{ color: 'var(--text3)' }}>→</span>
          <input type="date" className="form-input" value={end} onChange={e => setEnd(e.target.value)} style={{ width: 'auto', fontSize: 12 }} />
        </div>
      </div>

      {isLoading ? (
        <SkeletonTable rows={5} cols={4} />
      ) : !data.length ? (
        <div style={{ padding: 60, textAlign: 'center', background: 'var(--surface)', borderRadius: 14, border: '1px solid var(--border)' }}>
          <div style={{ fontSize: 40, opacity: 0.3, marginBottom: 10 }}>✓</div>
          <div style={{ fontFamily: 'var(--display)', fontSize: 14, letterSpacing: 2 }}>BU TARİHTE DEVAMSIZLIK YOK</div>
        </div>
      ) : (
        <div style={{ background: 'var(--surface)', borderRadius: 14, border: '1px solid var(--border)', overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
            <thead>
              <tr style={{ background: 'var(--surface2)' }}>
                <th style={{ padding: 10, textAlign: 'left', fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--text3)' }}>PERSONEL</th>
                <th style={{ padding: 10, textAlign: 'left', fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--text3)' }}>DEPARTMAN</th>
                <th style={{ padding: 10, textAlign: 'right', fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--red)' }}>VARDIYA "YOK"</th>
                <th style={{ padding: 10, textAlign: 'right', fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--red)' }}>SERVİS BİNMEDİ</th>
                <th style={{ padding: 10, textAlign: 'right', fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--green)' }}>ÇALIŞTI</th>
                <th style={{ padding: 10, textAlign: 'right', fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--amber)' }}>SKOR</th>
              </tr>
            </thead>
            <tbody>
              {data.map(r => {
                const score = r.shift_absent * 2 + r.transport_no_show
                return (
                  <tr key={r.id} onClick={() => nav(`/personnel/${r.id}`)} style={{ borderTop: '1px solid var(--border)', cursor: 'pointer' }}
                    onMouseEnter={e => e.currentTarget.style.background = 'var(--surface2)'}
                    onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                    <td style={{ padding: 10 }}>
                      <strong>{r.full_name}</strong>
                      {r.phone && <div style={{ fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--text3)' }}>{r.phone}</div>}
                    </td>
                    <td style={{ padding: 10, fontFamily: 'var(--mono)', fontSize: 10, color: r.dept_color || 'var(--text3)' }}>{r.dept_name || '—'}</td>
                    <td style={{ padding: 10, textAlign: 'right', fontFamily: 'var(--mono)', fontWeight: 700, color: r.shift_absent > 0 ? 'var(--red)' : 'var(--text4)' }}>{r.shift_absent}</td>
                    <td style={{ padding: 10, textAlign: 'right', fontFamily: 'var(--mono)', fontWeight: 700, color: r.transport_no_show > 0 ? 'var(--red)' : 'var(--text4)' }}>{r.transport_no_show}</td>
                    <td style={{ padding: 10, textAlign: 'right', fontFamily: 'var(--mono)', color: 'var(--green)' }}>{r.worked}</td>
                    <td style={{ padding: 10, textAlign: 'right', fontFamily: 'var(--display)', fontSize: 16, color: score > 10 ? 'var(--red)' : score > 5 ? 'var(--amber)' : 'var(--text3)', fontWeight: 700 }}>{score}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      <div style={{ marginTop: 14, fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--text4)' }}>
        Skor: vardiya "yok" × 2 + servis binmedi × 1. Yüksek skor = takip gerek.
      </div>
    </div>
  )
}
