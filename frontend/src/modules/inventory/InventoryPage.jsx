import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import api from '../../shared/api/client.js'

const CATEGORIES = [
  { key: 'laundry', label: 'Camasir', color: 'var(--blue)' },
  { key: 'maintenance', label: 'Bakim', color: 'var(--amber)' },
  { key: 'housekeeping', label: 'Temizlik', color: 'var(--green)' },
  { key: 'general', label: 'Genel', color: 'var(--purple)' },
]

const UNITS = ['adet', 'kg', 'litre', 'paket', 'kutu', 'set', 'metre']

export default function InventoryPage() {
  const qc = useQueryClient()
  const [catFilter, setCatFilter] = useState('')
  const [showForm, setShowForm] = useState(false)
  const [adjustItem, setAdjustItem] = useState(null)
  const [adjustDelta, setAdjustDelta] = useState('')
  const [adjustReason, setAdjustReason] = useState('')
  const [editItem, setEditItem] = useState(null)
  const [form, setForm] = useState({ item_name: '', quantity: 0, unit: 'adet', reorder_threshold: 0, category: 'general' })

  const { data: items = [] } = useQuery({
    queryKey: ['inventory', catFilter],
    queryFn: () => api.get(`/inventory${catFilter ? `?category=${catFilter}` : ''}`).then(r => r.data),
  })

  const inv = () => qc.invalidateQueries({ queryKey: ['inventory'] })

  const createMut = useMutation({
    mutationFn: (data) => api.post('/inventory', data),
    onSuccess: () => { inv(); setShowForm(false); setForm({ item_name: '', quantity: 0, unit: 'adet', reorder_threshold: 0, category: 'general' }) },
  })

  const updateMut = useMutation({
    mutationFn: ({ id, ...data }) => api.put(`/inventory/${id}`, data),
    onSuccess: () => { inv(); setEditItem(null) },
  })

  const deleteMut = useMutation({
    mutationFn: (id) => api.delete(`/inventory/${id}`),
    onSuccess: inv,
  })

  const adjustMut = useMutation({
    mutationFn: ({ id, delta, reason }) => api.patch(`/inventory/${id}/adjust`, { delta, reason }),
    onSuccess: () => { inv(); setAdjustItem(null); setAdjustDelta(''); setAdjustReason('') },
  })

  const lowStock = items.filter(i => i.reorder_threshold > 0 && i.quantity <= i.reorder_threshold)

  return (
    <div style={{ position: 'relative', zIndex: 1 }} className="fade-up">
      <div className="page-header" style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', marginBottom: '20px', flexWrap: 'wrap', gap: '8px' }}>
        <div>
          <h1 style={{ fontSize: '28px', letterSpacing: '4px', color: 'var(--text)' }}>ENVANTER</h1>
          <p style={{ fontFamily: 'var(--mono)', fontSize: '10px', color: 'var(--text3)', marginTop: '4px', letterSpacing: '1px' }}>
            STOK TAKIP VE YONETIM
          </p>
        </div>
        <button onClick={() => setShowForm(s => !s)} className={`btn ${showForm ? 'btn-ghost' : 'btn-primary'}`}>
          {showForm ? '✕ KAPAT' : '+ YENi URUN'}
        </button>
      </div>

      {/* Low stock warning */}
      {lowStock.length > 0 && (
        <div className="fade-up" style={{
          padding: '12px 16px', marginBottom: '16px', borderRadius: '10px',
          background: 'rgba(231,76,60,.06)', border: '1px solid rgba(231,76,60,.2)',
        }}>
          <div style={{ fontFamily: 'var(--mono)', fontSize: '9px', color: 'var(--red)', letterSpacing: '1.5px', marginBottom: '8px' }}>
            DUSUK STOK UYARISI — {lowStock.length} URUN
          </div>
          <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
            {lowStock.map(i => (
              <span key={i.id} style={{
                padding: '4px 10px', borderRadius: '5px', fontSize: '11px', fontWeight: 600,
                background: 'rgba(231,76,60,.1)', color: 'var(--red)',
                fontFamily: 'var(--mono)',
              }}>
                {i.item_name}: {i.quantity} {i.unit}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Category filter */}
      <div style={{ display: 'flex', gap: '6px', marginBottom: '12px', flexWrap: 'wrap' }}>
        <button onClick={() => setCatFilter('')} className={`btn btn-xs ${!catFilter ? 'btn-primary' : 'btn-ghost'}`}>TUMU</button>
        {CATEGORIES.map(c => (
          <button key={c.key} onClick={() => setCatFilter(c.key)}
            className={`btn btn-xs ${catFilter === c.key ? 'btn-primary' : 'btn-ghost'}`}
            style={catFilter === c.key ? { background: c.color, borderColor: c.color } : {}}>
            {c.label.toUpperCase()}
          </button>
        ))}
      </div>

      {/* Add form */}
      {showForm && (
        <div className="panel fade-up" style={{ marginBottom: '16px' }}>
          <div style={{ height: '2px', background: 'linear-gradient(90deg,var(--blue),var(--teal))' }} />
          <div className="panel-header"><div className="panel-title">YENi URUN EKLE</div></div>
          <div className="panel-body" style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', alignItems: 'flex-end' }}>
            <div style={{ flex: 2, minWidth: '140px' }}>
              <label className="form-label">Urun Adi</label>
              <input className="form-input" value={form.item_name} onChange={e => setForm(p => ({ ...p, item_name: e.target.value }))} />
            </div>
            <div style={{ flex: 1, minWidth: '80px' }}>
              <label className="form-label">Miktar</label>
              <input className="form-input" type="number" value={form.quantity} onChange={e => setForm(p => ({ ...p, quantity: +e.target.value }))} />
            </div>
            <div style={{ flex: 1, minWidth: '80px' }}>
              <label className="form-label">Birim</label>
              <select className="form-select" value={form.unit} onChange={e => setForm(p => ({ ...p, unit: e.target.value }))}>
                {UNITS.map(u => <option key={u} value={u}>{u}</option>)}
              </select>
            </div>
            <div style={{ flex: 1, minWidth: '80px' }}>
              <label className="form-label">Esik</label>
              <input className="form-input" type="number" value={form.reorder_threshold} onChange={e => setForm(p => ({ ...p, reorder_threshold: +e.target.value }))} />
            </div>
            <div style={{ flex: 1, minWidth: '100px' }}>
              <label className="form-label">Kategori</label>
              <select className="form-select" value={form.category} onChange={e => setForm(p => ({ ...p, category: e.target.value }))}>
                {CATEGORIES.map(c => <option key={c.key} value={c.key}>{c.label}</option>)}
              </select>
            </div>
            <button className="btn btn-primary btn-sm" disabled={!form.item_name || createMut.isPending}
              onClick={() => createMut.mutate(form)}>
              {createMut.isPending ? '...' : 'KAYDET'}
            </button>
          </div>
        </div>
      )}

      {/* Items table */}
      <div className="panel fade-up-1">
        <div style={{ height: '2px', background: 'linear-gradient(90deg,var(--purple),var(--blue))' }} />
        <div className="panel-header">
          <div className="panel-title">STOK LiSTESi</div>
          <div className="panel-subtitle">{items.length} URUN</div>
        </div>
        <div className="panel-body" style={{ overflowX: 'auto' }}>
          {items.length === 0 ? (
            <div className="empty-state">
              <div className="empty-icon" style={{ fontSize: '28px' }}>📦</div>
              <div className="empty-sub">Urun bulunamadi</div>
            </div>
          ) : (
            <table className="data-table">
              <thead>
                <tr>
                  <th>Urun</th>
                  <th>Kategori</th>
                  <th>Stok</th>
                  <th>Esik</th>
                  <th>Durum</th>
                  <th>Son Guncelleme</th>
                  <th>islem</th>
                </tr>
              </thead>
              <tbody>
                {items.map(item => {
                  const cat = CATEGORIES.find(c => c.key === item.category)
                  const isLow = item.reorder_threshold > 0 && item.quantity <= item.reorder_threshold
                  return (
                    <tr key={item.id}>
                      <td style={{ fontWeight: 600 }}>{item.item_name}</td>
                      <td>
                        <span style={{
                          padding: '2px 8px', borderRadius: '4px', fontSize: '9px', fontWeight: 600,
                          background: `color-mix(in srgb, ${cat?.color || 'var(--text3)'} 12%, transparent)`,
                          color: cat?.color || 'var(--text3)',
                          fontFamily: 'var(--mono)', letterSpacing: '0.5px',
                        }}>{cat?.label || item.category}</span>
                      </td>
                      <td style={{
                        fontFamily: 'var(--mono)', fontWeight: 700,
                        color: isLow ? 'var(--red)' : 'var(--text)',
                      }}>
                        {item.quantity} {item.unit}
                      </td>
                      <td style={{ fontFamily: 'var(--mono)', color: 'var(--text3)' }}>
                        {item.reorder_threshold} {item.unit}
                      </td>
                      <td>
                        {isLow ? (
                          <span style={{ padding: '2px 8px', borderRadius: '4px', fontSize: '9px', background: 'rgba(231,76,60,.1)', color: 'var(--red)', fontFamily: 'var(--mono)', fontWeight: 700 }}>
                            DUSUK
                          </span>
                        ) : (
                          <span style={{ padding: '2px 8px', borderRadius: '4px', fontSize: '9px', background: 'rgba(39,201,106,.1)', color: 'var(--green)', fontFamily: 'var(--mono)' }}>
                            YETERLI
                          </span>
                        )}
                      </td>
                      <td style={{ fontFamily: 'var(--mono)', fontSize: '10px', color: 'var(--text3)' }}>
                        {item.last_updated ? new Date(item.last_updated).toLocaleDateString('tr-TR') : '-'}
                      </td>
                      <td>
                        <div style={{ display: 'flex', gap: '4px' }}>
                          <button className="btn btn-ghost btn-xs" style={{ color: 'var(--green)', fontSize: '9px' }}
                            onClick={() => { setAdjustItem(item); setAdjustDelta('') }}>+/-</button>
                          <button className="btn btn-ghost btn-xs" style={{ color: 'var(--red)', fontSize: '9px' }}
                            onClick={() => { if (confirm(`${item.item_name} silinsin mi?`)) deleteMut.mutate(item.id) }}>SiL</button>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* Adjust modal */}
      {adjustItem && (
        <div style={{
          position: 'fixed', inset: 0, zIndex: 999, display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: 'rgba(0,0,0,.6)', backdropFilter: 'blur(4px)',
        }} onClick={() => setAdjustItem(null)}>
          <div style={{
            width: '380px', maxWidth: '90vw', background: 'var(--surface)',
            border: '1px solid var(--border)', borderRadius: '12px',
          }} onClick={e => e.stopPropagation()}>
            <div style={{ height: '3px', background: 'linear-gradient(90deg,var(--green),var(--blue))' }} />
            <div style={{ padding: '20px' }}>
              <div style={{ fontFamily: 'var(--display)', fontSize: '16px', letterSpacing: '2px', marginBottom: '4px' }}>
                STOK HAREKETI
              </div>
              <div style={{ fontFamily: 'var(--mono)', fontSize: '11px', color: 'var(--text2)', marginBottom: '16px' }}>
                {adjustItem.item_name} — Mevcut: {adjustItem.quantity} {adjustItem.unit}
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                <div>
                  <label className="form-label">Miktar (+ giris / - cikis)</label>
                  <input className="form-input" type="number" value={adjustDelta} onChange={e => setAdjustDelta(e.target.value)}
                    placeholder="Ornek: 10 veya -5" />
                </div>
                <div>
                  <label className="form-label">Aciklama</label>
                  <input className="form-input" value={adjustReason} onChange={e => setAdjustReason(e.target.value)}
                    placeholder="Satin alma, kullanim, vs." />
                </div>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <button className="btn btn-ghost" onClick={() => setAdjustItem(null)}>iPTAL</button>
                  <button className="btn btn-primary" style={{ flex: 1 }}
                    disabled={!adjustDelta || +adjustDelta === 0 || adjustMut.isPending}
                    onClick={() => adjustMut.mutate({ id: adjustItem.id, delta: +adjustDelta, reason: adjustReason })}>
                    {adjustMut.isPending ? '...' : +adjustDelta > 0 ? `+${adjustDelta} GiRiS` : `${adjustDelta} CIKIS`}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
