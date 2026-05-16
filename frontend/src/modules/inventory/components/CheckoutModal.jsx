import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import api from '../../../shared/api/client.js'
import Modal from './Modal.jsx'

export default function CheckoutModal({ item, onClose }) {
  const qc = useQueryClient()
  const inv = () => { qc.invalidateQueries({ queryKey: ['inventory'] }); qc.invalidateQueries({ queryKey: ['inventory-stats'] }); qc.invalidateQueries({ queryKey: ['checkouts-active'] }); qc.invalidateQueries({ queryKey: ['stock-by-location'] }) }
  const [step, setStep] = useState(0)
  const [personQ, setPersonQ] = useState('')
  const [person, setPerson] = useState(null)
  const [qty, setQty] = useState(1)
  const [note, setNote] = useState('')
  const [fromLocationId, setFromLocationId] = useState('')

  const { data: locationStock = [] } = useQuery({
    queryKey: ['stock-by-location', item.id],
    queryFn: () => api.get(`/inventory/${item.id}/stock-by-location`).then(r => r.data),
    enabled: !!item.track_locations,
  })
  const fromQty = item.track_locations && fromLocationId
    ? (locationStock.find(s => s.location_id === +fromLocationId)?.quantity || 0)
    : item.quantity
  const maxQty = item.track_locations ? fromQty : item.quantity

  const { data: results = [] } = useQuery({
    queryKey: ['inv-person-search', personQ],
    queryFn: () => api.get(`/inventory/personnel/search?q=${personQ}`).then(r => r.data),
    enabled: personQ.length >= 2,
  })

  const mut = useMutation({
    mutationFn: d => api.post('/inventory/checkout', d),
    onSuccess: () => { inv(); setStep(2) },
  })

  return (
    <Modal onClose={onClose} title="MALZEME TESLIM" sub={item.item_name} color="var(--blue),var(--teal)">
      {/* Step indicator */}
      <div style={{ display: 'flex', gap: '0', marginBottom: '20px' }}>
        {['PERSONEL', 'MIKTAR', 'TAMAM'].map((s, i) => (
          <div key={s} style={{ flex: 1, display: 'flex', alignItems: 'center' }}>
            <div style={{ flex: 1, textAlign: 'center' }}>
              <div style={{
                width: '28px', height: '28px', borderRadius: '50%', margin: '0 auto 4px',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontFamily: 'var(--mono)', fontSize: '10px', fontWeight: 700,
                background: step >= i ? (step === i ? 'var(--accent)' : 'var(--green)') : 'var(--surface3)',
                color: step >= i ? '#000' : 'var(--text3)',
                transition: 'all .3s',
              }}>{step > i ? '✓' : i + 1}</div>
              <div style={{ fontFamily: 'var(--mono)', fontSize: '8px', letterSpacing: '1px', color: step === i ? 'var(--accent)' : 'var(--text4)' }}>{s}</div>
            </div>
            {i < 2 && <div style={{ width: '24px', height: '2px', borderRadius: '1px', background: step > i ? 'var(--green)' : 'var(--border)', transition: 'background .3s' }} />}
          </div>
        ))}
      </div>

      {/* Step 0: Person search */}
      {step === 0 && (
        <div>
          <label className="form-label">Personel Ara</label>
          <input className="form-input" value={personQ} onChange={e => setPersonQ(e.target.value)}
            placeholder="Ad, firma veya telefon..." autoFocus style={{ borderRadius: '10px' }} />
          <div style={{ maxHeight: '240px', overflow: 'auto', marginTop: '10px' }}>
            {results.map(p => (
              <div key={p.id} onClick={() => { setPerson(p); setStep(1) }} style={{
                padding: '12px 14px', cursor: 'pointer', borderRadius: '10px', marginBottom: '5px',
                border: '1px solid var(--border)', transition: 'all 0.15s',
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              }}
                onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--accent)'; e.currentTarget.style.background = 'rgba(240,165,0,.03)' }}
                onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.background = 'transparent' }}>
                <div>
                  <div style={{ fontWeight: 600, fontSize: '13px' }}>{p.full_name}</div>
                  <div style={{ fontFamily: 'var(--mono)', fontSize: '9px', color: 'var(--text3)' }}>{p.company || '-'} · {p.job_title || '-'}</div>
                </div>
                {p.block && <span style={{ fontFamily: 'var(--mono)', fontSize: '10px', color: 'var(--accent)', background: 'rgba(240,165,0,.06)', padding: '3px 8px', borderRadius: '6px', fontWeight: 600 }}>{p.block}-{p.room_no}</span>}
              </div>
            ))}
            {personQ.length >= 2 && results.length === 0 && (
              <div style={{ textAlign: 'center', padding: '20px', fontFamily: 'var(--mono)', fontSize: '10px', color: 'var(--text3)' }}>Sonuc bulunamadi</div>
            )}
          </div>
        </div>
      )}

      {/* Step 1: Quantity */}
      {step === 1 && (
        <div>
          <div style={{ padding: '12px 14px', background: 'var(--surface2)', borderRadius: '10px', border: '1px solid var(--border)', marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div style={{ width: '36px', height: '36px', borderRadius: '10px', background: 'rgba(52,152,219,.08)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '14px', flexShrink: 0 }}>👤</div>
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 600 }}>{person?.full_name}</div>
              <div style={{ fontFamily: 'var(--mono)', fontSize: '9px', color: 'var(--text3)' }}>{person?.company || '-'} {person?.block ? `· ${person.block}-${person.room_no}` : ''}</div>
            </div>
            <button className="btn btn-ghost btn-xs" onClick={() => setStep(0)} style={{ borderRadius: '8px' }}>degistir</button>
          </div>

          {item.track_locations && (
            <div style={{ marginBottom: 14, padding: '10px 12px', background: 'rgba(52,152,219,.04)', borderRadius: 10, border: '1px solid rgba(52,152,219,.25)' }}>
              <label style={{ fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--blue)', letterSpacing: 1.5, display: 'block', marginBottom: 5 }}>📍 KAYNAK LOKASYON *</label>
              <select className="form-select" value={fromLocationId} onChange={e => setFromLocationId(e.target.value)} style={{ borderRadius: 8, fontSize: 12 }}>
                <option value="">Seç...</option>
                {locationStock.filter(s => s.quantity > 0 && s.is_active).map(s => (
                  <option key={s.location_id} value={s.location_id}>
                    {s.block ? `[${s.block}] ` : ''}{s.name} — {s.quantity} {item.unit}
                  </option>
                ))}
              </select>
            </div>
          )}

          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '14px', marginBottom: '16px' }}>
            <button onClick={() => setQty(Math.max(1, qty - 1))} style={{
              width: '40px', height: '40px', borderRadius: '12px', border: '1px solid var(--border)',
              background: 'var(--surface2)', color: 'var(--text)', fontSize: '18px', cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'all .15s',
            }}>-</button>
            <input className="form-input" type="number" min="1" max={maxQty} value={qty}
              onChange={e => setQty(Math.max(1, Math.min(maxQty, +e.target.value)))}
              style={{ width: '100px', textAlign: 'center', fontFamily: 'var(--display)', fontSize: '30px', letterSpacing: '2px', borderRadius: '12px' }} />
            <button onClick={() => setQty(Math.min(maxQty, qty + 1))} style={{
              width: '40px', height: '40px', borderRadius: '12px', border: '1px solid var(--border)',
              background: 'var(--surface2)', color: 'var(--text)', fontSize: '18px', cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'all .15s',
            }}>+</button>
          </div>
          <div style={{ textAlign: 'center', fontFamily: 'var(--mono)', fontSize: '11px', color: 'var(--text3)', marginBottom: '16px', padding: '8px', background: 'var(--surface2)', borderRadius: '8px' }}>
            {item.track_locations ? 'Lokasyon stoku' : 'Stok'}: {maxQty} {item.unit} → sonra: <strong style={{ color: 'var(--accent)' }}>{maxQty - qty}</strong> {item.unit}
          </div>

          <input className="form-input" value={note} onChange={e => setNote(e.target.value)} placeholder="Not (opsiyonel)..." style={{ marginBottom: '16px', borderRadius: '10px' }} />

          {mut.isError && <div className="alert alert-danger" style={{ marginBottom: '12px', borderRadius: '10px' }}><span>!</span><span>{mut.error?.response?.data?.error || 'Hata'}</span></div>}

          <button className="btn btn-primary" style={{ width: '100%', justifyContent: 'center', padding: '14px', borderRadius: '10px', fontSize: '12px' }}
            disabled={mut.isPending || (item.track_locations && !fromLocationId)}
            onClick={() => mut.mutate({ item_id: item.id, personnel_id: person.id, quantity: qty, note, from_location_id: fromLocationId ? +fromLocationId : undefined })}>
            {mut.isPending ? 'KAYDEDILIYOR...' : `${qty} ${item.unit} TESLIM ET`}
          </button>
        </div>
      )}

      {/* Step 2: Done */}
      {step === 2 && (
        <div style={{ textAlign: 'center', padding: '14px 0' }}>
          <div style={{ width: '56px', height: '56px', borderRadius: '50%', background: 'rgba(39,201,106,.08)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 14px', fontSize: '24px', color: 'var(--green)' }}>✓</div>
          <div style={{ fontFamily: 'var(--display)', fontSize: '17px', letterSpacing: '1px', marginBottom: '8px' }}>TESLIM KAYDEDILDI</div>
          <div style={{ fontFamily: 'var(--mono)', fontSize: '11px', color: 'var(--text3)', marginBottom: '18px' }}>
            {qty} {item.unit} {item.item_name} → {person?.full_name}
          </div>
          <div style={{ display: 'flex', gap: '8px', justifyContent: 'center' }}>
            <button className="btn btn-ghost" onClick={onClose} style={{ borderRadius: '10px' }}>KAPAT</button>
            <button className="btn btn-primary" onClick={() => { setPerson(null); setPersonQ(''); setQty(1); setNote(''); setStep(0) }} style={{ borderRadius: '10px' }}>YENI TESLIM</button>
          </div>
        </div>
      )}
    </Modal>
  )
}
