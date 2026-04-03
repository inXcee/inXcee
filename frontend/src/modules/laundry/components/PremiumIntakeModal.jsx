import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { laundryApi } from '../api.js'

const GARMENT_TYPES = [
  'Pantolon','Gömlek','T-Shirt','Kazak','Sweat','Polar','Mont','Hırka',
  'Ceket','Takım Elbise','Etek','Elbise','Şort','Atlet','İç Çamaşırı',
  'Çorap','Havlu','Yatak Çarşafı','Yastık Kılıfı','Diğer',
]

const SIZES = ['XS','S','M','L','XL','XXL','3XL','4XL','36','38','40','42','44','46','48']

function GarmentRow({ row, idx, onChange, onRemove }) {
  return (
    <tr>
      <td>
        <select
          value={row.garment_type}
          onChange={e => onChange(idx, 'garment_type', e.target.value)}
          style={{ width: '100%', fontFamily: 'var(--mono)', fontSize: 10, background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 4, padding: '3px 6px', color: 'var(--text)' }}
        >
          <option value="">Seç...</option>
          {GARMENT_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
        </select>
      </td>
      <td><input className="form-input" style={{ fontSize: 10 }} value={row.brand} onChange={e => onChange(idx, 'brand', e.target.value)} placeholder="Marka" /></td>
      <td><input className="form-input" style={{ fontSize: 10 }} value={row.model} onChange={e => onChange(idx, 'model', e.target.value)} placeholder="Model" /></td>
      <td>
        <select
          value={row.size}
          onChange={e => onChange(idx, 'size', e.target.value)}
          style={{ width: 70, fontFamily: 'var(--mono)', fontSize: 10, background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 4, padding: '3px 6px', color: 'var(--text)' }}
        >
          <option value="">-</option>
          {SIZES.map(s => <option key={s} value={s}>{s}</option>)}
        </select>
      </td>
      <td><input className="form-input" style={{ fontSize: 10, width: 80 }} value={row.color} onChange={e => onChange(idx, 'color', e.target.value)} placeholder="Renk" /></td>
      <td><input className="form-input" style={{ fontSize: 10 }} value={row.condition_notes} onChange={e => onChange(idx, 'condition_notes', e.target.value)} placeholder="Not" /></td>
      <td>
        <button onClick={() => onRemove(idx)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text3)', fontSize: 14, padding: '0 4px' }}>✕</button>
      </td>
    </tr>
  )
}

function emptyRow() {
  return { garment_type: '', brand: '', model: '', size: '', color: '', pattern: '', condition_notes: '' }
}

export default function PremiumIntakeModal({ item, onClose }) {
  const qc = useQueryClient()
  const [rows, setRows] = useState([emptyRow()])
  const [generatedCodes, setGeneratedCodes] = useState(null)

  const change = (idx, field, val) =>
    setRows(prev => prev.map((r, i) => i === idx ? { ...r, [field]: val } : r))
  const remove = (idx) => setRows(prev => prev.filter((_, i) => i !== idx))
  const add = () => setRows(prev => [...prev, emptyRow()])

  const save = useMutation({
    mutationFn: () => {
      const valid = rows.filter(r => r.garment_type)
      if (!valid.length) throw new Error('En az bir parça tipi seçilmeli')
      return laundryApi.addPremiumGarments(item.id, valid)
    },
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ['laundry-items'] })
      setGeneratedCodes(data.codes)
    },
  })

  const roomLabel = item.block && item.room_no ? `${item.block}${item.room_no}` : `#${item.id}`

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.8)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      zIndex: 1100, backdropFilter: 'blur(4px)',
    }} onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="panel fade-up" style={{ width: 780, maxWidth: '96vw', maxHeight: '92vh', overflow: 'auto' }}>
        <div className="panel-header" style={{
          background: 'linear-gradient(135deg,rgba(240,165,0,0.12),transparent)',
          borderBottom: '1px solid rgba(240,165,0,0.2)',
        }}>
          <div>
            <span className="panel-title">★ PREMİUM PARÇA KAYDI</span>
            <div className="panel-subtitle">Oda {roomLabel} — her parça için detay gir</div>
          </div>
          <button className="btn btn-ghost btn-xs" onClick={onClose}>ESC</button>
        </div>

        <div className="panel-body">
          {!generatedCodes ? (
            <>
              <div style={{ overflowX: 'auto', marginBottom: 12 }}>
                <table className="data-table" style={{ minWidth: 700 }}>
                  <thead>
                    <tr>
                      <th style={{ minWidth: 130 }}>Tip *</th>
                      <th style={{ minWidth: 100 }}>Marka</th>
                      <th style={{ minWidth: 90 }}>Model</th>
                      <th style={{ minWidth: 70 }}>Beden</th>
                      <th style={{ minWidth: 80 }}>Renk</th>
                      <th>Not</th>
                      <th style={{ width: 30 }}></th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((row, idx) => (
                      <GarmentRow key={idx} row={row} idx={idx} onChange={change} onRemove={remove} />
                    ))}
                  </tbody>
                </table>
              </div>

              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <button className="btn btn-ghost btn-sm" onClick={add}>+ Satır Ekle</button>
                <span style={{ fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--text3)' }}>
                  {rows.filter(r => r.garment_type).length} parça hazır
                </span>
                {save.error && (
                  <span style={{ fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--red)' }}>
                    {save.error.message}
                  </span>
                )}
                <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
                  <button className="btn btn-ghost btn-sm" onClick={onClose}>İptal</button>
                  <button
                    className="btn btn-primary"
                    onClick={() => save.mutate()}
                    disabled={save.isPending || !rows.some(r => r.garment_type)}
                  >
                    {save.isPending ? '...' : 'Kaydet & Kod Üret'}
                  </button>
                </div>
              </div>
            </>
          ) : (
            // Başarı ekranı — üretilen kodlar
            <div>
              <div style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--green)', marginBottom: 16, fontWeight: 700 }}>
                ✓ {generatedCodes.length} parça kaydedildi
              </div>
              <div style={{ fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--text3)', marginBottom: 10, letterSpacing: 1 }}>
                PARÇA KODLARI
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 20 }}>
                {generatedCodes.map(code => (
                  <div
                    key={code}
                    onClick={() => navigator.clipboard?.writeText(code)}
                    title="Kopyalamak için tıkla"
                    style={{
                      fontFamily: 'var(--mono)', fontSize: 13, fontWeight: 700,
                      padding: '6px 14px', borderRadius: 6, cursor: 'pointer',
                      background: 'rgba(240,165,0,0.10)', border: '1px solid rgba(240,165,0,0.3)',
                      color: 'var(--accent)', letterSpacing: 2,
                      transition: 'background 0.15s',
                    }}
                  >
                    {code}
                  </div>
                ))}
              </div>
              <div style={{ fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--text3)', marginBottom: 16 }}>
                Kodlara tıklayarak kopyalayabilirsin
              </div>
              <button className="btn btn-primary" onClick={onClose}>Tamam</button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
