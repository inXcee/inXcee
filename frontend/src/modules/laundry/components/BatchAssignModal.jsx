import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { laundryApi } from '../api.js'

export default function BatchAssignModal({ selectedIds, onClose, onSuccess }) {
  const qc = useQueryClient()
  const { data: machines = [] } = useQuery({
    queryKey: ['laundry-machines'],
    queryFn: laundryApi.getMachines,
  })
  const [machineId, setMachineId] = useState('')
  const [timer, setTimer] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [result, setResult] = useState(null)

  const available = machines.filter(m => m.status === 'idle')

  async function handleSubmit(e) {
    e.preventDefault()
    if (!machineId) return setError('Makine seçilmeli')
    setLoading(true)
    setError(null)
    try {
      const res = await laundryApi.batchAssign([...selectedIds], +machineId, timer ? +timer : null)
      qc.invalidateQueries({ queryKey: ['laundry-items'] })
      qc.invalidateQueries({ queryKey: ['laundry-machines'] })
      setResult(res)
    } catch (err) {
      setError(err?.response?.data?.error || err.message)
    } finally {
      setLoading(false)
    }
  }

  const overlay = {
    position: 'fixed', inset: 0, zIndex: 1100,
    background: 'rgba(0,0,0,0.65)', backdropFilter: 'blur(4px)',
    display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16,
  }
  const box = {
    background: 'var(--surface)', border: '1px solid var(--border)',
    borderRadius: 14, width: '100%', maxWidth: 400,
    boxShadow: '0 24px 64px rgba(0,0,0,0.5)',
  }

  if (result) {
    return (
      <div style={overlay} onClick={onClose}>
        <div style={box} onClick={e => e.stopPropagation()}>
          <div style={{ padding: '20px 24px', borderBottom: '1px solid var(--border)', fontFamily: 'var(--display)', fontSize: 14, letterSpacing: 3 }}>
            TOPLU ATAMA SONUCU
          </div>
          <div style={{ padding: '16px 24px' }}>
            <div style={{ fontFamily: 'var(--mono)', fontSize: 12, color: 'var(--green)', marginBottom: 8 }}>
              ✓ {result.success.length} kayıt makineye atandı
            </div>
            {result.failed.length > 0 && (
              <div style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--red)' }}>
                ✕ {result.failed.length} kayıt atlanamadı
              </div>
            )}
          </div>
          <div style={{ padding: '12px 24px 20px', display: 'flex', justifyContent: 'flex-end' }}>
            <button
              onClick={onSuccess}
              style={{
                padding: '8px 20px', borderRadius: 8, cursor: 'pointer',
                background: 'var(--accent)', color: '#000', border: 'none',
                fontFamily: 'var(--mono)', fontSize: 11, fontWeight: 700,
              }}
            >
              Tamam
            </button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div style={overlay} onClick={onClose}>
      <div style={box} onClick={e => e.stopPropagation()}>
        <div style={{ padding: '20px 24px', borderBottom: '1px solid var(--border)', fontFamily: 'var(--display)', fontSize: 14, letterSpacing: 3 }}>
          {selectedIds.size} PARÇAYI MAKİNEYE ATA
        </div>
        <form onSubmit={handleSubmit} style={{ padding: '16px 24px', display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div>
            <label style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--text3)', letterSpacing: 1, display: 'block', marginBottom: 6 }}>
              MAKİNE
            </label>
            <select
              className="form-input"
              style={{ width: '100%', padding: '10px 12px', fontSize: 12, borderRadius: 8 }}
              value={machineId}
              onChange={e => setMachineId(e.target.value)}
            >
              <option value="">Seçin...</option>
              {available.map(m => (
                <option key={m.id} value={m.id}>
                  {m.name} — {m.type === 'washer' ? 'Çamaşır' : 'Kurutucu'} {m.capacity_kg}kg
                </option>
              ))}
            </select>
            {available.length === 0 && (
              <p style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--red)', marginTop: 4 }}>Boş makine yok</p>
            )}
          </div>
          <div>
            <label style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--text3)', letterSpacing: 1, display: 'block', marginBottom: 6 }}>
              TİMER (DAKİKA, OPSİYONEL)
            </label>
            <input
              type="number" min="1" max="240" className="form-input"
              style={{ width: '100%', padding: '10px 12px', fontSize: 12, borderRadius: 8 }}
              value={timer}
              onChange={e => setTimer(e.target.value)}
              placeholder="60"
            />
          </div>
          {error && (
            <p style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--red)' }}>{error}</p>
          )}
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
            <button
              type="button"
              onClick={onClose}
              style={{
                padding: '8px 16px', borderRadius: 8, cursor: 'pointer',
                background: 'transparent', color: 'var(--text2)',
                border: '1px solid var(--border)',
                fontFamily: 'var(--mono)', fontSize: 11,
              }}
            >
              İptal
            </button>
            <button
              type="submit"
              disabled={loading || !machineId}
              style={{
                padding: '8px 20px', borderRadius: 8, cursor: machineId ? 'pointer' : 'not-allowed',
                background: machineId ? 'var(--accent)' : 'var(--surface2)',
                color: machineId ? '#000' : 'var(--text3)',
                border: 'none',
                fontFamily: 'var(--mono)', fontSize: 11, fontWeight: 700,
                opacity: loading ? 0.7 : 1,
              }}
            >
              {loading ? 'Atanıyor...' : 'Ata'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
