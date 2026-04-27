import { useState, useRef } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import api from '../../../shared/api/client.js'
import { CATEGORIES, cat } from '../constants.js'

export default function CountModal({ items, onClose }) {
  const qc = useQueryClient()
  const [catF, setCatF] = useState('')
  const [counts, setCounts] = useState(() => Object.fromEntries(items.map(i => [i.id, i.quantity])))
  const [result, setResult] = useState(null)
  const refs = useRef({})

  const filtered = catF ? items.filter(i => i.category === catF) : items
  const changed = items.filter(i => counts[i.id] !== i.quantity)

  const mut = useMutation({
    mutationFn: d => api.post('/inventory/bulk-count', { items: d }).then(r => r.data),
    onSuccess: d => { setResult(d); qc.invalidateQueries() },
  })

  const handleKey = (e, idx) => {
    if (e.key === 'Enter' || e.key === 'ArrowDown') { e.preventDefault(); const nxt = filtered[idx + 1]; if (nxt) refs.current[nxt.id]?.focus() }
    if (e.key === 'ArrowUp') { e.preventDefault(); const prev = filtered[idx - 1]; if (prev) refs.current[prev.id]?.focus() }
  }

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div onClick={onClose} style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,.6)' }} />
      <div className="fade-up" style={{ position: 'relative', width: '720px', maxWidth: '95vw', maxHeight: '90vh', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '16px', display: 'flex', flexDirection: 'column', overflow: 'hidden', boxShadow: '0 24px 48px rgba(0,0,0,.25)' }}>
        <div style={{ height: '3px', background: 'linear-gradient(90deg,var(--teal),var(--green))' }} />

        <div style={{ padding: '18px 22px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <div style={{ fontFamily: 'var(--display)', fontSize: '17px', letterSpacing: '2px' }}>STOK SAYIMI</div>
            <div style={{ fontFamily: 'var(--mono)', fontSize: '9px', color: 'var(--text3)', marginTop: '3px' }}>
              {filtered.length} urun · {changed.length} degisiklik · Enter ile gecis
            </div>
          </div>
          <button onClick={onClose} style={{ background: 'var(--surface2)', border: '1px solid var(--border)', color: 'var(--text3)', width: '28px', height: '28px', borderRadius: '8px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '13px' }}>✕</button>
        </div>

        <div style={{ padding: '12px 22px', borderBottom: '1px solid var(--border)', display: 'flex', gap: '5px', flexWrap: 'wrap' }}>
          <button onClick={() => setCatF('')} className={`btn btn-xs ${!catF ? 'btn-primary' : 'btn-ghost'}`} style={{ borderRadius: '8px' }}>TUMU</button>
          {CATEGORIES.map(c => (
            <button key={c.key} onClick={() => setCatF(c.key)}
              className={`btn btn-xs ${catF === c.key ? 'btn-primary' : 'btn-ghost'}`}
              style={{ borderRadius: '8px', ...(catF === c.key ? { background: c.color, borderColor: c.color } : {}) }}>
              {c.icon} {c.label}
            </button>
          ))}
        </div>

        <div style={{ flex: 1, overflow: 'auto' }}>
          {result ? (
            <div style={{ padding: '28px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '14px' }}>
              <div style={{ width: '56px', height: '56px', borderRadius: '50%', background: 'rgba(39,201,106,.08)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '24px', color: 'var(--green)' }}>✓</div>
              <div style={{ fontFamily: 'var(--display)', fontSize: '17px', letterSpacing: '1px' }}>SAYIM TAMAMLANDI</div>
              <div style={{ fontFamily: 'var(--mono)', fontSize: '11px', color: 'var(--text3)' }}>{result.updated} guncellendi · {result.skipped || 0} degismedi</div>
              {result.errors?.length > 0 && <div className="alert alert-danger"><span>!</span><span>{result.errors.join(', ')}</span></div>}
              <button className="btn btn-ghost" onClick={onClose} style={{ borderRadius: '10px' }}>KAPAT</button>
            </div>
          ) : (
            <table className="data-table" style={{ margin: 0 }}>
              <thead><tr><th>#</th><th>URUN</th><th>KAT.</th><th>SISTEM</th><th style={{ width: '110px' }}>SAYIM</th><th>FARK</th></tr></thead>
              <tbody>
                {filtered.map((item, idx) => {
                  const diff = counts[item.id] - item.quantity
                  const ct = cat(item.category)
                  return (
                    <tr key={item.id} style={{ background: diff > 0 ? 'rgba(39,201,106,.03)' : diff < 0 ? 'rgba(231,76,60,.03)' : undefined }}>
                      <td style={{ fontFamily: 'var(--mono)', fontSize: '10px', color: 'var(--text4)' }}>{idx + 1}</td>
                      <td style={{ fontWeight: 500, fontSize: '12px' }}>{item.item_name}</td>
                      <td><span style={{ fontSize: '12px' }}>{ct?.icon}</span></td>
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
          <div style={{ padding: '14px 22px', borderTop: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontFamily: 'var(--mono)', fontSize: '10px', color: changed.length > 0 ? 'var(--accent)' : 'var(--text4)' }}>
              {changed.length > 0 ? changed.slice(0, 3).map(i => `${i.item_name}: ${i.quantity}→${counts[i.id]}`).join(' · ') : 'Degisiklik yok'}
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
