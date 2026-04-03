import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { laundryApi } from '../api.js'

const STATUS_LABEL = {
  received: 'Alındı',
  ironing: 'Ütüde',
  ready: 'Hazır',
  delivered: 'Teslim',
  lost: 'Kayıp',
}

const STATUS_COLOR = {
  received: '#6366f1',
  ironing: '#f59e0b',
  ready: '#10b981',
  delivered: '#3b82f6',
  lost: '#ef4444',
}

export default function GarmentScanModal({ onClose }) {
  const [block, setBlock] = useState('')
  const [roomNo, setRoomNo] = useState('')
  const [roomData, setRoomData] = useState(null)
  const [lookupError, setLookupError] = useState('')
  const [actionResult, setActionResult] = useState(null)

  const qc = useQueryClient()

  const lookupMutation = useMutation({
    mutationFn: () => laundryApi.getRoomForScan(block.trim().toUpperCase(), roomNo.trim()),
    onSuccess: (data) => {
      setRoomData(data)
      setLookupError('')
      setActionResult(null)
    },
    onError: (e) => {
      setLookupError(e.response?.data?.error || 'Oda bulunamadı')
      setRoomData(null)
    },
  })

  const actionMutation = useMutation({
    mutationFn: ({ garment_id, action }) =>
      laundryApi.scanAction({ block: block.trim().toUpperCase(), room_no: roomNo.trim(), garment_id, action }),
    onSuccess: (data, { garment_id, action }) => {
      setActionResult({ garment_id, action, code: data.garment_code, newStatus: data.status })
      qc.invalidateQueries({ queryKey: ['laundry-items'] })
      qc.invalidateQueries({ queryKey: ['premium-garments'] })
      // Refresh room data
      lookupMutation.mutate()
    },
    onError: (e) => setLookupError(e.response?.data?.error || 'İşlem başarısız'),
  })

  const handleLookup = (e) => {
    e.preventDefault()
    if (!block.trim() || !roomNo.trim()) return
    lookupMutation.mutate()
  }

  const garments = roomData?.garments || []
  const actionableStatuses = ['received', 'ironing', 'ready']

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      zIndex: 1000, padding: 16,
    }}>
      <div style={{
        background: '#1e293b', borderRadius: 12, padding: 24,
        width: '100%', maxWidth: 520, maxHeight: '90vh',
        overflow: 'auto', color: '#f1f5f9',
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
          <h3 style={{ margin: 0, fontSize: 18 }}>Oda Tarama</h3>
          <button onClick={onClose} style={{
            background: 'none', border: 'none', color: '#94a3b8',
            fontSize: 20, cursor: 'pointer', lineHeight: 1,
          }}>×</button>
        </div>

        <form onSubmit={handleLookup} style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
          <input
            placeholder="Blok (M1)"
            value={block}
            onChange={e => setBlock(e.target.value)}
            style={{
              flex: 1, padding: '10px 12px', borderRadius: 8,
              border: '1px solid #334155', background: '#0f172a',
              color: '#f1f5f9', fontSize: 14,
            }}
          />
          <input
            placeholder="Oda No (101)"
            value={roomNo}
            onChange={e => setRoomNo(e.target.value)}
            style={{
              flex: 1, padding: '10px 12px', borderRadius: 8,
              border: '1px solid #334155', background: '#0f172a',
              color: '#f1f5f9', fontSize: 14,
            }}
          />
          <button type="submit" disabled={lookupMutation.isPending} style={{
            padding: '10px 16px', borderRadius: 8,
            background: '#6366f1', color: '#fff', border: 'none',
            cursor: 'pointer', fontWeight: 600, fontSize: 14,
          }}>
            {lookupMutation.isPending ? '...' : 'Ara'}
          </button>
        </form>

        {lookupError && (
          <div style={{ color: '#ef4444', marginBottom: 12, fontSize: 13 }}>{lookupError}</div>
        )}

        {actionResult && (
          <div style={{
            background: '#064e3b', border: '1px solid #10b981', borderRadius: 8,
            padding: '10px 14px', marginBottom: 16, fontSize: 13,
          }}>
            ✓ {actionResult.code} → {STATUS_LABEL[actionResult.newStatus] || actionResult.newStatus}
          </div>
        )}

        {roomData && (
          <div>
            <div style={{ color: '#94a3b8', fontSize: 13, marginBottom: 12 }}>
              {block.toUpperCase()} — {roomNo} · {garments.length} parça
            </div>

            {garments.length === 0 ? (
              <div style={{ color: '#64748b', fontSize: 14, padding: '20px 0', textAlign: 'center' }}>
                Bu odaya ait aktif premium parça yok
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {garments.map(g => (
                  <div key={g.id} style={{
                    background: '#0f172a', borderRadius: 8, padding: '12px 14px',
                    border: '1px solid #334155',
                  }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
                      <div>
                        <span style={{
                          background: '#1e40af', color: '#93c5fd',
                          padding: '2px 8px', borderRadius: 4, fontSize: 12, fontFamily: 'monospace',
                          marginRight: 8,
                        }}>{g.garment_code}</span>
                        <span style={{ fontSize: 13, color: '#cbd5e1' }}>{g.garment_type}</span>
                        {g.brand && <span style={{ fontSize: 12, color: '#64748b', marginLeft: 6 }}>{g.brand}</span>}
                      </div>
                      <span style={{
                        background: STATUS_COLOR[g.status] + '22',
                        color: STATUS_COLOR[g.status],
                        padding: '2px 8px', borderRadius: 4, fontSize: 11,
                      }}>{STATUS_LABEL[g.status] || g.status}</span>
                    </div>

                    {actionableStatuses.includes(g.status) && (
                      <div style={{ display: 'flex', gap: 6 }}>
                        {g.status !== 'ready' && (
                          <button
                            onClick={() => actionMutation.mutate({ garment_id: g.id, action: 'advance' })}
                            disabled={actionMutation.isPending}
                            style={{
                              flex: 1, padding: '8px 0', borderRadius: 6, border: 'none',
                              background: '#312e81', color: '#a5b4fc',
                              cursor: 'pointer', fontSize: 13, fontWeight: 600,
                            }}
                          >
                            İlerlet
                          </button>
                        )}
                        {g.status === 'ready' && (
                          <button
                            onClick={() => actionMutation.mutate({ garment_id: g.id, action: 'deliver' })}
                            disabled={actionMutation.isPending}
                            style={{
                              flex: 1, padding: '8px 0', borderRadius: 6, border: 'none',
                              background: '#064e3b', color: '#6ee7b7',
                              cursor: 'pointer', fontSize: 13, fontWeight: 600,
                            }}
                          >
                            Teslim Et
                          </button>
                        )}
                        <button
                          onClick={() => actionMutation.mutate({ garment_id: g.id, action: 'lost' })}
                          disabled={actionMutation.isPending}
                          style={{
                            padding: '8px 12px', borderRadius: 6, border: 'none',
                            background: '#450a0a', color: '#fca5a5',
                            cursor: 'pointer', fontSize: 13, fontWeight: 600,
                          }}
                        >
                          Kayıp
                        </button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
