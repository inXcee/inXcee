import { useState, useRef } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { laundryApi } from '../api.js'

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
      padding: '1px 7px', borderRadius: 4, fontSize: 9,
      fontFamily: 'var(--mono)', background: c + '18', border: `1px solid ${c}30`, color: c,
    }}>
      {STATUS_LABEL[status] || status}
    </span>
  )
}

function emptyForm() {
  return { garment_type: '', brand: '', model: '', size: '', color: '', condition_notes: '' }
}

export default function PremiumGarmentList({ item }) {
  const qc = useQueryClient()
  const [form, setForm] = useState(emptyForm())
  const [showForm, setShowForm] = useState(false)
  const [selected, setSelected] = useState(new Set())
  const [bulkStatus, setBulkStatus] = useState('ironing')
  const brandRef = useRef(null)

  const { data: garments = [], isLoading } = useQuery({
    queryKey: ['premium-garments', item.id],
    queryFn: () => laundryApi.getPremiumGarments(item.id),
    staleTime: 10_000,
  })

  const addMut = useMutation({
    mutationFn: () => laundryApi.addPremiumGarments(item.id, [form]),
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

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))
  const canAdd = !!form.garment_type

  const toggleSelect = (id) => setSelected(prev => {
    const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n
  })

  const movableIds = garments.filter(g => g.status !== 'delivered' && g.status !== 'lost').map(g => g.id)
  const allSelected = movableIds.length > 0 && movableIds.every(id => selected.has(id))

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
        <span style={{ fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--text3)', letterSpacing: 1 }}>
          KIYAFETler {garments.length > 0 && `(${garments.length})`}
        </span>
        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          {movableIds.length > 0 && (
            <label style={{ display: 'flex', alignItems: 'center', gap: 3, cursor: 'pointer' }}>
              <input type="checkbox" checked={allSelected}
                onChange={() => setSelected(allSelected ? new Set() : new Set(movableIds))}
                style={{ accentColor: 'var(--accent)', width: 11, height: 11 }} />
              <span style={{ fontSize: 9, color: 'var(--text3)', fontFamily: 'var(--mono)' }}>Tümü</span>
            </label>
          )}
          <button
            onClick={() => setShowForm(s => !s)}
            style={{
              padding: '2px 10px', borderRadius: 5, border: `1px solid ${showForm ? 'rgba(240,165,0,0.4)' : 'var(--border)'}`,
              background: showForm ? 'rgba(240,165,0,0.08)' : 'transparent',
              color: showForm ? 'var(--accent)' : 'var(--text3)',
              fontFamily: 'var(--mono)', fontSize: 9, cursor: 'pointer',
            }}
          >
            {showForm ? '✕ Kapat' : '+ Parça Ekle'}
          </button>
        </div>
      </div>

      {/* ── Inline Add Form ── */}
      {showForm && (
        <div style={{
          background: 'var(--surface2)', border: '1px solid rgba(240,165,0,0.15)',
          borderRadius: 8, padding: 10, marginBottom: 10,
        }}>
          {/* Tip seçimi — chip butonlar */}
          <div style={{ marginBottom: 8 }}>
            <div style={{ fontSize: 9, color: 'var(--text3)', fontFamily: 'var(--mono)', marginBottom: 5, letterSpacing: 1 }}>TİP *</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
              {GARMENT_TYPES.map(t => (
                <button key={t} onClick={() => { set('garment_type', t); brandRef.current?.focus() }}
                  style={{
                    padding: '3px 10px', borderRadius: 12, border: `1px solid ${form.garment_type === t ? 'rgba(240,165,0,0.5)' : 'var(--border)'}`,
                    background: form.garment_type === t ? 'rgba(240,165,0,0.12)' : 'transparent',
                    color: form.garment_type === t ? 'var(--accent)' : 'var(--text3)',
                    fontFamily: 'var(--mono)', fontSize: 9, cursor: 'pointer', transition: 'all 0.1s',
                  }}>
                  {t}
                </button>
              ))}
            </div>
          </div>

          {/* Detay satırı — marka / model / beden / renk */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr auto 1fr', gap: 6, marginBottom: 8 }}>
            <div>
              <div style={{ fontSize: 8, color: 'var(--text3)', fontFamily: 'var(--mono)', marginBottom: 3 }}>MARKA</div>
              <input ref={brandRef} style={inp} value={form.brand}
                onChange={e => set('brand', e.target.value)}
                placeholder="örn: Adidas"
                onKeyDown={e => e.key === 'Enter' && canAdd && addMut.mutate()} />
            </div>
            <div>
              <div style={{ fontSize: 8, color: 'var(--text3)', fontFamily: 'var(--mono)', marginBottom: 3 }}>MODEL</div>
              <input style={inp} value={form.model}
                onChange={e => set('model', e.target.value)}
                placeholder="örn: Track Suit"
                onKeyDown={e => e.key === 'Enter' && canAdd && addMut.mutate()} />
            </div>
            <div>
              <div style={{ fontSize: 8, color: 'var(--text3)', fontFamily: 'var(--mono)', marginBottom: 3 }}>BEDEN</div>
              <select style={{ ...sel, width: 68 }} value={form.size} onChange={e => set('size', e.target.value)}>
                <option value="">-</option>
                {SIZES.map(s => <option key={s}>{s}</option>)}
              </select>
            </div>
            <div>
              <div style={{ fontSize: 8, color: 'var(--text3)', fontFamily: 'var(--mono)', marginBottom: 3 }}>RENK</div>
              <input style={inp} value={form.color}
                onChange={e => set('color', e.target.value)}
                placeholder="örn: Lacivert"
                onKeyDown={e => e.key === 'Enter' && canAdd && addMut.mutate()} />
            </div>
          </div>

          {/* Not */}
          <div style={{ marginBottom: 8 }}>
            <input style={{ ...inp, fontSize: 10 }} value={form.condition_notes}
              onChange={e => set('condition_notes', e.target.value)}
              placeholder="Not (opsiyonel)"
              onKeyDown={e => e.key === 'Enter' && canAdd && addMut.mutate()} />
          </div>

          {/* Butonlar */}
          <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
            <button
              onClick={() => addMut.mutate()}
              disabled={!canAdd || addMut.isPending}
              style={{
                padding: '6px 18px', borderRadius: 6, border: 'none', cursor: 'pointer',
                background: canAdd ? 'var(--accent)' : 'var(--surface)',
                color: canAdd ? '#000' : 'var(--text3)',
                fontFamily: 'var(--mono)', fontSize: 10, fontWeight: 700,
                opacity: addMut.isPending ? 0.6 : 1,
              }}
            >
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
          Henüz kıyafet eklenmedi — yukarıdan ekle.
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
          {garments.map(g => {
            const canMove = g.status !== 'delivered' && g.status !== 'lost'
            return (
              <div key={g.id} style={{
                display: 'flex', alignItems: 'center', gap: 6,
                padding: '5px 8px', borderRadius: 5,
                background: selected.has(g.id) ? 'rgba(240,165,0,0.05)' : 'var(--surface2)',
                border: `1px solid ${selected.has(g.id) ? 'rgba(240,165,0,0.2)' : 'var(--border)'}`,
              }}>
                {canMove
                  ? <input type="checkbox" checked={selected.has(g.id)} onChange={() => toggleSelect(g.id)}
                      style={{ accentColor: 'var(--accent)', width: 11, height: 11, flexShrink: 0 }} />
                  : <div style={{ width: 11, flexShrink: 0 }} />
                }

                {/* Kod */}
                <span style={{
                  fontFamily: 'var(--mono)', fontSize: 9, flexShrink: 0,
                  padding: '1px 5px', borderRadius: 3,
                  background: 'rgba(240,165,0,0.08)', border: '1px solid rgba(240,165,0,0.2)',
                  color: 'var(--accent)',
                }}>
                  {g.garment_code}
                </span>

                {/* Tip + detay */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <span style={{ fontSize: 10, color: 'var(--text)', fontFamily: 'var(--mono)' }}>{g.garment_type}</span>
                  {(g.brand || g.model || g.size || g.color) && (
                    <span style={{ fontSize: 9, color: 'var(--text3)', marginLeft: 6 }}>
                      {[g.brand, g.model, g.size ? `(${g.size})` : '', g.color].filter(Boolean).join(' ')}
                    </span>
                  )}
                </div>

                <Badge status={g.status} />

                {canMove && (
                  <button onClick={() => advanceMut.mutate(g.id)} disabled={advanceMut.isPending}
                    style={{
                      padding: '2px 8px', borderRadius: 4, border: 'none', cursor: 'pointer',
                      background: 'var(--accent)', color: '#000',
                      fontFamily: 'var(--mono)', fontSize: 8, fontWeight: 700, flexShrink: 0,
                    }}>
                    İlerlet
                  </button>
                )}
              </div>
            )
          })}
        </div>
      )}

      {/* ── Toplu işlem ── */}
      {selected.size > 0 && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: 6, marginTop: 6,
          padding: '5px 8px', borderRadius: 6,
          background: 'rgba(240,165,0,0.06)', border: '1px solid rgba(240,165,0,0.18)',
        }}>
          <span style={{ fontSize: 9, color: 'var(--text2)', fontFamily: 'var(--mono)', flexShrink: 0 }}>
            {selected.size} seçili →
          </span>
          <select value={bulkStatus} onChange={e => setBulkStatus(e.target.value)}
            style={{
              flex: 1, background: 'var(--surface2)', border: '1px solid var(--border)',
              borderRadius: 4, padding: '3px 6px', color: 'var(--text)',
              fontFamily: 'var(--mono)', fontSize: 9, outline: 'none',
            }}>
            <option value="ironing">Ütüye Al</option>
            <option value="ready">Hazır Yap</option>
            <option value="lost">Kayıp</option>
          </select>
          <button onClick={() => bulkMut.mutate({ ids: [...selected], to_status: bulkStatus })}
            disabled={bulkMut.isPending}
            style={{
              padding: '3px 12px', borderRadius: 4, border: 'none', cursor: 'pointer',
              background: 'var(--accent)', color: '#000',
              fontFamily: 'var(--mono)', fontSize: 9, fontWeight: 700,
            }}>
            Uygula
          </button>
        </div>
      )}
    </div>
  )
}
