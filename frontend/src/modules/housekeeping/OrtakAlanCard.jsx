// M bloklar için ortak alan (koridor · WC · banyo · merdiven) görev kartı.
// Tamamla / geri al / atla aksiyonları orkestratörden prop olarak gelir.
import { useState } from 'react'
import { SKIP_REASONS } from './shared.jsx'

export default function OrtakAlanCard({ task, onComplete, onUncomplete, onSkip }) {
  const [showSkip, setShowSkip] = useState(false)
  const [skipReason, setSkipReason] = useState('')
  const done    = !!task?.completed_at
  const skipped = task?.skipped === 1

  return (
    <div style={{
      borderRadius: '8px', marginBottom: '16px', overflow: 'hidden',
      border: `1px solid ${done ? 'rgba(39,201,106,.4)' : skipped ? 'var(--border2)' : 'rgba(59,140,240,.35)'}`,
      background: done ? 'rgba(39,201,106,.08)' : skipped ? 'rgba(61,78,106,.1)' : 'rgba(59,140,240,.06)',
    }}>
      {/* Top stripe */}
      <div style={{ height: '3px', background: done ? 'var(--green)' : skipped ? 'var(--border2)' : 'var(--blue)' }} />
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '12px 16px' }}>
        <div style={{
          width: '38px', height: '38px', borderRadius: '8px', flexShrink: 0,
          display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '20px',
          background: done ? 'rgba(39,201,106,.15)' : skipped ? 'rgba(61,78,106,.2)' : 'rgba(59,140,240,.12)',
        }}>
          {done ? '✅' : skipped ? '⊘' : '🏢'}
        </div>
        <div style={{ flex: 1 }}>
          <div style={{
            fontFamily: 'var(--display)', fontSize: '13px', letterSpacing: '2px',
            color: done ? 'var(--green)' : skipped ? 'var(--text3)' : 'var(--text)',
            textDecoration: skipped ? 'line-through' : 'none',
          }}>
            ORTAK ALAN — KORİDOR · WC · BANYO · MERDİVEN
          </div>
          <div style={{ fontFamily: 'var(--mono)', fontSize: '9px', color: 'var(--text3)', marginTop: '3px' }}>
            {done && task?.assignee_name && `✓ ${task.assignee_name} · ${new Date(task.completed_at).toLocaleTimeString('tr-TR', { hour:'2-digit', minute:'2-digit' })}`}
            {skipped && task?.skip_reason && `Atlandı: ${task.skip_reason}`}
            {!done && !skipped && 'Kat koridoru, WC ve banyo ortak alanlarını kapsar'}
          </div>
        </div>
        <div style={{ display: 'flex', gap: '6px', flexShrink: 0 }}>
          {!task && <span style={{ fontFamily: 'var(--mono)', fontSize: '9px', color: 'var(--text4)' }}>Görev yok</span>}
          {task && done && <button className="btn btn-ghost btn-xs" onClick={() => onUncomplete(task.id)}>↩ Geri Al</button>}
          {task && skipped && <button className="btn btn-ghost btn-xs" onClick={() => onSkip(task.id, null, true)}>↩ Geri Al</button>}
          {task && !done && !skipped && (
            <>
              <button className="btn btn-ghost btn-xs" onClick={() => setShowSkip(!showSkip)}>⊘ Atla</button>
              <button className="btn btn-primary btn-xs" onClick={() => onComplete(task.id, null)}>✓ Tamam</button>
            </>
          )}
        </div>
      </div>
      {showSkip && (
        <div style={{ padding: '10px 16px', borderTop: '1px solid var(--border)', background: 'var(--surface2)', display: 'flex', gap: '8px', alignItems: 'center' }}>
          <select className="form-select" style={{ flex: 1, fontSize: '12px', padding: '6px 10px' }}
            value={skipReason} onChange={e => setSkipReason(e.target.value)}>
            <option value="">Sebep seçin...</option>
            {SKIP_REASONS.map(r => <option key={r} value={r}>{r}</option>)}
          </select>
          <button className="btn btn-ghost btn-sm" onClick={() => { onSkip(task.id, skipReason); setShowSkip(false) }} disabled={!skipReason}>
            ⊘ Atla
          </button>
          <button className="btn btn-ghost btn-xs" onClick={() => setShowSkip(false)}>İptal</button>
        </div>
      )}
    </div>
  )
}
