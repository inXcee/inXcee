import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { laundryApi } from '../api.js'

function SupplyForm({ onSave, onCancel, initial = {} }) {
  const [name, setName] = useState(initial.name || '')
  const [unit, setUnit] = useState(initial.unit || 'kg')
  const [warn, setWarn] = useState(initial.warning_threshold ?? '')
  const [crit, setCrit] = useState(initial.critical_threshold ?? '')
  const [err,  setErr]  = useState('')

  const handleSubmit = () => {
    setErr('')
    if (!name.trim()) { setErr('Ad zorunlu'); return }
    if (+warn > 0 && +crit > 0 && +crit >= +warn) { setErr('Kritik eşik uyarıdan küçük olmalı'); return }
    onSave({ name: name.trim(), unit, warning_threshold: +warn, critical_threshold: +crit })
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10, padding: 16, background: 'var(--surface2)', borderRadius: 8, border: '1px solid var(--border)' }}>
      <div style={{ display: 'flex', gap: 8 }}>
        <input className="form-input" placeholder="Ürün adı" value={name} onChange={e => setName(e.target.value)} style={{ flex: 2 }} />
        <select className="form-input" value={unit} onChange={e => setUnit(e.target.value)} style={{ flex: 1 }}>
          <option value="kg">kg</option>
          <option value="lt">lt</option>
          <option value="adet">adet</option>
        </select>
      </div>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        <label style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--text3)', minWidth: 60 }}>Uyarı ≤</label>
        <input className="form-input" type="number" min="0" step="0.1" value={warn} onChange={e => setWarn(e.target.value)} style={{ width: 80 }} />
        <label style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--text3)', minWidth: 60 }}>Kritik ≤</label>
        <input className="form-input" type="number" min="0" step="0.1" value={crit} onChange={e => setCrit(e.target.value)} style={{ width: 80 }} />
        <span style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--text3)' }}>{unit}</span>
      </div>
      {err && <span style={{ color: 'var(--red)', fontFamily: 'var(--mono)', fontSize: 10 }}>{err}</span>}
      <div style={{ display: 'flex', gap: 8 }}>
        <button className="btn" style={{ background: 'var(--accent)', color: '#000' }} onClick={handleSubmit}>Kaydet</button>
        <button className="btn btn-sm" onClick={onCancel}>İptal</button>
      </div>
    </div>
  )
}

function MachineLink({ supply, machines }) {
  const qc = useQueryClient()
  const [machineId, setMachineId] = useState('')
  const [amount,    setAmount]    = useState('0.1')

  const addMutation = useMutation({
    mutationFn: () => laundryApi.setMachineSupply(+machineId, supply.id, +amount),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['supplies'] }),
  })
  const delMutation = useMutation({
    mutationFn: (mid) => laundryApi.deleteMachineSupply(mid, supply.id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['supplies'] }),
  })

  const linkedIds = (supply.machine_links || []).map(l => l.machine_id)
  const available = machines.filter(m => !linkedIds.includes(m.id))

  return (
    <div style={{ marginTop: 8, paddingTop: 8, borderTop: '1px solid var(--border)' }}>
      <div style={{ fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--text3)', letterSpacing: 1, marginBottom: 6 }}>MAKİNE BAĞLANTILARI</div>
      {(supply.machine_links || []).map(link => (
        <div key={link.machine_id} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
          <span style={{ fontFamily: 'var(--mono)', fontSize: 10, flex: 1 }}>{link.machine_name}</span>
          <span style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--text3)' }}>{link.per_wash_amount} {supply.unit}/yıkama</span>
          <button onClick={() => delMutation.mutate(link.machine_id)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--red)', fontSize: 12 }}>✕</button>
        </div>
      ))}
      {available.length > 0 && (
        <div style={{ display: 'flex', gap: 6, marginTop: 6 }}>
          <select className="form-input" value={machineId} onChange={e => setMachineId(e.target.value)} style={{ flex: 1 }}>
            <option value="">Makine seç...</option>
            {available.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
          </select>
          <input className="form-input" type="number" min="0" step="0.01" value={amount} onChange={e => setAmount(e.target.value)} style={{ width: 70 }} placeholder="miktar" />
          <button className="btn btn-sm" style={{ background: 'var(--accent)', color: '#000' }}
            onClick={() => { if (machineId) addMutation.mutate() }}
            disabled={!machineId || addMutation.isPending}
          >
            Ekle
          </button>
        </div>
      )}
    </div>
  )
}

function StockActions({ supply }) {
  const qc = useQueryClient()
  const [mode,   setMode]   = useState(null)
  const [amount, setAmount] = useState('')
  const [note,   setNote]   = useState('')

  const addMut = useMutation({
    mutationFn: () => laundryApi.addStock(supply.id, +amount, note),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['supplies'] }); qc.invalidateQueries({ queryKey: ['supply-alerts'] }); setMode(null); setAmount('') },
  })
  const setMut = useMutation({
    mutationFn: () => laundryApi.setStock(supply.id, +amount),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['supplies'] }); qc.invalidateQueries({ queryKey: ['supply-alerts'] }); setMode(null); setAmount('') },
  })

  if (!mode) return (
    <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
      <button className="btn btn-sm" style={{ background: 'var(--green)', color: '#fff' }} onClick={() => setMode('add')}>+ Stok Girişi</button>
      <button className="btn btn-sm" onClick={() => setMode('set')}>Sayım Düzeltme</button>
    </div>
  )

  return (
    <div style={{ display: 'flex', gap: 6, marginTop: 8, alignItems: 'center' }}>
      <input className="form-input" type="number" min="0" step="0.1" value={amount} onChange={e => setAmount(e.target.value)}
        placeholder={mode === 'add' ? 'Eklenecek miktar' : 'Yeni mevcut stok'} style={{ width: 140 }} />
      {mode === 'add' && (
        <input className="form-input" value={note} onChange={e => setNote(e.target.value)} placeholder="Not (isteğe bağlı)" style={{ flex: 1 }} />
      )}
      <button className="btn btn-sm" style={{ background: 'var(--accent)', color: '#000' }}
        onClick={() => mode === 'add' ? addMut.mutate() : setMut.mutate()}
        disabled={!amount || addMut.isPending || setMut.isPending}
      >
        {mode === 'add' ? 'Ekle' : 'Kaydet'}
      </button>
      <button className="btn btn-sm" onClick={() => setMode(null)}>İptal</button>
    </div>
  )
}

export default function SupplySettings() {
  const qc = useQueryClient()
  const [adding,      setAdding]      = useState(false)
  const [editId,      setEditId]      = useState(null)
  const [logSupplyId, setLogSupplyId] = useState(null)

  const { data: supplies = [] } = useQuery({
    queryKey: ['supplies'],
    queryFn: () => laundryApi.getSupplies(true),
  })
  const { data: machines = [] } = useQuery({
    queryKey: ['laundry-machines'],
    queryFn: () => laundryApi.getMachines(),
  })
  const { data: log = [] } = useQuery({
    queryKey: ['supply-log', logSupplyId],
    queryFn: () => laundryApi.getSupplyLog(logSupplyId),
    enabled: !!logSupplyId,
  })

  const createMut = useMutation({
    mutationFn: (data) => laundryApi.createSupply(data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['supplies'] }); setAdding(false) },
  })
  const updateMut = useMutation({
    mutationFn: ({ id, data }) => laundryApi.updateSupply(id, data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['supplies'] }); setEditId(null) },
  })
  const deactivateMut = useMutation({
    mutationFn: (id) => laundryApi.updateSupply(id, { is_active: 0 }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['supplies'] }),
  })

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <div style={{ fontFamily: 'var(--mono)', fontSize: 11, fontWeight: 700, color: 'var(--text2)', letterSpacing: 1 }}>STOK YÖNETİMİ</div>
        <button className="btn btn-sm" style={{ background: 'var(--accent)', color: '#000' }} onClick={() => setAdding(true)}>+ Ürün Ekle</button>
      </div>

      {adding && (
        <div style={{ marginBottom: 16 }}>
          <SupplyForm onSave={(data) => createMut.mutate(data)} onCancel={() => setAdding(false)} />
        </div>
      )}

      {supplies.length === 0 && !adding && (
        <div style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--text3)', textAlign: 'center', padding: 24 }}>
          Henüz ürün eklenmedi
        </div>
      )}

      {supplies.map(s => (
        <div key={s.id} style={{
          background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 8,
          padding: 14, marginBottom: 10, opacity: s.is_active ? 1 : 0.5,
        }}>
          {editId === s.id ? (
            <SupplyForm
              initial={s}
              onSave={(data) => updateMut.mutate({ id: s.id, data })}
              onCancel={() => setEditId(null)}
            />
          ) : (
            <>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{ flex: 1 }}>
                  <span style={{ fontFamily: 'var(--mono)', fontSize: 12, fontWeight: 700 }}>{s.name}</span>
                  <span style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--text3)', marginLeft: 8 }}>{s.unit}</span>
                  {!s.is_active && <span style={{ fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--text3)', marginLeft: 8 }}>(pasif)</span>}
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div style={{
                    fontFamily: 'var(--mono)', fontSize: 18, fontWeight: 700,
                    color: s.current_stock <= s.critical_threshold ? 'var(--red)'
                         : s.current_stock <= s.warning_threshold  ? 'var(--amber, #f0a500)'
                         : 'var(--green)',
                  }}>
                    {s.current_stock} {s.unit}
                  </div>
                  <div style={{ fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--text3)' }}>
                    uyarı ≤ {s.warning_threshold} · kritik ≤ {s.critical_threshold}
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 4 }}>
                  <button className="btn btn-sm" onClick={() => setEditId(s.id)}>Düzenle</button>
                  <button className="btn btn-sm" onClick={() => setLogSupplyId(logSupplyId === s.id ? null : s.id)}>Log</button>
                  {s.is_active && (
                    <button className="btn btn-sm" style={{ color: 'var(--red)' }} onClick={() => deactivateMut.mutate(s.id)}>Pasif</button>
                  )}
                </div>
              </div>

              <StockActions supply={s} />
              <MachineLink supply={s} machines={machines} />

              {logSupplyId === s.id && (
                <div style={{ marginTop: 10, paddingTop: 10, borderTop: '1px solid var(--border)' }}>
                  <div style={{ fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--text3)', letterSpacing: 1, marginBottom: 6 }}>SON HAREKETLER</div>
                  {log.length === 0 ? (
                    <div style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--text3)' }}>Hareket yok</div>
                  ) : log.map(l => (
                    <div key={l.id} style={{ display: 'flex', gap: 8, fontFamily: 'var(--mono)', fontSize: 10, marginBottom: 4 }}>
                      <span style={{ color: l.delta > 0 ? 'var(--green)' : 'var(--red)', minWidth: 50 }}>
                        {l.delta > 0 ? '+' : ''}{l.delta} {s.unit}
                      </span>
                      <span style={{ color: 'var(--text3)' }}>{l.reason}</span>
                      {l.note && <span style={{ color: 'var(--text2)' }}>{l.note}</span>}
                      <span style={{ color: 'var(--text3)', marginLeft: 'auto' }}>{l.created_at?.slice(0, 16)}</span>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      ))}
    </div>
  )
}
