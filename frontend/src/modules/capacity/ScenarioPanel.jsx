import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import api from '../../shared/api/client.js'
import { allocateScenario } from './logic/whatIf.js'

// What-if senaryo paneli — "X kişi gelirse hangi bloklar dolar?"
// Veri: /dashboard/bed-occupancy (blok bazlı boş yatak). Mantık: logic/whatIf.js (saf).

const STRATEGIES = [
  ['fewest', 'En az blok', 'En boş bloktan başlar — yeni gelenler az sayıda bloğa toplanır'],
  ['balanced', 'Dengeli', 'En düşük doluluk oranlı bloktan başlar — yük dengelenir'],
]

export default function ScenarioPanel({ onClose }) {
  const [count, setCount] = useState('')
  const [strategy, setStrategy] = useState('fewest')

  const { data, isLoading } = useQuery({
    queryKey: ['bed-occupancy'],
    queryFn: () => api.get('/dashboard/bed-occupancy').then(r => r.data),
  })

  const n = parseInt(count, 10)
  const result = data && Number.isFinite(n) && n > 0
    ? allocateScenario(data.blocks, n, strategy)
    : null

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div onClick={onClose} style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,.6)' }} />
      <div style={{
        position: 'relative', width: '560px', maxHeight: '85vh', overflow: 'auto',
        background: 'var(--surface)', borderRadius: '12px', border: '1px solid var(--border)', padding: '20px',
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
          <h3 style={{ fontFamily: 'var(--display)', fontSize: '17px', letterSpacing: '2px', margin: 0 }}>
            🔮 WHAT-IF SENARYO
          </h3>
          <button onClick={onClose} aria-label="Kapat" style={{ background: 'none', border: 'none', color: 'var(--text3)', fontSize: '18px', cursor: 'pointer' }}>x</button>
        </div>
        <p style={{ fontSize: '11px', color: 'var(--text3)', marginBottom: '14px' }}>
          X kişi gelse hangi bloklara yerleşir? (anlık boş yatak verisiyle — atama YAPMAZ, sadece plan gösterir)
        </p>

        <div style={{ display: 'flex', gap: '10px', alignItems: 'flex-end', marginBottom: '12px', flexWrap: 'wrap' }}>
          <div>
            <label className="form-label">Gelecek kişi sayısı</label>
            <input type="number" min="1" className="form-input" value={count} autoFocus
              onChange={e => setCount(e.target.value)} placeholder="örn. 120" style={{ width: '140px' }} />
          </div>
          <div style={{ display: 'flex', gap: '6px' }}>
            {STRATEGIES.map(([key, label, hint]) => (
              <button key={key} title={hint} onClick={() => setStrategy(key)} className="btn btn-ghost btn-sm"
                style={{ borderRadius: 8, ...(strategy === key ? { background: 'var(--accent)', color: '#000' } : {}) }}>
                {label}
              </button>
            ))}
          </div>
        </div>

        {isLoading && <div style={{ padding: '20px', color: 'var(--text3)', fontSize: '12px' }}>Doluluk verisi yükleniyor…</div>}

        {data && !result && (
          <div style={{ fontSize: '12px', color: 'var(--text3)' }}>
            Şu an kampüste <strong style={{ color: 'var(--text)' }}>{data.totals.empty}</strong> boş yatak var
            ({data.totals.occupied}/{data.totals.total_beds} dolu, %{data.totals.pct}).
          </div>
        )}

        {result && (
          <>
            {/* Özet */}
            <div style={{ display: 'flex', gap: '8px', marginBottom: '12px', flexWrap: 'wrap' }}>
              <div style={{ flex: 1, minWidth: '100px', padding: '10px', background: 'rgba(16,185,129,.1)', border: '1px solid rgba(16,185,129,.3)', borderRadius: '6px', textAlign: 'center' }}>
                <div style={{ fontSize: '22px', fontWeight: 700, color: '#10b981' }}>{result.placed}</div>
                <div style={{ fontSize: '10px', color: 'var(--text2)' }}>YERLEŞİR</div>
              </div>
              <div style={{ flex: 1, minWidth: '100px', padding: '10px', background: result.shortfall > 0 ? 'rgba(239,68,68,.1)' : 'var(--surface2)', border: `1px solid ${result.shortfall > 0 ? 'rgba(239,68,68,.3)' : 'var(--border)'}`, borderRadius: '6px', textAlign: 'center' }}>
                <div style={{ fontSize: '22px', fontWeight: 700, color: result.shortfall > 0 ? '#ef4444' : 'var(--text2)' }}>{result.shortfall}</div>
                <div style={{ fontSize: '10px', color: 'var(--text2)' }}>YER YOK</div>
              </div>
              <div style={{ flex: 1, minWidth: '100px', padding: '10px', background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: '6px', textAlign: 'center' }}>
                <div style={{ fontSize: '22px', fontWeight: 700 }}>{result.blocksUsed}</div>
                <div style={{ fontSize: '10px', color: 'var(--text2)' }}>BLOK KULLANILIR</div>
              </div>
            </div>

            {result.shortfall > 0 && (
              <div className="alert alert-danger" style={{ fontSize: '12px', marginBottom: '10px' }}>
                <span>!</span>
                <span>{result.shortfall} kişiye yer YOK — kampüs boş yatak toplamı yetmiyor. Yatak açma (active_beds) ya da çıkış planlaması gerekir.</span>
              </div>
            )}

            {/* Yerleşim planı */}
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
              <thead>
                <tr style={{ background: 'var(--surface2)' }}>
                  <th style={{ padding: '6px 10px', textAlign: 'left', color: 'var(--text2)' }}>Blok</th>
                  <th style={{ padding: '6px 10px', textAlign: 'right', color: 'var(--text2)' }}>Yerleşen</th>
                  <th style={{ padding: '6px 10px', textAlign: 'right', color: 'var(--text2)' }}>Boş (önce)</th>
                  <th style={{ padding: '6px 10px', textAlign: 'right', color: 'var(--text2)' }}>Boş (sonra)</th>
                </tr>
              </thead>
              <tbody>
                {result.allocations.map(a => (
                  <tr key={a.block} style={{ borderTop: '1px solid var(--border)' }}>
                    <td style={{ padding: '6px 10px', fontWeight: 600 }}>{a.block}</td>
                    <td style={{ padding: '6px 10px', textAlign: 'right', color: '#10b981', fontWeight: 600 }}>+{a.take}</td>
                    <td style={{ padding: '6px 10px', textAlign: 'right', color: 'var(--text3)' }}>{a.emptyBefore}</td>
                    <td style={{ padding: '6px 10px', textAlign: 'right', color: a.emptyAfter === 0 ? 'var(--red)' : 'var(--text2)' }}>
                      {a.emptyAfter}{a.emptyAfter === 0 && ' (DOLDU)'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </>
        )}
      </div>
    </div>
  )
}
