import { useState, useRef } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { laundryApi } from '../api.js'
import ColorPatternPicker, { ColorPatternDisplay, parseColors, colorHex } from './ColorPatternPicker.jsx'

const GARMENT_TYPES = [
  'Pantolon','Gömlek','T-Shirt','Kazak','Sweat','Mont','Ceket',
  'Hırka','Polar','Etek','Elbise','Şort','Atlet','İç Çamaşırı',
  'Çorap','Havlu','Yatak Çarşafı','Yastık Kılıfı','Diğer',
]
const SIZES = ['XS','S','M','L','XL','XXL','3XL','36','38','40','42','44','46','48']

const STATUS_LABEL = { received:'Alındı', ironing:'Ütüde', ready:'Hazır', delivered:'Teslim', lost:'Kayıp' }
const STATUS_COLOR = { received:'#f59e0b', ironing:'#6366f1', ready:'#10b981', delivered:'#64748b', lost:'#ef4444' }

function Badge({ status }) {
  const c = STATUS_COLOR[status] || '#64748b'
  return (
    <span style={{
      padding: '2px 8px', borderRadius: 4, fontSize: 9,
      fontFamily: 'var(--mono)', background: c + '18', border: `1px solid ${c}30`, color: c,
      flexShrink: 0,
    }}>
      {STATUS_LABEL[status] || status}
    </span>
  )
}

function emptyForm() {
  return { garment_type: '', brand: '', model: '', size: '', colors: [], pattern: '', condition_notes: '' }
}

export default function PremiumGarmentList({ item }) {
  const qc = useQueryClient()
  const [form, setForm] = useState(emptyForm())
  const [showForm, setShowForm] = useState(false)
  const [deliveredTo, setDeliveredTo] = useState('')
  const [selected, setSelected] = useState(new Set())
  const [bulkDeliverTo, setBulkDeliverTo] = useState('')
  const brandRef = useRef(null)

  const { data: garments = [], isLoading } = useQuery({
    queryKey: ['premium-garments', item.id],
    queryFn: () => laundryApi.getPremiumGarments(item.id),
    staleTime: 10_000,
  })

  const addMut = useMutation({
    mutationFn: () => laundryApi.addPremiumGarments(item.id, [{
      garment_type: form.garment_type,
      brand: form.brand || undefined,
      model: form.model || undefined,
      size: form.size || undefined,
      color: form.colors.length > 0 ? form.colors.join(', ') : undefined,
      pattern: form.pattern || undefined,
      condition_notes: form.condition_notes || undefined,
    }]),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['premium-garments', item.id] })
      qc.invalidateQueries({ queryKey: ['laundry-items'] })
      setForm(emptyForm())
      brandRef.current?.focus()
    },
  })

  const advanceMut = useMutation({
    mutationFn: (id) => laundryApi.advancePremiumGarment(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['premium-garments', item.id] })
      qc.invalidateQueries({ queryKey: ['laundry-items'] })
    },
  })

  const bulkMut = useMutation({
    mutationFn: ({ ids, to_status }) => laundryApi.bulkAdvancePremiumGarments(item.id, ids, to_status),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['premium-garments', item.id] })
      qc.invalidateQueries({ queryKey: ['laundry-items'] })
      setSelected(new Set())
    },
  })

  const deliverMut = useMutation({
    mutationFn: (to) => laundryApi.bulkDeliverPremiumGarments(
      item.id,
      readyGarments.map(g => g.id),
      to
    ),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['premium-garments', item.id] })
      qc.invalidateQueries({ queryKey: ['laundry-items'] })
      setDeliveredTo('')
    },
  })

  const bulkDeliverMut = useMutation({
    mutationFn: ({ ids, to }) => laundryApi.bulkDeliverPremiumGarments(item.id, ids, to),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['premium-garments', item.id] })
      qc.invalidateQueries({ queryKey: ['laundry-items'] })
      setSelected(new Set())
      setBulkDeliverTo('')
    },
  })

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))
  const canAdd = !!form.garment_type

  const ironingGarments  = garments.filter(g => g.status === 'ironing')
  const readyGarments    = garments.filter(g => g.status === 'ready')
  const activeGarments   = garments.filter(g => g.status !== 'lost')
  const allIroned        = activeGarments.length > 0 && ironingGarments.length === 0 && readyGarments.length > 0
  const hasIroning       = ironingGarments.length > 0

  // Selection logic
  const selectableIds = garments
    .filter(g => g.status !== 'delivered' && g.status !== 'lost')
    .map(g => g.id)
  const allSelected = selectableIds.length > 0 && selectableIds.every(id => selected.has(id))

  function toggleAll() {
    if (allSelected) {
      setSelected(new Set())
    } else {
      setSelected(new Set(selectableIds))
    }
  }

  function toggleSelect(id) {
    setSelected(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  // Bulk action bar state
  const selectedGarments = garments.filter(g => selected.has(g.id))
  const selectedIroning  = selectedGarments.filter(g => g.status === 'ironing' || g.status === 'received')
  const selectedReady    = selectedGarments.filter(g => g.status === 'ready')

  const inp = {
    background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 5,
    color: 'var(--text)', fontFamily: 'var(--mono)', fontSize: 11, padding: '5px 8px',
    outline: 'none', width: '100%',
  }
  const sel = { ...inp, cursor: 'pointer' }

  return (
    <div style={{ marginTop: 8, borderTop: '1px solid var(--border)', paddingTop: 10 }}>

      {/* ── Header ── */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {/* Tümünü Seç checkbox */}
          {selectableIds.length > 0 && (
            <input
              type="checkbox"
              checked={allSelected}
              onChange={toggleAll}
              title="Tümünü Seç"
              style={{ cursor: 'pointer', accentColor: 'var(--accent)', width: 14, height: 14, flexShrink: 0 }}
            />
          )}
          <span style={{ fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--text3)', letterSpacing: 1 }}>
            KIYAFETler {garments.length > 0 && `(${garments.length})`}
          </span>
          {hasIroning && (
            <span style={{
              fontFamily: 'var(--mono)', fontSize: 9, color: '#6366f1',
              background: 'rgba(99,102,241,0.1)', border: '1px solid rgba(99,102,241,0.25)',
              padding: '1px 8px', borderRadius: 4,
            }}>ütüde: {ironingGarments.length}</span>
          )}
          {allIroned && (
            <span style={{
              fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--green)',
              background: 'rgba(39,201,106,0.1)', border: '1px solid rgba(39,201,106,0.25)',
              padding: '1px 8px', borderRadius: 4,
            }}>✓ Tümü Hazır</span>
          )}
        </div>
        <div style={{ display: 'flex', gap: 6 }}>
          {hasIroning && (
            <button
              onClick={() => bulkMut.mutate({ ids: ironingGarments.map(g => g.id), to_status: 'ready' })}
              disabled={bulkMut.isPending}
              style={{
                padding: '3px 10px', borderRadius: 5,
                border: '1px solid rgba(39,201,106,0.4)', background: 'rgba(39,201,106,0.1)',
                color: 'var(--green)', fontFamily: 'var(--mono)', fontSize: 9, cursor: 'pointer', fontWeight: 700,
              }}
            >
              {bulkMut.isPending ? '...' : `✓ Tümünü Hazır (${ironingGarments.length})`}
            </button>
          )}
          <button
            onClick={() => setShowForm(s => !s)}
            style={{
              padding: '2px 10px', borderRadius: 5,
              border: `1px solid ${showForm ? 'rgba(240,165,0,0.4)' : 'var(--border)'}`,
              background: showForm ? 'rgba(240,165,0,0.08)' : 'transparent',
              color: showForm ? 'var(--accent)' : 'var(--text3)',
              fontFamily: 'var(--mono)', fontSize: 9, cursor: 'pointer',
            }}
          >
            {showForm ? '✕ Kapat' : '+ Parça Ekle'}
          </button>
        </div>
      </div>

      {/* ── Bulk Action Bar ── */}
      {selected.size > 0 && (
        <div style={{
          display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 8,
          padding: '8px 10px', borderRadius: 7, marginBottom: 8,
          background: 'rgba(240,165,0,0.06)', border: '1px solid rgba(240,165,0,0.2)',
        }}>
          <span style={{ fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--accent)', fontWeight: 700 }}>
            {selected.size} seçili
          </span>
          {selectedIroning.length > 0 && (
            <button
              onClick={() => bulkMut.mutate({ ids: selectedIroning.map(g => g.id), to_status: 'ready' })}
              disabled={bulkMut.isPending}
              style={{
                padding: '3px 10px', borderRadius: 5,
                border: '1px solid rgba(39,201,106,0.4)', background: 'rgba(39,201,106,0.1)',
                color: 'var(--green)', fontFamily: 'var(--mono)', fontSize: 9, cursor: 'pointer', fontWeight: 700,
              }}
            >
              {bulkMut.isPending ? '...' : `Hazır Yap (${selectedIroning.length})`}
            </button>
          )}
          {selectedReady.length > 0 && (
            <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
              <input
                value={bulkDeliverTo}
                onChange={e => setBulkDeliverTo(e.target.value)}
                placeholder="Teslim alan..."
                onKeyDown={e => {
                  if (e.key === 'Enter' && bulkDeliverTo.trim()) {
                    bulkDeliverMut.mutate({ ids: selectedReady.map(g => g.id), to: bulkDeliverTo.trim() })
                  }
                }}
                style={{
                  background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 5,
                  color: 'var(--text)', fontFamily: 'var(--mono)', fontSize: 10, padding: '4px 8px',
                  outline: 'none', width: 130,
                }}
              />
              <button
                onClick={() => bulkDeliverMut.mutate({ ids: selectedReady.map(g => g.id), to: bulkDeliverTo.trim() })}
                disabled={!bulkDeliverTo.trim() || bulkDeliverMut.isPending}
                style={{
                  padding: '3px 10px', borderRadius: 5,
                  border: `1px solid ${bulkDeliverTo.trim() ? 'var(--green)' : 'var(--border)'}`,
                  background: bulkDeliverTo.trim() ? 'rgba(16,185,129,0.1)' : 'transparent',
                  color: bulkDeliverTo.trim() ? 'var(--green)' : 'var(--text3)',
                  fontFamily: 'var(--mono)', fontSize: 9, cursor: 'pointer', fontWeight: 700,
                }}
              >
                {bulkDeliverMut.isPending ? '...' : `Teslim Et (${selectedReady.length})`}
              </button>
            </div>
          )}
          <button
            onClick={() => setSelected(new Set())}
            style={{
              padding: '3px 8px', borderRadius: 5, marginLeft: 'auto',
              border: '1px solid var(--border)', background: 'transparent',
              color: 'var(--text3)', fontFamily: 'var(--mono)', fontSize: 9, cursor: 'pointer',
            }}
          >✕ Seçimi Kaldır</button>
        </div>
      )}

      {/* ── Inline Add Form ── */}
      {showForm && (
        <div style={{
          background: 'var(--surface2)', border: '1px solid rgba(240,165,0,0.15)',
          borderRadius: 8, padding: 10, marginBottom: 10,
        }}>
          <div style={{ marginBottom: 8 }}>
            <div style={{ fontSize: 9, color: 'var(--text3)', fontFamily: 'var(--mono)', marginBottom: 5, letterSpacing: 1 }}>TİP *</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
              {GARMENT_TYPES.map(t => (
                <button key={t} onClick={() => { set('garment_type', t); brandRef.current?.focus() }}
                  style={{
                    padding: '3px 10px', borderRadius: 12,
                    border: `1px solid ${form.garment_type === t ? 'rgba(240,165,0,0.5)' : 'var(--border)'}`,
                    background: form.garment_type === t ? 'rgba(240,165,0,0.12)' : 'transparent',
                    color: form.garment_type === t ? 'var(--accent)' : 'var(--text3)',
                    fontFamily: 'var(--mono)', fontSize: 9, cursor: 'pointer', transition: 'all 0.1s',
                  }}>
                  {t}
                </button>
              ))}
            </div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr auto', gap: 6, marginBottom: 8 }}>
            <div>
              <div style={{ fontSize: 8, color: 'var(--text3)', fontFamily: 'var(--mono)', marginBottom: 3 }}>MARKA</div>
              <input ref={brandRef} style={inp} value={form.brand}
                onChange={e => set('brand', e.target.value)} placeholder="örn: Adidas"
                onKeyDown={e => e.key === 'Enter' && canAdd && addMut.mutate()} />
            </div>
            <div>
              <div style={{ fontSize: 8, color: 'var(--text3)', fontFamily: 'var(--mono)', marginBottom: 3 }}>MODEL</div>
              <input style={inp} value={form.model}
                onChange={e => set('model', e.target.value)} placeholder="örn: Track Suit"
                onKeyDown={e => e.key === 'Enter' && canAdd && addMut.mutate()} />
            </div>
            <div>
              <div style={{ fontSize: 8, color: 'var(--text3)', fontFamily: 'var(--mono)', marginBottom: 3 }}>BEDEN</div>
              <select style={{ ...sel, width: 68 }} value={form.size} onChange={e => set('size', e.target.value)}>
                <option value="">-</option>
                {SIZES.map(s => <option key={s}>{s}</option>)}
              </select>
            </div>
          </div>
          <div style={{ marginBottom: 8 }}>
            <div style={{ fontSize: 8, color: 'var(--text3)', fontFamily: 'var(--mono)', marginBottom: 6, letterSpacing: 1 }}>RENK & DESEN</div>
            <ColorPatternPicker
              colors={form.colors}
              pattern={form.pattern}
              onChange={({ colors, pattern }) => setForm(f => ({ ...f, colors, pattern }))}
              compact
            />
          </div>
          <div style={{ marginBottom: 8 }}>
            <input style={{ ...inp, fontSize: 10 }} value={form.condition_notes}
              onChange={e => set('condition_notes', e.target.value)} placeholder="Not (opsiyonel)"
              onKeyDown={e => e.key === 'Enter' && canAdd && addMut.mutate()} />
          </div>
          <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
            <button onClick={() => addMut.mutate()} disabled={!canAdd || addMut.isPending}
              style={{
                padding: '6px 18px', borderRadius: 6, border: 'none', cursor: 'pointer',
                background: canAdd ? 'var(--accent)' : 'var(--surface)',
                color: canAdd ? '#000' : 'var(--text3)',
                fontFamily: 'var(--mono)', fontSize: 10, fontWeight: 700,
                opacity: addMut.isPending ? 0.6 : 1,
              }}>
              {addMut.isPending ? '...' : '+ Ekle (Enter)'}
            </button>
            <button onClick={() => setForm(emptyForm())} style={{
              padding: '6px 12px', borderRadius: 6, border: '1px solid var(--border)',
              background: 'transparent', color: 'var(--text3)',
              fontFamily: 'var(--mono)', fontSize: 10, cursor: 'pointer',
            }}>Temizle</button>
            {addMut.error && (
              <span style={{ fontSize: 9, color: 'var(--red)', fontFamily: 'var(--mono)' }}>
                {addMut.error.response?.data?.error || addMut.error.message}
              </span>
            )}
          </div>
        </div>
      )}

      {/* ── Garment List ── */}
      {isLoading ? (
        <div style={{ fontSize: 9, color: 'var(--text3)', fontFamily: 'var(--mono)' }}>yükleniyor...</div>
      ) : garments.length === 0 ? (
        <div style={{ fontSize: 9, color: 'var(--text3)', fontFamily: 'var(--mono)', padding: '4px 0' }}>
          Henüz kıyafet eklenmedi.
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          {garments.map(g => {
            const isIroning   = g.status === 'ironing'
            const isReady     = g.status === 'ready'
            const isDelivered = g.status === 'delivered'
            const isLost      = g.status === 'lost'
            const canMove     = !isDelivered && !isLost
            const isSelectable = canMove
            const isSelected   = selected.has(g.id)
            const colorDots    = parseColors(g.color)
            const hasDetail    = g.brand || g.model || g.size || g.color || g.pattern || g.condition_notes

            return (
              <div key={g.id} style={{
                borderRadius: 7,
                background: isSelected
                  ? 'rgba(240,165,0,0.06)'
                  : isIroning ? 'rgba(99,102,241,0.06)' : isReady ? 'rgba(16,185,129,0.04)' : 'var(--surface2)',
                border: `1px solid ${
                  isSelected
                    ? 'rgba(240,165,0,0.3)'
                    : isIroning ? 'rgba(99,102,241,0.25)' : isReady ? 'rgba(16,185,129,0.2)' : 'var(--border)'
                }`,
                overflow: 'hidden',
              }}>
                {/* Ana satır */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 10px' }}>

                  {/* Seçim checkbox */}
                  {isSelectable ? (
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={() => toggleSelect(g.id)}
                      style={{ cursor: 'pointer', accentColor: 'var(--accent)', width: 14, height: 14, flexShrink: 0 }}
                    />
                  ) : (
                    <div style={{ width: 14, flexShrink: 0 }} />
                  )}

                  {/* Checkbox-tik (ironing için) */}
                  {isIroning && (
                    <button
                      onClick={() => advanceMut.mutate(g.id)}
                      disabled={advanceMut.isPending}
                      title="Ütülendi olarak işaretle"
                      style={{
                        width: 24, height: 24, borderRadius: 5, flexShrink: 0,
                        border: '2px solid rgba(99,102,241,0.5)',
                        background: 'rgba(99,102,241,0.08)',
                        cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
                        color: '#6366f1', fontSize: 13, fontWeight: 900,
                        transition: 'all 0.15s',
                      }}
                    >
                      {advanceMut.isPending ? '·' : ''}
                    </button>
                  )}
                  {isReady && (
                    <div style={{
                      width: 24, height: 24, borderRadius: 5, flexShrink: 0,
                      border: '2px solid rgba(16,185,129,0.5)',
                      background: 'rgba(16,185,129,0.12)',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      color: 'var(--green)', fontSize: 13, fontWeight: 900,
                    }}>✓</div>
                  )}
                  {isDelivered && (
                    <div style={{
                      width: 24, height: 24, borderRadius: 5, flexShrink: 0,
                      border: '2px solid rgba(100,116,139,0.3)',
                      background: 'rgba(100,116,139,0.08)',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      color: '#64748b', fontSize: 11,
                    }}>✓✓</div>
                  )}
                  {isLost && (
                    <div style={{
                      width: 24, height: 24, borderRadius: 5, flexShrink: 0,
                      border: '2px solid rgba(239,68,68,0.3)',
                      background: 'rgba(239,68,68,0.08)',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      color: '#ef4444', fontSize: 11,
                    }}>✕</div>
                  )}

                  {/* Kod */}
                  <span style={{
                    fontFamily: 'var(--mono)', fontSize: 10, fontWeight: 700,
                    padding: '2px 7px', borderRadius: 4, flexShrink: 0,
                    background: 'rgba(240,165,0,0.08)', border: '1px solid rgba(240,165,0,0.2)',
                    color: 'var(--accent)', letterSpacing: 0.5,
                  }}>
                    {g.garment_code}
                  </span>

                  {/* Tip */}
                  <span style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--text)', fontWeight: 600, flexShrink: 0 }}>
                    {g.garment_type}
                  </span>

                  <Badge status={g.status} />

                  {/* Renk noktaları inline (10px) */}
                  {colorDots.length > 0 && (
                    <span style={{ display: 'inline-flex', gap: 3, alignItems: 'center', flexShrink: 0 }}>
                      {colorDots.map(name => (
                        <span
                          key={name}
                          title={name}
                          style={{
                            width: 10, height: 10, borderRadius: '50%',
                            background: colorHex(name),
                            border: '1px solid rgba(0,0,0,0.2)',
                            display: 'inline-block', flexShrink: 0,
                          }}
                        />
                      ))}
                    </span>
                  )}

                  {/* İlerlet butonu (received durumu için) */}
                  {g.status === 'received' && (
                    <button onClick={() => advanceMut.mutate(g.id)} disabled={advanceMut.isPending}
                      style={{
                        marginLeft: 'auto', padding: '2px 10px', borderRadius: 4, border: 'none', cursor: 'pointer',
                        background: 'var(--accent)', color: '#000',
                        fontFamily: 'var(--mono)', fontSize: 9, fontWeight: 700, flexShrink: 0,
                      }}>→</button>
                  )}
                </div>

                {/* Detay satırı — alanlar varsa */}
                {hasDetail && (
                  <div style={{
                    display: 'flex', flexWrap: 'wrap', gap: 6, padding: '4px 10px 8px 52px',
                    borderTop: `1px solid ${isIroning ? 'rgba(99,102,241,0.1)' : 'var(--border)'}`,
                    alignItems: 'center',
                  }}>
                    {g.brand && (
                      <span style={{
                        fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--text2)',
                        background: 'var(--surface)', border: '1px solid var(--border)',
                        borderRadius: 4, padding: '2px 8px',
                      }}>{g.brand}</span>
                    )}
                    {g.model && (
                      <span style={{
                        fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--text3)',
                        background: 'var(--surface)', border: '1px solid var(--border)',
                        borderRadius: 4, padding: '2px 8px',
                      }}>{g.model}</span>
                    )}
                    {g.size && (
                      <span style={{
                        fontFamily: 'var(--mono)', fontSize: 10, fontWeight: 700, color: 'var(--text2)',
                        background: 'var(--surface)', border: '1px solid var(--border)',
                        borderRadius: 4, padding: '2px 8px',
                      }}>{g.size}</span>
                    )}
                    {(g.color || g.pattern) && (
                      <ColorPatternDisplay color={g.color} pattern={g.pattern} />
                    )}
                    {g.condition_notes && (
                      <span style={{
                        fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--text3)', fontStyle: 'italic',
                        padding: '2px 4px',
                      }}>{g.condition_notes}</span>
                    )}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {/* ── Teslim Et bölümü — tüm garments hazır olunca çıkar ── */}
      {allIroned && readyGarments.length > 0 && (
        <div style={{
          marginTop: 10, padding: '10px 12px', borderRadius: 8,
          background: 'rgba(16,185,129,0.06)', border: '1px solid rgba(16,185,129,0.25)',
        }}>
          <div style={{ fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--green)', fontWeight: 700, marginBottom: 8, letterSpacing: 1 }}>
            ✓ TÜM PARÇALAR HAZIR — TESLİM ET
          </div>
          <div style={{ display: 'flex', gap: 6 }}>
            <input
              className="form-input"
              value={deliveredTo}
              onChange={e => setDeliveredTo(e.target.value)}
              placeholder="Teslim alan adı..."
              style={{ flex: 1, fontSize: 11 }}
              onKeyDown={e => { if (e.key === 'Enter' && deliveredTo.trim()) deliverMut.mutate(deliveredTo.trim()) }}
            />
            <button
              onClick={() => deliverMut.mutate(deliveredTo.trim())}
              disabled={!deliveredTo.trim() || deliverMut.isPending}
              style={{
                padding: '7px 16px', borderRadius: 6, cursor: 'pointer', flexShrink: 0,
                background: deliveredTo.trim() ? 'var(--green)' : 'var(--surface)',
                border: `1px solid ${deliveredTo.trim() ? 'var(--green)' : 'var(--border)'}`,
                color: deliveredTo.trim() ? '#000' : 'var(--text3)',
                fontFamily: 'var(--mono)', fontSize: 10, fontWeight: 700,
                transition: 'all 0.15s',
              }}
            >
              {deliverMut.isPending ? '...' : `✓ Teslim Et (${readyGarments.length})`}
            </button>
          </div>
          {deliverMut.isError && (
            <div style={{ fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--red)', marginTop: 6 }}>
              {deliverMut.error?.response?.data?.error || 'Hata oluştu'}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
