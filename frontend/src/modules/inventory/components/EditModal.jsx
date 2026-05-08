import { useState, useRef } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import api from '../../../shared/api/client.js'
import { useDraft } from '../../../shared/hooks/useDraft.js'
import DraftBanner from '../../../shared/components/DraftBanner.jsx'
import Modal from './Modal.jsx'
import { CATEGORIES, UNITS, INIT_F } from '../constants.js'

const QUICK_UNITS = ['adet', 'kg', 'litre', 'paket', 'kutu']

export default function EditModal({ item, onClose, onSave, isPending }) {
  const qc = useQueryClient()
  const [f, sf] = useState(item || INIT_F)
  const [advanced, setAdvanced] = useState(false)
  const u = (k, v) => sf(p => ({ ...p, [k]: v }))
  const draftKey = item?.id ? null : 'draft:inventory:new-item'
  const { hasDraft, restoreDraft, discardDraft, onSubmitSuccess } = useDraft(
    draftKey ?? 'draft:inventory:new-item',
    f,
    sf,
    item || INIT_F,
  )
  const fileRef = useRef(null)
  const photoUpload = useMutation({
    mutationFn: file => {
      const fd = new FormData()
      fd.append('photo', file)
      return api.post(`/inventory/${item.id}/photo`, fd)
    },
    onSuccess: r => {
      u('photo_url', r.data.photo_url)
      qc.invalidateQueries({ queryKey: ['inventory'] })
    },
  })
  const photoDelete = useMutation({
    mutationFn: () => api.delete(`/inventory/${item.id}/photo`),
    onSuccess: () => { u('photo_url', null); qc.invalidateQueries({ queryKey: ['inventory'] }) },
  })

  return (
    <Modal onClose={onClose} title={item?.id ? 'URUN DUZENLE' : 'YENI URUN'} sub="ENVANTER KAYIT FORMU" color="var(--accent),var(--blue)" wide>
      {!item?.id && <DraftBanner hasDraft={hasDraft} onRestore={restoreDraft} onDiscard={discardDraft} />}

      {/* Foto + ad ust kismi */}
      {item?.id && (
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '14px', padding: '10px 12px', background: 'var(--surface2)', borderRadius: '10px' }}>
          {f.photo_url ? (
            <img loading="lazy" src={f.photo_url} alt="" style={{ width: '64px', height: '64px', borderRadius: '10px', objectFit: 'cover' }} />
          ) : (
            <div style={{ width: '64px', height: '64px', borderRadius: '10px', background: 'var(--surface3)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '20px', color: 'var(--text3)' }}>📷</div>
          )}
          <div style={{ flex: 1 }}>
            <div style={{ fontFamily: 'var(--mono)', fontSize: '9px', color: 'var(--text4)', letterSpacing: '1px', marginBottom: '4px' }}>FOTOGRAF</div>
            <div style={{ display: 'flex', gap: '6px' }}>
              <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp" style={{ display: 'none' }}
                onChange={e => { const file = e.target.files?.[0]; if (file) photoUpload.mutate(file) }} />
              <button type="button" onClick={() => fileRef.current?.click()} className="btn btn-ghost btn-xs" disabled={photoUpload.isPending} style={{ borderRadius: '8px' }}>
                {photoUpload.isPending ? 'YUKLENIYOR...' : (f.photo_url ? 'DEGISTIR' : 'YUKLE')}
              </button>
              {f.photo_url && (
                <button type="button" onClick={() => photoDelete.mutate()} className="btn btn-ghost btn-xs" disabled={photoDelete.isPending} style={{ borderRadius: '8px', color: 'var(--red)' }}>SIL</button>
              )}
            </div>
            {photoUpload.isError && <div style={{ fontFamily: 'var(--mono)', fontSize: '9px', color: 'var(--red)', marginTop: '4px' }}>{photoUpload.error?.response?.data?.error || 'Hata'}</div>}
          </div>
        </div>
      )}

      {/* Urun Adi */}
      <div style={{ marginBottom: '14px' }}>
        <label className="form-label">Urun Adi *</label>
        <input className="form-input" value={f.item_name} onChange={e => u('item_name', e.target.value)}
          placeholder="Ornegin: Beyaz Camasir Deterjani 3kg" autoFocus
          style={{ fontSize: '15px', borderRadius: '10px' }} />
      </div>

      {/* Kategori — buyuk icon butonlar */}
      <div style={{ marginBottom: '14px' }}>
        <label className="form-label">Kategori</label>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '6px' }}>
          {CATEGORIES.map(c => {
            const active = f.category === c.key
            return (
              <button key={c.key} type="button" onClick={() => u('category', c.key)} style={{
                padding: '12px 8px', border: `1px solid ${active ? c.color : 'var(--border)'}`,
                borderRadius: '10px', cursor: 'pointer',
                background: active ? c.bg : 'var(--surface)',
                color: active ? c.color : 'var(--text2)',
                display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px',
                transition: 'all .15s',
              }}>
                <span style={{ fontSize: '20px' }}>{c.icon}</span>
                <span style={{ fontFamily: 'var(--mono)', fontSize: '9px', fontWeight: 700, letterSpacing: '1px' }}>{c.label}</span>
              </button>
            )
          })}
        </div>
      </div>

      {/* Miktar + Birim — birim chips */}
      <div style={{ display: 'grid', gridTemplateColumns: '120px 1fr', gap: '10px', marginBottom: '14px' }}>
        <div>
          <label className="form-label">Miktar</label>
          <input className="form-input" type="number" min="0" step="any" value={f.quantity}
            onChange={e => u('quantity', +e.target.value)}
            style={{ fontSize: '18px', fontFamily: 'var(--mono)', textAlign: 'center', borderRadius: '10px' }} />
        </div>
        <div>
          <label className="form-label">Birim</label>
          <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
            {QUICK_UNITS.map(x => (
              <button key={x} type="button" onClick={() => u('unit', x)} style={{
                padding: '8px 14px', border: `1px solid ${f.unit === x ? 'var(--accent)' : 'var(--border)'}`,
                borderRadius: '8px', cursor: 'pointer',
                background: f.unit === x ? 'rgba(240,165,0,.1)' : 'var(--surface)',
                color: f.unit === x ? 'var(--accent)' : 'var(--text2)',
                fontFamily: 'var(--mono)', fontSize: '11px', fontWeight: 700,
              }}>{x}</button>
            ))}
            <select className="form-select" value={QUICK_UNITS.includes(f.unit) ? '' : f.unit}
              onChange={e => e.target.value && u('unit', e.target.value)}
              style={{ width: 'auto', borderRadius: '8px', fontSize: '11px', padding: '8px 10px' }}>
              <option value="">+ digerleri</option>
              {UNITS.filter(x => !QUICK_UNITS.includes(x)).map(x => <option key={x} value={x}>{x}</option>)}
            </select>
          </div>
        </div>
      </div>

      {/* Esik + Birim Fiyat + Konum */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '10px', marginBottom: '14px' }}>
        <div>
          <label className="form-label">Min. Esik</label>
          <input className="form-input" type="number" min="0" value={f.reorder_threshold}
            onChange={e => u('reorder_threshold', +e.target.value)} placeholder="0 = uyari yok"
            style={{ borderRadius: '10px' }} />
        </div>
        <div>
          <label className="form-label">Birim Fiyat (TL)</label>
          <input className="form-input" type="number" min="0" step="any" value={f.unit_price || 0}
            onChange={e => u('unit_price', +e.target.value)}
            style={{ borderRadius: '10px' }} />
        </div>
        <div>
          <label className="form-label">Konum</label>
          <input className="form-input" value={f.location || ''} onChange={e => u('location', e.target.value)}
            placeholder="Depo/raf" style={{ borderRadius: '10px' }} />
        </div>
      </div>

      {/* LOT/SKT IZLEME — gorunur switch (track_lots tek bayrak — FIFO + SKT birlikte) */}
      <div style={{
        marginBottom: '14px', padding: '12px 14px',
        background: f.track_lots ? 'rgba(155,89,182,.06)' : 'var(--surface2)',
        border: `1px solid ${f.track_lots ? 'var(--purple)' : 'var(--border)'}`,
        borderRadius: '12px',
        cursor: 'pointer', transition: 'all .15s',
      }} onClick={() => u('track_lots', f.track_lots ? 0 : 1)}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <div style={{
            width: '38px', height: '22px', borderRadius: '11px', position: 'relative',
            background: f.track_lots ? 'var(--purple)' : 'var(--surface3)', transition: 'background .2s',
            flexShrink: 0,
          }}>
            <div style={{
              width: '16px', height: '16px', borderRadius: '50%', background: '#fff',
              position: 'absolute', top: '3px', left: f.track_lots ? '19px' : '3px',
              transition: 'left .2s',
            }} />
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 600, fontSize: '13px', color: f.track_lots ? 'var(--purple)' : 'var(--text)' }}>
              ⏳ Lot / Son Kullanma Tarihi (SKT) İzleme
            </div>
            <div style={{ fontFamily: 'var(--mono)', fontSize: '10px', color: 'var(--text3)', marginTop: '3px' }}>
              {f.track_lots
                ? 'Mal giriste lot no + SKT istenir, FIFO cikis, 30g kala uyari'
                : 'Acmazsan SKT takibi yapilmaz'}
            </div>
          </div>
        </div>
      </div>

      {/* Gelismis ayarlar (collapse) */}
      <div style={{ marginBottom: '14px' }}>
        <button type="button" onClick={() => setAdvanced(a => !a)} style={{
          width: '100%', padding: '8px 12px', border: '1px solid var(--border)', borderRadius: '10px',
          background: 'var(--surface2)', color: 'var(--text3)', cursor: 'pointer',
          fontFamily: 'var(--mono)', fontSize: '10px', letterSpacing: '1px',
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        }}>
          <span>GELISMIS AYARLAR (sku, tedarik suresi, lokasyon)</span>
          <span>{advanced ? '▲' : '▼'}</span>
        </button>
        {advanced && (
          <div style={{ marginTop: '10px', padding: '12px', background: 'var(--surface2)', borderRadius: '10px', border: '1px solid var(--border)' }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '10px', marginBottom: '10px' }}>
              <div>
                <label className="form-label">SKU (kisa kod)</label>
                <input className="form-input" value={f.sku || ''} onChange={e => u('sku', e.target.value)}
                  placeholder="TXT-001" style={{ borderRadius: '8px', fontSize: '11px' }} />
              </div>
              <div>
                <label className="form-label">Tedarik Suresi (g)</label>
                <input className="form-input" type="number" min="0" value={f.lead_time_days ?? 7}
                  onChange={e => u('lead_time_days', +e.target.value)}
                  style={{ borderRadius: '8px', fontSize: '11px' }} />
              </div>
              <div>
                <label className="form-label">Guvenli Stok (g)</label>
                <input className="form-input" type="number" min="0" value={f.safety_stock_days ?? 3}
                  onChange={e => u('safety_stock_days', +e.target.value)}
                  style={{ borderRadius: '8px', fontSize: '11px' }} />
              </div>
            </div>
            <label style={{
              display: 'flex', alignItems: 'center', gap: '8px',
              padding: '8px 10px', border: `1px solid ${f.track_locations ? 'var(--blue)' : 'var(--border)'}`,
              borderRadius: '8px', background: f.track_locations ? 'rgba(52,152,219,.06)' : 'var(--surface)',
              fontFamily: 'var(--mono)', fontSize: '11px', cursor: 'pointer',
              color: f.track_locations ? 'var(--blue)' : 'var(--text3)',
            }}>
              <input type="checkbox" checked={!!f.track_locations} onChange={e => u('track_locations', e.target.checked ? 1 : 0)} />
              Lokasyon izleme (coklu raf takibi)
            </label>
          </div>
        )}
      </div>

      <div style={{ display: 'flex', gap: '8px', marginTop: '4px', justifyContent: 'flex-end' }}>
        <button className="btn btn-ghost" onClick={onClose} style={{ borderRadius: '10px' }}>IPTAL</button>
        <button className="btn btn-primary" disabled={!f.item_name || isPending}
          onClick={() => { if (!item?.id) onSubmitSuccess(); onSave(f) }}
          style={{ borderRadius: '10px', padding: '10px 24px' }}>
          {isPending ? '...' : item?.id ? 'GUNCELLE' : 'KAYDET'}
        </button>
      </div>
    </Modal>
  )
}
