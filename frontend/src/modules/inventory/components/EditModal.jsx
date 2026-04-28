import { useState, useRef } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import api from '../../../shared/api/client.js'
import { useDraft } from '../../../shared/hooks/useDraft.js'
import DraftBanner from '../../../shared/components/DraftBanner.jsx'
import Modal from './Modal.jsx'
import { CATEGORIES, UNITS, INIT_F } from '../constants.js'

export default function EditModal({ item, onClose, onSave, isPending }) {
  const qc = useQueryClient()
  const [f, sf] = useState(item || INIT_F)
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
      return api.post(`/inventory/${item.id}/photo`, fd, { headers: { 'Content-Type': 'multipart/form-data' } })
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
    <Modal onClose={onClose} title={item?.id ? 'URUN DUZENLE' : 'YENI URUN'} sub="ENVANTER KAYIT FORMU" color="var(--accent),var(--blue)">
      {!item?.id && <DraftBanner hasDraft={hasDraft} onRestore={restoreDraft} onDiscard={discardDraft} />}
      {item?.id && (
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '14px', padding: '10px 12px', background: 'var(--surface2)', borderRadius: '10px' }}>
          {f.photo_url ? (
            <img src={f.photo_url} alt="" style={{ width: '64px', height: '64px', borderRadius: '10px', objectFit: 'cover' }} />
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
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
        <div style={{ gridColumn: '1 / -1' }}>
          <label className="form-label">Urun Adi</label>
          <input className="form-input" value={f.item_name} onChange={e => u('item_name', e.target.value)} autoFocus style={{ borderRadius: '10px' }} />
        </div>
        <div><label className="form-label">Miktar</label><input className="form-input" type="number" min="0" step="any" value={f.quantity} onChange={e => u('quantity', +e.target.value)} style={{ borderRadius: '10px' }} /></div>
        <div><label className="form-label">Birim</label><select className="form-select" value={f.unit} onChange={e => u('unit', e.target.value)} style={{ borderRadius: '10px' }}>{UNITS.map(x => <option key={x} value={x}>{x}</option>)}</select></div>
        <div><label className="form-label">Kategori</label><select className="form-select" value={f.category} onChange={e => u('category', e.target.value)} style={{ borderRadius: '10px' }}>{CATEGORIES.map(c => <option key={c.key} value={c.key}>{c.icon} {c.label}</option>)}</select></div>
        <div><label className="form-label">Min. Esik</label><input className="form-input" type="number" min="0" value={f.reorder_threshold} onChange={e => u('reorder_threshold', +e.target.value)} style={{ borderRadius: '10px' }} /></div>
        <div><label className="form-label">Konum</label><input className="form-input" value={f.location || ''} onChange={e => u('location', e.target.value)} style={{ borderRadius: '10px' }} /></div>
        <div><label className="form-label">Birim Fiyat (TL)</label><input className="form-input" type="number" min="0" step="any" value={f.unit_price || 0} onChange={e => u('unit_price', +e.target.value)} style={{ borderRadius: '10px' }} /></div>
        <div><label className="form-label">Tedarik Suresi (gun)</label><input className="form-input" type="number" min="0" value={f.lead_time_days ?? 7} onChange={e => u('lead_time_days', +e.target.value)} style={{ borderRadius: '10px' }} /></div>
        <div><label className="form-label">Guvenli Stok (gun)</label><input className="form-input" type="number" min="0" value={f.safety_stock_days ?? 3} onChange={e => u('safety_stock_days', +e.target.value)} style={{ borderRadius: '10px' }} /></div>
        <div style={{ gridColumn: '1 / -1', display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontFamily: 'var(--mono)', fontSize: '11px', color: 'var(--text2)' }}>
            <input type="checkbox" checked={!!f.track_lots} onChange={e => u('track_lots', e.target.checked ? 1 : 0)} /> Lot izleme (FIFO)
          </label>
          <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontFamily: 'var(--mono)', fontSize: '11px', color: 'var(--text2)' }}>
            <input type="checkbox" checked={!!f.track_expiry} onChange={e => u('track_expiry', e.target.checked ? 1 : 0)} /> Son kullanma izleme
          </label>
          <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontFamily: 'var(--mono)', fontSize: '11px', color: 'var(--text2)' }}>
            <input type="checkbox" checked={!!f.track_locations} onChange={e => u('track_locations', e.target.checked ? 1 : 0)} /> Lokasyon izleme
          </label>
        </div>
      </div>
      <div style={{ display: 'flex', gap: '8px', marginTop: '18px', justifyContent: 'flex-end' }}>
        <button className="btn btn-ghost" onClick={onClose} style={{ borderRadius: '10px' }}>IPTAL</button>
        <button className="btn btn-primary" disabled={!f.item_name || isPending} onClick={() => { if (!item?.id) onSubmitSuccess(); onSave(f) }} style={{ borderRadius: '10px' }}>
          {isPending ? '...' : item?.id ? 'GUNCELLE' : 'KAYDET'}
        </button>
      </div>
    </Modal>
  )
}
