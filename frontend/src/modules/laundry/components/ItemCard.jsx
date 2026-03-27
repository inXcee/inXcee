import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { laundryApi } from '../api.js'

const STATUS = {
  dirty:   { label: 'Sepette',     badgeClass: 'badge-amber' },
  washing: { label: 'Yıkanıyor',   badgeClass: 'badge-blue'  },
  ready:   { label: 'Rafta Hazır', badgeClass: 'badge-green' },
  lost:    { label: 'Kayıp',       badgeClass: 'badge-gray'  },
}

export default function ItemCard({ item, machines = [], onDeliver, onDamage, selected, onSelect }) {
  const qc = useQueryClient()
  const [expanded, setExpanded] = useState(false)

  const advance = useMutation({
    mutationFn: (data) => laundryApi.advanceItem(item.id, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['laundry-items'] }),
  })

  const markLost = useMutation({
    mutationFn: () => laundryApi.lostItem(item.id, {}),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['laundry-items'] }),
  })

  const deleteItem = useMutation({
    mutationFn: () => laundryApi.deleteItem(item.id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['laundry-items'] }),
  })

  const st = STATUS[item.status] || STATUS.dirty
  const isSlaWarning = item.hours_in_status > 24
  const isSlaRed = item.hours_in_status > 48

  return (
    <div className="panel" style={{
      borderLeft: `3px solid ${item.urgent ? 'var(--red)' : item.status === 'ready' ? 'var(--green)' : 'var(--accent)'}`,
      transition: 'all 0.15s',
    }}>
      <div style={{ padding: '12px 14px' }}>
        {/* Üst satır: Oda + Durum + Seçim */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            {onSelect && (
              <input type="checkbox" checked={selected}
                onChange={() => onSelect(item.id)}
                style={{ accentColor: 'var(--accent)' }} />
            )}
            <span style={{ fontFamily: 'var(--display)', fontSize: 16, letterSpacing: 2, color: 'var(--text)' }}>
              {item.block || '?'} · {item.room_no || '?'}
            </span>
            {item.urgent === 1 && (
              <span className="badge badge-red" style={{ fontSize: 8 }}>ACİL</span>
            )}
            {item.damage_count > 0 && (
              <span className="badge badge-amber" style={{ fontSize: 8 }}>HASAR {item.damage_count}</span>
            )}
          </div>
          <span className={`badge ${st.badgeClass}`}>{st.label}</span>
        </div>

        {/* Bilgi satırı */}
        <div style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--text3)', display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <span>{item.item_count} parça</span>
          {item.created_by_name && <span>{item.created_by_name}</span>}
          {item.machine_name && <span>{item.machine_name}</span>}
          {item.shelf_location && <span>Raf: {item.shelf_location}</span>}
          {item.hours_in_status != null && (
            <span style={{ color: isSlaRed ? 'var(--red)' : isSlaWarning ? 'var(--accent)' : 'var(--text3)' }}>
              {isSlaWarning && '! '}{item.hours_in_status}s
            </span>
          )}
        </div>

        {item.notes && (
          <div style={{ fontFamily: 'var(--sans)', fontSize: 11, color: 'var(--text2)', marginTop: 4, fontStyle: 'italic' }}>
            {item.notes}
          </div>
        )}

        {/* Aksiyonlar */}
        {item.status !== 'lost' && item.status !== 'delivered' && (
          <div style={{ display: 'flex', gap: 6, marginTop: 10, flexWrap: 'wrap', alignItems: 'center' }}>
            {item.status === 'dirty' && (
              <MachineSelect
                machines={machines.filter(m => m.status === 'idle')}
                onSelect={(machine_id) => advance.mutate({ machine_id })}
                loading={advance.isPending}
              />
            )}
            {item.status === 'washing' && (
              <button className="btn btn-primary btn-sm"
                onClick={() => {
                  const shelf = prompt('Raf konumu (örn: 2. Kat):')
                  if (shelf !== null) advance.mutate({ shelf_location: shelf })
                }}
                disabled={advance.isPending}>
                Rafa Koy
              </button>
            )}
            {item.status === 'ready' && (
              <button className="btn btn-primary btn-sm" onClick={() => onDeliver(item)}>
                Teslim Et
              </button>
            )}
            {onDamage && (
              <button className="btn btn-ghost btn-sm" onClick={() => onDamage(item)}>
                Hasar
              </button>
            )}
            <button className="btn btn-ghost btn-sm"
              onClick={() => setExpanded(!expanded)}>
              {expanded ? 'Kapat' : '...'}
            </button>
          </div>
        )}

        {/* Genişletilmiş: Ek aksiyonlar */}
        {expanded && (
          <div style={{ display: 'flex', gap: 6, marginTop: 8, paddingTop: 8, borderTop: '1px solid var(--border)' }}>
            <button className="btn btn-ghost btn-xs"
              onClick={() => { if (confirm('Kayıp olarak işaretle?')) markLost.mutate() }}>
              Kayıp
            </button>
            {item.status === 'dirty' && (
              <button className="btn btn-danger btn-xs"
                onClick={() => { if (confirm('Kaydı sil?')) deleteItem.mutate() }}>
                Sil
              </button>
            )}
          </div>
        )}

        {/* Hata mesajı */}
        {advance.isError && (
          <div className="alert alert-danger" style={{ marginTop: 8, padding: '6px 10px', fontSize: 11 }}>
            {advance.error?.response?.data?.error || 'İşlem hatası'}
          </div>
        )}
      </div>
    </div>
  )
}

function MachineSelect({ machines, onSelect, loading }) {
  if (!machines.length) {
    return <span style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--text3)' }}>Boş makine yok</span>
  }
  return (
    <select className="form-select" style={{ width: 'auto', padding: '5px 10px', fontSize: 10 }}
      onChange={e => e.target.value && onSelect(+e.target.value)}
      defaultValue="" disabled={loading}>
      <option value="">Makineye At...</option>
      {machines.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
    </select>
  )
}
