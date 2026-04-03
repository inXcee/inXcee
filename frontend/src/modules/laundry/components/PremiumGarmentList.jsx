import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { laundryApi } from '../api.js'
import PremiumIntakeModal from './PremiumIntakeModal.jsx'

const STATUS_LABELS = {
  received: 'Teslim Alındı',
  ironing:  'Ütüde',
  ready:    'Hazır',
  delivered:'Teslim Edildi',
}
const STATUS_COLORS = {
  received: 'var(--accent)',
  ironing:  '#6366f1',
  ready:    'var(--green)',
  delivered:'var(--text3)',
}

function StatusBadge({ status }) {
  const color = STATUS_COLORS[status] || 'var(--text3)'
  return (
    <span style={{
      padding: '2px 8px', borderRadius: 4, fontSize: 9,
      fontFamily: 'var(--mono)', letterSpacing: 0.5,
      background: `${color}18`, border: `1px solid ${color}35`, color,
    }}>
      {STATUS_LABELS[status] || status}
    </span>
  )
}

export default function PremiumGarmentList({ item }) {
  const qc = useQueryClient()
  const [selected, setSelected] = useState(new Set())
  const [bulkStatus, setBulkStatus] = useState('ironing')
  const [addOpen, setAddOpen] = useState(false)

  const { data: garments = [], isLoading } = useQuery({
    queryKey: ['premium-garments', item.id],
    queryFn: () => laundryApi.getPremiumGarments(item.id),
    enabled: !!item.id,
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

  const toggleSelect = (id) => {
    setSelected(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  const toggleAll = () => {
    const movable = garments.filter(g => g.status !== 'delivered')
    if (selected.size === movable.length) {
      setSelected(new Set())
    } else {
      setSelected(new Set(movable.map(g => g.id)))
    }
  }

  if (isLoading) {
    return <div style={{ fontSize: 9, color: 'var(--text3)', fontFamily: 'var(--mono)', padding: '8px 0' }}>yükleniyor...</div>
  }

  if (garments.length === 0) {
    return (
      <div style={{ padding: '8px 0' }}>
        <div style={{ fontSize: 9, color: 'var(--text3)', fontFamily: 'var(--mono)', marginBottom: 6 }}>Henüz kıyafet eklenmedi.</div>
        <button className="btn btn-ghost btn-xs" onClick={() => setAddOpen(true)}
          style={{ border: '1px solid var(--border)', fontFamily: 'var(--mono)', fontSize: 9 }}>
          + Parça Ekle
        </button>
        {addOpen && <PremiumIntakeModal item={item} onClose={() => { setAddOpen(false); qc.invalidateQueries({ queryKey: ['premium-garments', item.id] }) }} />}
      </div>
    )
  }

  const movableCount = garments.filter(g => g.status !== 'delivered').length
  const allSelected = selected.size > 0 && selected.size === movableCount

  return (
    <div style={{ marginTop: 10 }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
        <span style={{ fontFamily: 'var(--mono)', fontSize: 8, color: 'var(--text3)', letterSpacing: 1 }}>
          KIYAFETler ({garments.length})
        </span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <button className="btn btn-ghost btn-xs" onClick={() => setAddOpen(true)}
            style={{ border: '1px solid var(--border)', fontFamily: 'var(--mono)', fontSize: 8, padding: '1px 6px' }}>
            + Ekle
          </button>
          {movableCount > 0 && (
            <label style={{ display: 'flex', alignItems: 'center', gap: 4, cursor: 'pointer' }}>
              <input type="checkbox" checked={allSelected} onChange={toggleAll}
                style={{ accentColor: 'var(--accent)', width: 11, height: 11 }} />
              <span style={{ fontSize: 9, color: 'var(--text3)', fontFamily: 'var(--mono)' }}>Tümü</span>
            </label>
          )}
        </div>
      </div>
      {addOpen && <PremiumIntakeModal item={item} onClose={() => { setAddOpen(false); qc.invalidateQueries({ queryKey: ['premium-garments', item.id] }) }} />}

      {/* Garment rows */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        {garments.map(g => {
          const canMove = g.status !== 'delivered'
          return (
            <div key={g.id} style={{
              display: 'flex', alignItems: 'center', gap: 8,
              padding: '6px 8px', borderRadius: 6,
              background: selected.has(g.id) ? 'rgba(240,165,0,0.06)' : 'var(--surface2)',
              border: `1px solid ${selected.has(g.id) ? 'rgba(240,165,0,0.25)' : 'var(--border)'}`,
              transition: 'all 0.15s',
            }}>
              {canMove && (
                <input type="checkbox" checked={selected.has(g.id)} onChange={() => toggleSelect(g.id)}
                  style={{ accentColor: 'var(--accent)', width: 11, height: 11, flexShrink: 0 }} />
              )}
              {!canMove && <div style={{ width: 11, flexShrink: 0 }} />}

              {/* Code chip */}
              <span style={{
                fontFamily: 'var(--mono)', fontSize: 9, letterSpacing: 0.5,
                padding: '1px 6px', borderRadius: 4,
                background: 'rgba(240,165,0,0.1)', border: '1px solid rgba(240,165,0,0.25)',
                color: 'var(--accent)', flexShrink: 0,
              }}>
                {g.garment_code}
              </span>

              {/* Type + brand/model */}
              <div style={{ flex: 1, minWidth: 0 }}>
                <span style={{ fontSize: 9, color: 'var(--text)', fontFamily: 'var(--mono)' }}>
                  {g.garment_type}
                </span>
                {(g.brand || g.model) && (
                  <span style={{ fontSize: 8, color: 'var(--text3)', marginLeft: 4 }}>
                    {[g.brand, g.model].filter(Boolean).join(' ')}
                    {g.size ? ` · ${g.size}` : ''}
                  </span>
                )}
              </div>

              {/* Color dot */}
              {g.color && (
                <span style={{ fontSize: 9, color: 'var(--text3)', fontFamily: 'var(--mono)', flexShrink: 0 }}>
                  {g.color}
                </span>
              )}

              {/* Status badge */}
              <StatusBadge status={g.status} />

              {/* Advance button (single row) */}
              {canMove && (
                <button
                  onClick={() => advanceMut.mutate(g.id)}
                  disabled={advanceMut.isPending}
                  style={{
                    padding: '2px 8px', borderRadius: 4, border: 'none', cursor: 'pointer',
                    background: 'var(--accent)', color: '#000',
                    fontFamily: 'var(--mono)', fontSize: 8, fontWeight: 700, flexShrink: 0,
                    opacity: advanceMut.isPending ? 0.5 : 1,
                  }}
                >
                  İlerlet
                </button>
              )}
            </div>
          )
        })}
      </div>

      {/* Bulk toolbar */}
      {selected.size > 0 && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: 6, marginTop: 8,
          padding: '6px 8px', borderRadius: 6,
          background: 'rgba(240,165,0,0.07)', border: '1px solid rgba(240,165,0,0.2)',
        }}>
          <span style={{ fontSize: 9, color: 'var(--text2)', fontFamily: 'var(--mono)', flexShrink: 0 }}>
            {selected.size} seçili →
          </span>
          <select
            value={bulkStatus}
            onChange={e => setBulkStatus(e.target.value)}
            style={{
              flex: 1, background: 'var(--surface2)', border: '1px solid var(--border)',
              borderRadius: 4, padding: '3px 6px', color: 'var(--text)',
              fontFamily: 'var(--mono)', fontSize: 9, outline: 'none',
            }}
          >
            <option value="ironing">Ütüye Al</option>
            <option value="ready">Hazır Yap</option>
          </select>
          <button
            onClick={() => bulkMut.mutate({ ids: [...selected], to_status: bulkStatus })}
            disabled={bulkMut.isPending}
            style={{
              padding: '3px 10px', borderRadius: 4, border: 'none', cursor: 'pointer',
              background: 'var(--accent)', color: '#000',
              fontFamily: 'var(--mono)', fontSize: 9, fontWeight: 700,
              opacity: bulkMut.isPending ? 0.5 : 1,
            }}
          >
            Uygula
          </button>
        </div>
      )}
    </div>
  )
}
