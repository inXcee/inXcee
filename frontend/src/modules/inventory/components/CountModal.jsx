import { useState, useRef, useEffect } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import api from '../../../shared/api/client.js'
import { CATEGORIES, cat } from '../constants.js'

export default function CountModal({ items, onClose }) {
  const qc = useQueryClient()
  const [catF, setCatF] = useState('')
  const [mode, setMode] = useState('step') // 'step' | 'list'
  const [counts, setCounts] = useState(() => Object.fromEntries(items.map(i => [i.id, i.quantity])))
  const [result, setResult] = useState(null)
  const [stepIdx, setStepIdx] = useState(0)
  const refs = useRef({})
  const stepInputRef = useRef(null)

  const filtered = catF ? items.filter(i => i.category === catF) : items
  const changed = items.filter(i => counts[i.id] !== i.quantity)

  useEffect(() => { setStepIdx(0) }, [catF])
  useEffect(() => { stepInputRef.current?.focus(); stepInputRef.current?.select() }, [stepIdx, mode])

  const mut = useMutation({
    mutationFn: d => api.post('/inventory/bulk-count', { items: d }).then(r => r.data),
    onSuccess: d => { setResult(d); qc.invalidateQueries() },
  })

  const handleKey = (e, idx) => {
    if (e.key === 'Enter' || e.key === 'ArrowDown') { e.preventDefault(); const nxt = filtered[idx + 1]; if (nxt) refs.current[nxt.id]?.focus() }
    if (e.key === 'ArrowUp') { e.preventDefault(); const prev = filtered[idx - 1]; if (prev) refs.current[prev.id]?.focus() }
  }

  const stepItem = filtered[stepIdx]
  const stepDiff = stepItem ? counts[stepItem.id] - stepItem.quantity : 0
  const progress = filtered.length > 0 ? ((stepIdx + 1) / filtered.length) * 100 : 0
  const ct = stepItem ? cat(stepItem.category) : null

  const goNext = () => { if (stepIdx < filtered.length - 1) setStepIdx(stepIdx + 1) }
  const goPrev = () => { if (stepIdx > 0) setStepIdx(stepIdx - 1) }

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div onClick={onClose} style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,.6)' }} />
      <div className="fade-up" style={{ position: 'relative', width: '720px', maxWidth: '95vw', maxHeight: '90vh', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '16px', display: 'flex', flexDirection: 'column', overflow: 'hidden', boxShadow: '0 24px 48px rgba(0,0,0,.25)' }}>
        <div style={{ height: '3px', background: 'linear-gradient(90deg,var(--teal),var(--green))' }} />

        <div style={{ padding: '18px 22px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <div>
            <div style={{ fontFamily: 'var(--display)', fontSize: '17px', letterSpacing: '2px' }}>STOK SAYIMI</div>
            <div style={{ fontFamily: 'var(--mono)', fontSize: '9px', color: 'var(--text3)', marginTop: '3px' }}>
              {filtered.length} ürün · {changed.length} değişiklik
            </div>
          </div>
          <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
            {!result && (
              <div style={{ display: 'flex', background: 'var(--surface2)', borderRadius: 8, padding: 2 }}>
                <button onClick={() => setMode('step')} style={{
                  padding: '5px 10px', border: 'none', borderRadius: 6, cursor: 'pointer',
                  fontSize: 10, fontFamily: 'var(--mono)', fontWeight: 700, letterSpacing: 1,
                  background: mode === 'step' ? 'var(--accent)' : 'transparent',
                  color: mode === 'step' ? '#000' : 'var(--text3)',
                }}>ADIM</button>
                <button onClick={() => setMode('list')} style={{
                  padding: '5px 10px', border: 'none', borderRadius: 6, cursor: 'pointer',
                  fontSize: 10, fontFamily: 'var(--mono)', fontWeight: 700, letterSpacing: 1,
                  background: mode === 'list' ? 'var(--accent)' : 'transparent',
                  color: mode === 'list' ? '#000' : 'var(--text3)',
                }}>LİSTE</button>
              </div>
            )}
            <button onClick={onClose} style={{ background: 'var(--surface2)', border: '1px solid var(--border)', color: 'var(--text3)', width: '28px', height: '28px', borderRadius: '8px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '13px' }}>✕</button>
          </div>
        </div>

        {!result && (
          <div style={{ padding: '12px 22px', borderBottom: '1px solid var(--border)', display: 'flex', gap: '5px', flexWrap: 'wrap' }}>
            <button onClick={() => setCatF('')} className={`btn btn-xs ${!catF ? 'btn-primary' : 'btn-ghost'}`} style={{ borderRadius: '8px' }}>TÜMÜ</button>
            {CATEGORIES.map(c => (
              <button key={c.key} onClick={() => setCatF(c.key)}
                className={`btn btn-xs ${catF === c.key ? 'btn-primary' : 'btn-ghost'}`}
                style={{ borderRadius: '8px', ...(catF === c.key ? { background: c.color, borderColor: c.color } : {}) }}>
                {c.icon} {c.label}
              </button>
            ))}
          </div>
        )}

        <div style={{ flex: 1, overflow: 'auto' }}>
          {result ? (
            <div style={{ padding: '28px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '14px' }}>
              <div style={{ width: '56px', height: '56px', borderRadius: '50%', background: 'rgba(39,201,106,.08)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '24px', color: 'var(--green)' }}>✓</div>
              <div style={{ fontFamily: 'var(--display)', fontSize: '17px', letterSpacing: '1px' }}>SAYIM TAMAMLANDI</div>
              <div style={{ fontFamily: 'var(--mono)', fontSize: '11px', color: 'var(--text3)' }}>{result.updated} güncellendi · {result.skipped || 0} değişmedi</div>
              {result.errors?.length > 0 && <div className="alert alert-danger"><span>!</span><span>{result.errors.join(', ')}</span></div>}
              <button className="btn btn-ghost" onClick={onClose} style={{ borderRadius: '10px' }}>KAPAT</button>
            </div>
          ) : mode === 'step' ? (
            stepItem ? (
              <div style={{ padding: '24px 22px', display: 'flex', flexDirection: 'column', gap: 16 }}>
                {/* Progress */}
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--text3)', letterSpacing: 1, marginBottom: 4 }}>
                    <span>{stepIdx + 1} / {filtered.length}</span>
                    <span>{Math.round(progress)}%</span>
                  </div>
                  <div style={{ height: 4, background: 'var(--surface2)', borderRadius: 2, overflow: 'hidden' }}>
                    <div style={{ width: `${progress}%`, height: '100%', background: 'linear-gradient(90deg,var(--teal),var(--green))', transition: 'width .2s' }} />
                  </div>
                </div>

                {/* Item card */}
                <div style={{ textAlign: 'center', padding: '12px 0' }}>
                  <div style={{ fontSize: 22, color: ct?.color || 'var(--text3)', marginBottom: 4 }}>{ct?.icon || '▨'}</div>
                  <div style={{ fontSize: 20, fontWeight: 700, color: 'var(--text)' }}>{stepItem.item_name}</div>
                  <div style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--text3)', letterSpacing: 1, marginTop: 4 }}>
                    {ct?.label || '-'} · {stepItem.location || 'Lokasyon yok'}
                  </div>
                </div>

                {/* System vs counted */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                  <div style={{ padding: 14, background: 'var(--surface2)', borderRadius: 10, textAlign: 'center', border: '1px solid var(--border)' }}>
                    <div style={{ fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--text3)', letterSpacing: 1.5 }}>SİSTEMDE</div>
                    <div style={{ fontSize: 28, fontWeight: 700, fontFamily: 'var(--mono)', marginTop: 4, color: 'var(--text2)' }}>
                      {stepItem.quantity} <span style={{ fontSize: 12, color: 'var(--text3)', fontWeight: 400 }}>{stepItem.unit}</span>
                    </div>
                  </div>
                  <div style={{
                    padding: 14, borderRadius: 10, textAlign: 'center',
                    background: stepDiff > 0 ? 'rgba(39,201,106,.06)' : stepDiff < 0 ? 'rgba(239,68,68,.06)' : 'rgba(39,201,106,.04)',
                    border: `1px solid ${stepDiff > 0 ? 'rgba(39,201,106,.35)' : stepDiff < 0 ? 'rgba(239,68,68,.35)' : 'rgba(39,201,106,.2)'}`,
                  }}>
                    <div style={{ fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--text3)', letterSpacing: 1.5 }}>SAYIM</div>
                    <input ref={stepInputRef} type="number" min="0" step="any"
                      value={counts[stepItem.id]}
                      onChange={e => setCounts(p => ({ ...p, [stepItem.id]: e.target.value === '' ? 0 : +e.target.value }))}
                      onFocus={e => e.target.select()}
                      onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); goNext() } }}
                      style={{
                        width: '100%', textAlign: 'center', fontFamily: 'var(--mono)', fontWeight: 700,
                        fontSize: 28, padding: '4px 0', marginTop: 2,
                        background: 'transparent', border: 'none', outline: 'none',
                        color: stepDiff > 0 ? 'var(--green)' : stepDiff < 0 ? 'var(--red)' : 'var(--text)',
                      }} />
                  </div>
                </div>

                {/* Quick actions */}
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', justifyContent: 'center' }}>
                  <button onClick={() => setCounts(p => ({ ...p, [stepItem.id]: stepItem.quantity }))}
                    className="btn btn-ghost btn-sm" style={{ borderRadius: 8 }}>= Sistem ({stepItem.quantity})</button>
                  <button onClick={() => setCounts(p => ({ ...p, [stepItem.id]: Math.max(0, +(p[stepItem.id] || 0) - 1) }))}
                    className="btn btn-ghost btn-sm" style={{ borderRadius: 8, color: 'var(--red)' }}>−1</button>
                  <button onClick={() => setCounts(p => ({ ...p, [stepItem.id]: +(p[stepItem.id] || 0) + 1 }))}
                    className="btn btn-ghost btn-sm" style={{ borderRadius: 8, color: 'var(--green)' }}>+1</button>
                  <button onClick={() => setCounts(p => ({ ...p, [stepItem.id]: 0 }))}
                    className="btn btn-ghost btn-sm" style={{ borderRadius: 8, color: 'var(--text3)' }}>SIFIRLA</button>
                </div>

                {/* Diff display */}
                {stepDiff !== 0 && (
                  <div style={{
                    textAlign: 'center', padding: '6px 12px', borderRadius: 8,
                    background: stepDiff > 0 ? 'rgba(39,201,106,.06)' : 'rgba(239,68,68,.06)',
                    color: stepDiff > 0 ? 'var(--green)' : 'var(--red)',
                    fontFamily: 'var(--mono)', fontSize: 11, fontWeight: 700,
                  }}>
                    FARK: {stepDiff > 0 ? '+' : ''}{stepDiff} {stepItem.unit}
                  </div>
                )}

                {/* Nav */}
                <div style={{ display: 'flex', gap: 8, justifyContent: 'space-between', marginTop: 6 }}>
                  <button onClick={goPrev} disabled={stepIdx === 0}
                    className="btn btn-ghost" style={{ borderRadius: 10, flex: 1, opacity: stepIdx === 0 ? 0.4 : 1 }}>← ÖNCEKİ</button>
                  <button onClick={goNext} disabled={stepIdx === filtered.length - 1}
                    className="btn btn-primary" style={{ borderRadius: 10, flex: 2, opacity: stepIdx === filtered.length - 1 ? 0.6 : 1 }}>
                    SONRAKİ →
                  </button>
                </div>
              </div>
            ) : (
              <div style={{ padding: 40, textAlign: 'center', color: 'var(--text3)', fontFamily: 'var(--mono)' }}>Kategoride ürün yok</div>
            )
          ) : (
            <table className="data-table" style={{ margin: 0 }}>
              <thead><tr><th>#</th><th>ÜRÜN</th><th>KAT.</th><th>SİSTEM</th><th style={{ width: '110px' }}>SAYIM</th><th>FARK</th></tr></thead>
              <tbody>
                {filtered.map((item, idx) => {
                  const diff = counts[item.id] - item.quantity
                  const ct2 = cat(item.category)
                  return (
                    <tr key={item.id} style={{ background: diff > 0 ? 'rgba(39,201,106,.03)' : diff < 0 ? 'rgba(231,76,60,.03)' : undefined }}>
                      <td style={{ fontFamily: 'var(--mono)', fontSize: '10px', color: 'var(--text4)' }}>{idx + 1}</td>
                      <td style={{ fontWeight: 500, fontSize: '12px' }}>{item.item_name}</td>
                      <td><span style={{ fontSize: '12px' }}>{ct2?.icon}</span></td>
                      <td style={{ fontFamily: 'var(--mono)', color: 'var(--text3)' }}>{item.quantity} <span style={{ fontSize: '9px' }}>{item.unit}</span></td>
                      <td>
                        <input ref={el => refs.current[item.id] = el}
                          className="form-input" type="number" min="0" step="any"
                          value={counts[item.id]} onChange={e => setCounts(p => ({ ...p, [item.id]: +e.target.value }))}
                          onFocus={e => e.target.select()} onKeyDown={e => handleKey(e, idx)}
                          style={{ width: '100%', textAlign: 'center', fontFamily: 'var(--mono)', fontWeight: 700, fontSize: '13px', borderRadius: '8px',
                            borderColor: diff !== 0 ? (diff > 0 ? 'rgba(39,201,106,.5)' : 'rgba(231,76,60,.5)') : undefined }} />
                      </td>
                      <td style={{ fontFamily: 'var(--mono)', fontWeight: 700, textAlign: 'center',
                        color: diff > 0 ? 'var(--green)' : diff < 0 ? 'var(--red)' : 'var(--text4)' }}>
                        {diff !== 0 ? (diff > 0 ? `+${diff}` : diff) : '-'}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          )}
        </div>

        {!result && (
          <div style={{ padding: '14px 22px', borderTop: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10 }}>
            <span style={{ fontFamily: 'var(--mono)', fontSize: '10px', color: changed.length > 0 ? 'var(--accent)' : 'var(--text4)' }}>
              {changed.length > 0 ? changed.slice(0, 3).map(i => `${i.item_name}: ${i.quantity}→${counts[i.id]}`).join(' · ') : 'Değişiklik yok'}
              {changed.length > 3 ? ` +${changed.length - 3}` : ''}
            </span>
            <button className="btn btn-primary" disabled={changed.length === 0 || mut.isPending}
              onClick={() => mut.mutate(changed.map(i => ({ id: i.id, counted_qty: counts[i.id] })))} style={{ borderRadius: '10px' }}>
              {mut.isPending ? '...' : `${changed.length} KAYDET`}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
