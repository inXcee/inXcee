import { useState } from 'react'
import { useDraft } from '../../../shared/hooks/useDraft.js'
import DraftBanner from '../../../shared/components/DraftBanner.jsx'
import Modal from './Modal.jsx'
import { CATEGORIES, UNITS, INIT_F } from '../constants.js'

export default function EditModal({ item, onClose, onSave, isPending }) {
  const [f, sf] = useState(item || INIT_F)
  const u = (k, v) => sf(p => ({ ...p, [k]: v }))
  const draftKey = item?.id ? null : 'draft:inventory:new-item'
  const { hasDraft, restoreDraft, discardDraft, onSubmitSuccess } = useDraft(
    draftKey ?? 'draft:inventory:new-item',
    f,
    sf,
    item || INIT_F,
  )
  return (
    <Modal onClose={onClose} title={item?.id ? 'URUN DUZENLE' : 'YENI URUN'} sub="ENVANTER KAYIT FORMU" color="var(--accent),var(--blue)">
      {!item?.id && <DraftBanner hasDraft={hasDraft} onRestore={restoreDraft} onDiscard={discardDraft} />}
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
