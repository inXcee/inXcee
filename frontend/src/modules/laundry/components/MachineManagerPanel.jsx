import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { laundryApi } from '../api.js'

const overlay = { position: 'fixed', inset: 0, zIndex: 1000, background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }
const panel  = { background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 14, width: '100%', maxWidth: 460, boxShadow: '0 24px 64px rgba(0,0,0,0.5)', maxHeight: '85vh', display: 'flex', flexDirection: 'column' }
const hdr    = { padding: '18px 20px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontFamily: 'var(--display)', fontSize: 16, letterSpacing: 3, color: 'var(--text)', borderBottom: '1px solid var(--border)', flexShrink: 0 }

const STATUS_COLOR = { idle: 'var(--text3)', running: 'var(--accent)', done: 'var(--red)', maintenance: 'var(--text4)' }

export default function MachineManagerPanel({ machines, onClose }) {
  const qc = useQueryClient()
  const [showAdd, setShowAdd]     = useState(false)
  const [newName, setNewName]     = useState('')
  const [newType, setNewType]     = useState('washer')
  const [newKg, setNewKg]         = useState('10')

  const create = useMutation({
    mutationFn: () => laundryApi.createMachine({ name: newName.trim(), type: newType, capacity_kg: parseFloat(newKg) || 10 }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['laundry-machines'] })
      setShowAdd(false); setNewName(''); setNewType('washer'); setNewKg('10')
    },
  })

  const update = useMutation({
    mutationFn: ({ id, fields }) => laundryApi.updateMachine(id, fields),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['laundry-machines'] }),
  })

  const remove = useMutation({
    mutationFn: (id) => laundryApi.deleteMachine(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['laundry-machines'] }),
  })

  return (
    <div style={overlay} onClick={e => e.target === e.currentTarget && onClose()}>
      <div style={panel}>

        {/* Header */}
        <div style={hdr}>
          <span>MAKİNELER</span>
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={() => setShowAdd(s => !s)} style={{
              padding: '6px 14px', borderRadius: 8, cursor: 'pointer',
              background: 'rgba(99,102,241,0.1)', color: 'var(--accent)',
              border: '1px solid rgba(99,102,241,0.25)',
              fontFamily: 'var(--mono)', fontSize: 10, fontWeight: 700,
            }}>+ Ekle</button>
            <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text3)', fontSize: 16 }}>✕</button>
          </div>
        </div>

        {/* Add form */}
        {showAdd && (
          <div style={{ padding: '12px 20px', borderBottom: '1px solid var(--border)', background: 'var(--surface2)', flexShrink: 0 }}>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <input
                autoFocus className="form-input"
                style={{ flex: 2, minWidth: 140, padding: '8px 12px', fontSize: 12, borderRadius: 8 }}
                placeholder="Makine adı"
                value={newName}
                onChange={e => setNewName(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && newName.trim() && create.mutate()}
              />
              <select className="form-input"
                style={{ flex: 1, minWidth: 90, padding: '8px 10px', fontSize: 12, borderRadius: 8 }}
                value={newType} onChange={e => setNewType(e.target.value)}
              >
                <option value="washer">Çamaşır</option>
                <option value="dryer">Kurutucu</option>
              </select>
              <input type="number" min="1" max="20" className="form-input"
                style={{ width: 70, padding: '8px 10px', fontSize: 12, borderRadius: 8 }}
                placeholder="kg" value={newKg} onChange={e => setNewKg(e.target.value)}
              />
              <button
                onClick={() => newName.trim() && create.mutate()}
                disabled={!newName.trim() || create.isPending}
                style={{ padding: '8px 14px', borderRadius: 8, cursor: 'pointer', background: 'var(--accent)', color: '#000', border: 'none', fontFamily: 'var(--mono)', fontSize: 10, fontWeight: 700 }}
              >
                {create.isPending ? '...' : 'Kaydet'}
              </button>
            </div>
            {create.isError && (
              <div style={{ marginTop: 6, fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--red)' }}>
                {create.error?.response?.data?.error || 'Hata'}
              </div>
            )}
          </div>
        )}

        {/* Machine list */}
        <div style={{ flex: 1, overflowY: 'auto' }}>
          {machines.length === 0 ? (
            <div style={{ padding: 24, textAlign: 'center', fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--text3)' }}>
              Makine yok — yukarıdan ekle
            </div>
          ) : machines.map(m => {
            const canDelete = m.active_items === 0 && m.status !== 'running'
            const inMaint   = m.status === 'maintenance'
            return (
              <div key={m.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 20px', borderBottom: '1px solid var(--border)' }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontFamily: 'var(--mono)', fontSize: 12, color: 'var(--text)', marginBottom: 2 }}>
                    {m.name}
                  </div>
                  <div style={{ fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--text3)', display: 'flex', gap: 8 }}>
                    <span>{m.type === 'washer' ? 'Çamaşır' : 'Kurutucu'}</span>
                    <span>{m.capacity_kg}kg</span>
                    <span style={{ color: STATUS_COLOR[m.status] || 'var(--text3)' }}>{m.status}</span>
                    {m.active_items > 0 && <span style={{ color: 'var(--accent)' }}>{m.active_items} yıkama</span>}
                  </div>
                </div>
                <button
                  onClick={() => {
                    if (inMaint) {
                      update.mutate({ id: m.id, fields: { status: 'idle', maintenance_notes: null } })
                    } else {
                      const note = window.prompt('Bakım notu (opsiyonel):')
                      if (note === null) return
                      update.mutate({ id: m.id, fields: { status: 'maintenance', maintenance_notes: note || null } })
                    }
                  }}
                  disabled={m.status === 'running' || update.isPending}
                  style={{
                    padding: '5px 10px', borderRadius: 6, cursor: m.status === 'running' ? 'not-allowed' : 'pointer',
                    fontFamily: 'var(--mono)', fontSize: 9,
                    background: inMaint ? 'rgba(16,185,129,0.1)' : 'var(--surface2)',
                    color: inMaint ? 'var(--green)' : 'var(--text3)',
                    border: `1px solid ${inMaint ? 'rgba(16,185,129,0.3)' : 'var(--border)'}`,
                    opacity: m.status === 'running' ? 0.4 : 1,
                  }}
                >
                  {inMaint ? 'Aktif Et' : 'Bakım'}
                </button>
                <button
                  onClick={() => canDelete && remove.mutate(m.id)}
                  disabled={!canDelete || remove.isPending}
                  title={!canDelete ? 'Aktif yıkama var veya çalışıyor' : 'Makineyi sil'}
                  style={{
                    padding: '5px 8px', borderRadius: 6, cursor: canDelete ? 'pointer' : 'not-allowed',
                    background: 'transparent', fontFamily: 'var(--mono)', fontSize: 10,
                    color: canDelete ? 'var(--red)' : 'var(--text4)',
                    border: `1px solid ${canDelete ? 'rgba(231,76,60,0.3)' : 'var(--border)'}`,
                    opacity: canDelete ? 1 : 0.35,
                  }}
                >
                  ✕
                </button>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
