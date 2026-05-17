import { useState, useMemo } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import api from '../../../shared/api/client.js'
import Modal from './Modal.jsx'

export default function CheckoutModal({ item, onClose }) {
  const qc = useQueryClient()
  const inv = () => { qc.invalidateQueries({ queryKey: ['inventory'] }); qc.invalidateQueries({ queryKey: ['inventory-stats'] }); qc.invalidateQueries({ queryKey: ['checkouts-active'] }); qc.invalidateQueries({ queryKey: ['checkouts-report'] }); qc.invalidateQueries({ queryKey: ['stock-by-location'] }) }
  const [step, setStep] = useState(0)
  const [filter, setFilter] = useState('')
  const [staff, setStaff] = useState(null)
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

  // Modal açılır açılmaz tüm aktif AVS personelini getir — arama gerektirmez
  const { data: allStaff = [], isLoading: staffLoading } = useQuery({
    queryKey: ['inv-staff-all'],
    queryFn: () => api.get('/inventory/staff/search').then(r => r.data),
  })

  const filtered = useMemo(() => {
    const f = filter.trim().toLowerCase()
    if (!f) return allStaff
    return allStaff.filter(s =>
      s.full_name?.toLowerCase().includes(f) ||
      s.role_label?.toLowerCase().includes(f) ||
      s.position?.toLowerCase().includes(f) ||
      s.department_name?.toLowerCase().includes(f) ||
      s.assigned_block?.toLowerCase().includes(f) ||
      s.phone?.includes(f)
    )
  }, [allStaff, filter])

  const mut = useMutation({
    mutationFn: d => api.post('/inventory/checkout', d),
    onSuccess: () => { inv(); setStep(2) },
  })

  return (
    <Modal onClose={onClose} title="AVS PERSONELİNE TESLİM" sub={item.item_name} color="var(--blue),var(--teal)">
      {/* Step indicator */}
      <div style={{ display: 'flex', gap: '0', marginBottom: '20px' }}>
        {['KİŞİ SEÇ', 'MIKTAR', 'TAMAM'].map((s, i) => (
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

      {/* Step 0: pick staff from list */}
      {step === 0 && (
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
            <input className="form-input" value={filter} onChange={e => setFilter(e.target.value)}
              placeholder="🔍 Ad/görev/blok ile filtrele…" autoFocus
              style={{ flex: 1, borderRadius: '10px', fontSize: 13 }} />
            <span style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--text3)', whiteSpace: 'nowrap' }}>
              {filtered.length}/{allStaff.length}
            </span>
          </div>
          <div style={{ maxHeight: '360px', overflow: 'auto', borderRadius: 10, border: '1px solid var(--border)' }}>
            {staffLoading ? (
              <div style={{ padding: 30, textAlign: 'center', fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--text3)' }}>Yükleniyor…</div>
            ) : filtered.length === 0 ? (
              <div style={{ padding: 30, textAlign: 'center', fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--text3)' }}>
                {allStaff.length === 0
                  ? 'Aktif AVS personeli yok. Önce Ayarlar → AVS Çalışanları üzerinden personel ekleyin.'
                  : 'Eşleşen personel yok'}
              </div>
            ) : filtered.map(s => (
              <div key={s.id} onClick={() => { setStaff(s); setStep(1) }} style={{
                padding: '10px 14px', cursor: 'pointer', borderBottom: '1px solid var(--border)',
                display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10,
                transition: 'background 0.15s',
              }}
                onMouseEnter={e => { e.currentTarget.style.background = 'rgba(240,165,0,.05)' }}
                onMouseLeave={e => { e.currentTarget.style.background = 'transparent' }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 600, fontSize: '13px', color: 'var(--text)' }}>{s.full_name}</div>
                  <div style={{ fontFamily: 'var(--mono)', fontSize: '9px', color: 'var(--text3)', marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {s.role_label || s.position || '—'}
                    {s.department_name && ` · ${s.department_name}`}
                    {s.phone && ` · ${s.phone}`}
                  </div>
                </div>
                {(s.assigned_block || s.assigned_floor != null) && (
                  <span style={{ fontFamily: 'var(--mono)', fontSize: '10px', color: 'var(--accent)', background: 'rgba(240,165,0,.08)', padding: '4px 9px', borderRadius: '6px', fontWeight: 700, whiteSpace: 'nowrap' }}>
                    {s.assigned_block || '—'}{s.assigned_floor != null ? ` / ${s.assigned_floor}.kat` : ''}
                  </span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Step 1: Quantity */}
      {step === 1 && (
        <div>
          <div style={{ padding: '12px 14px', background: 'var(--surface2)', borderRadius: '10px', border: '1px solid var(--border)', marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div style={{ width: '36px', height: '36px', borderRadius: '10px', background: 'rgba(52,152,219,.08)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '14px', flexShrink: 0 }}>👤</div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontWeight: 600 }}>{staff?.full_name}</div>
              <div style={{ fontFamily: 'var(--mono)', fontSize: '9px', color: 'var(--text3)', marginTop: 2 }}>
                {staff?.role_label || staff?.position || '—'}
                {staff?.department_name && ` · ${staff.department_name}`}
                {staff?.assigned_block && ` · ${staff.assigned_block}${staff.assigned_floor != null ? '/' + staff.assigned_floor + '.kat' : ''}`}
              </div>
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
            onClick={() => mut.mutate({ item_id: item.id, staff_id: staff.id, quantity: qty, note, from_location_id: fromLocationId ? +fromLocationId : undefined })}>
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
            {qty} {item.unit} {item.item_name} → {staff?.full_name}
          </div>
          <div style={{ display: 'flex', gap: '8px', justifyContent: 'center' }}>
            <button className="btn btn-ghost" onClick={onClose} style={{ borderRadius: '10px' }}>KAPAT</button>
            <button className="btn btn-primary" onClick={() => { setStaff(null); setFilter(''); setQty(1); setNote(''); setStep(0) }} style={{ borderRadius: '10px' }}>YENI TESLIM</button>
          </div>
        </div>
      )}
    </Modal>
  )
}
