// Arıza kayıtlarını duruma göre kolonlayan sürükle-bırak kanban panosu.
// Karta tıklama detay paneli açar; kolonlar arası bırakma durumu günceller.
import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import api from '../../shared/api/client.js'
import { STATUSES, priInfo, SLACountdown } from './shared.jsx'

export default function KanbanView({ requests, onSelect }) {
  const qc = useQueryClient()
  const [dragId, setDragId] = useState(null)
  const [dragOver, setDragOver] = useState(null)

  const statusMut = useMutation({
    mutationFn: ({ id, status }) => api.patch(`/maintenance/requests/${id}/status`, { status }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['maintenance-requests'] })
      qc.invalidateQueries({ queryKey: ['maintenance-stats'] })
    },
  })

  const handleDragStart = (e, id) => {
    setDragId(id)
    e.dataTransfer.effectAllowed = 'move'
    e.dataTransfer.setData('text/plain', id)
    e.currentTarget.style.opacity = '0.4'
  }

  const handleDragEnd = (e) => {
    e.currentTarget.style.opacity = '1'
    setDragId(null)
    setDragOver(null)
  }

  const handleDragOver = (e, statusKey) => {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
    setDragOver(statusKey)
  }

  const handleDrop = (e, targetStatus) => {
    e.preventDefault()
    setDragOver(null)
    if (!dragId) return
    const req = requests.find(r => r.id === dragId)
    if (req && req.status !== targetStatus) {
      statusMut.mutate({ id: dragId, status: targetStatus })
    }
    setDragId(null)
  }

  return (
    <div style={{
      display: 'flex', gap: '10px', overflowX: 'auto', paddingBottom: '8px',
    }}>
      {STATUSES.map(st => {
        const items = requests.filter(r => r.status === st.key)
        const isOver = dragOver === st.key
        return (
          <div key={st.key}
            onDragOver={e => handleDragOver(e, st.key)}
            onDragLeave={() => setDragOver(null)}
            onDrop={e => handleDrop(e, st.key)}
            style={{
              flex: '1 0 200px', minWidth: '200px', maxWidth: '320px',
              background: isOver ? `color-mix(in srgb, ${st.dotColor} 8%, var(--surface2))` : 'var(--surface2)',
              border: isOver ? `2px dashed ${st.dotColor}` : '1px solid var(--border)',
              borderRadius: '10px',
              display: 'flex', flexDirection: 'column',
              transition: 'all .2s',
            }}>
            <div style={{
              padding: '10px 14px', borderBottom: '1px solid var(--border)',
              display: 'flex', alignItems: 'center', gap: '8px',
            }}>
              <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: st.dotColor }} />
              <span style={{
                fontFamily: 'var(--mono)', fontSize: '9px', letterSpacing: '1.5px',
                color: st.color, fontWeight: 700,
              }}>{st.label}</span>
              <span style={{
                marginLeft: 'auto', fontFamily: 'var(--mono)', fontSize: '9px',
                color: 'var(--text4)',
              }}>{items.length}</span>
            </div>
            <div style={{
              padding: '8px', display: 'flex', flexDirection: 'column', gap: '6px',
              flex: 1, overflowY: 'auto', maxHeight: '60vh',
              minHeight: '80px',
            }}>
              {items.length === 0 && (
                <div style={{
                  fontFamily: 'var(--mono)', fontSize: '9px', color: 'var(--text4)',
                  padding: '20px 0', textAlign: 'center',
                  border: isOver ? 'none' : '2px dashed var(--border2)',
                  borderRadius: '8px', margin: '4px',
                }}>
                  {isOver ? 'Buraya bırak' : 'Kayıt yok'}
                </div>
              )}
              {items.map(req => {
                const pri = priInfo(req.priority)
                return (
                  <div key={req.id}
                    draggable
                    onDragStart={e => handleDragStart(e, req.id)}
                    onDragEnd={handleDragEnd}
                    onClick={() => onSelect(req.id)}
                    style={{
                      padding: '10px 12px', borderRadius: '8px', cursor: 'grab',
                      background: 'var(--surface)', border: '1px solid var(--border)',
                      borderLeft: `3px solid ${pri.color}`,
                      transition: 'all .15s',
                      userSelect: 'none',
                    }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '4px' }}>
                      <span style={{ fontFamily: 'var(--sans)', fontSize: '12px', fontWeight: 600, color: 'var(--text)' }}>
                        {req.location}
                      </span>
                      <span style={{
                        fontFamily: 'var(--mono)', fontSize: '8px', padding: '1px 6px', borderRadius: '3px',
                        color: pri.color,
                        background: `color-mix(in srgb, ${pri.color} 12%, transparent)`,
                      }}>{pri.label}</span>
                    </div>
                    <div style={{
                      fontSize: '11px', color: 'var(--text2)', marginBottom: '4px',
                      overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                    }}>{req.description}</div>
                    <div style={{ fontFamily: 'var(--mono)', fontSize: '8px', color: 'var(--text3)', display: 'flex', gap: '6px', alignItems: 'center', flexWrap: 'wrap' }}>
                      <span>#{req.id}</span>
                      {req.wait_reason && (
                        <span style={{
                          padding: '1px 5px', borderRadius: '3px',
                          background: 'rgba(240,165,0,.1)', border: '1px solid rgba(240,165,0,.2)',
                          color: 'var(--amber)',
                        }}>{req.wait_reason}</span>
                      )}
                      {req.sla_deadline && req.status !== 'done' && (
                        <SLACountdown deadline={req.sla_deadline} />
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )
      })}
    </div>
  )
}
