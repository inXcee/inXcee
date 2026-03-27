import { useState, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { laundryApi } from './api.js'

const STAGE_LABELS = { dirty: 'Sepet (Kirli)', washing: 'Yıkama', ready: 'Hazır' }

function SlaRow({ config, onSave }) {
  const [warn, setWarn] = useState(config.warning_hours)
  const [crit, setCrit] = useState(config.critical_hours)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => { setWarn(config.warning_hours); setCrit(config.critical_hours) }, [config])

  const handleSave = async () => {
    setError('')
    if (+crit <= +warn) { setError('Kritik eşik uyarıdan büyük olmalı'); return }
    setSaving(true)
    try {
      await onSave({ stage: config.stage, warning_hours: +warn, critical_hours: +crit })
    } finally { setSaving(false) }
  }

  return (
    <tr>
      <td style={{ fontWeight: 600 }}>{STAGE_LABELS[config.stage] || config.stage}</td>
      <td>
        <input type="number" className="form-input" style={{ width: 70 }}
          value={warn} min={1} onChange={e => setWarn(e.target.value)} />
        <span style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--text3)', marginLeft: 4 }}>saat</span>
      </td>
      <td>
        <input type="number" className="form-input" style={{ width: 70 }}
          value={crit} min={1} onChange={e => setCrit(e.target.value)} />
        <span style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--text3)', marginLeft: 4 }}>saat</span>
      </td>
      <td>
        <button className="btn btn-sm" style={{ background: 'var(--accent)', color: '#000' }}
          onClick={handleSave} disabled={saving}>
          {saving ? '...' : 'Kaydet'}
        </button>
        {error && <span style={{ color: 'var(--red)', fontFamily: 'var(--mono)', fontSize: 9, marginLeft: 6 }}>{error}</span>}
      </td>
    </tr>
  )
}

export default function LaundrySettings() {
  const qc = useQueryClient()
  const { data: slaConfig = [] } = useQuery({
    queryKey: ['laundry-sla-config'],
    queryFn: laundryApi.getSlaConfig,
  })

  const [newMachine, setNewMachine] = useState({ name: '', machine_type: 'washer', capacity: 1 })
  const [machineError, setMachineError] = useState('')

  const { data: machines = [] } = useQuery({
    queryKey: ['laundry-machines'],
    queryFn: laundryApi.getMachines,
  })

  const saveSla = useMutation({
    mutationFn: laundryApi.updateSlaConfig,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['laundry-sla-config'] }),
  })

  const addMachine = useMutation({
    mutationFn: laundryApi.createMachine,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['laundry-machines'] })
      setNewMachine({ name: '', machine_type: 'washer', capacity: 1 })
    },
    onError: (e) => setMachineError(e?.response?.data?.error || 'Hata'),
  })

  const deleteMachine = useMutation({
    mutationFn: laundryApi.deleteMachine,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['laundry-machines'] }),
  })

  return (
    <div style={{ maxWidth: 700, position: 'relative', zIndex: 1 }} className="fade-up">
      <div style={{ marginBottom: 16 }}>
        <h1 style={{ fontFamily: 'var(--display)', fontSize: 28, letterSpacing: 4, color: 'var(--text)' }}>
          ÇAMAŞIRHANE AYARLAR
        </h1>
      </div>

      {/* SLA CONFIG */}
      <div className="panel" style={{ marginBottom: 20 }}>
        <div className="panel-header">
          <span className="panel-title">SLA EŞİKLERİ</span>
        </div>
        <div className="panel-body" style={{ padding: 0 }}>
          {slaConfig.length === 0 ? (
            <div style={{ padding: '12px 14px', fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--text3)' }}>Yükleniyor...</div>
          ) : (
            <table className="data-table">
              <thead>
                <tr><th>Aşama</th><th>Uyarı</th><th>Kritik</th><th></th></tr>
              </thead>
              <tbody>
                {slaConfig.map(cfg => (
                  <SlaRow key={cfg.stage} config={cfg} onSave={(data) => saveSla.mutateAsync(data)} />
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* MACHINES */}
      <div className="panel">
        <div className="panel-header">
          <span className="panel-title">MAKİNE YÖNETİMİ</span>
        </div>
        <div className="panel-body">
          {/* Add machine form */}
          <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap', alignItems: 'flex-end' }}>
            <div>
              <label className="form-label">AD</label>
              <input className="form-input" style={{ width: 140 }} value={newMachine.name}
                onChange={e => setNewMachine(m => ({ ...m, name: e.target.value }))}
                placeholder="Çamaşır M-1" />
            </div>
            <div>
              <label className="form-label">TİP</label>
              <select className="form-select" style={{ width: 120 }} value={newMachine.machine_type}
                onChange={e => setNewMachine(m => ({ ...m, machine_type: e.target.value }))}>
                <option value="washer">Yıkama</option>
                <option value="dryer">Kurutma</option>
              </select>
            </div>
            <div>
              <label className="form-label">KAPASİTE</label>
              <input type="number" className="form-input" style={{ width: 70 }} value={newMachine.capacity}
                min={1} onChange={e => setNewMachine(m => ({ ...m, capacity: +e.target.value }))} />
            </div>
            <button className="btn btn-primary btn-sm"
              onClick={() => { setMachineError(''); addMachine.mutate(newMachine) }}
              disabled={!newMachine.name.trim() || addMachine.isPending}>
              + Ekle
            </button>
            {machineError && <span style={{ color: 'var(--red)', fontFamily: 'var(--mono)', fontSize: 10 }}>{machineError}</span>}
          </div>

          {/* Machine list */}
          {machines.length > 0 && (
            <table className="data-table">
              <thead>
                <tr><th>Ad</th><th>Tip</th><th>Kapasite</th><th>Durum</th><th></th></tr>
              </thead>
              <tbody>
                {machines.map(m => (
                  <tr key={m.id}>
                    <td style={{ fontWeight: 600 }}>{m.name}</td>
                    <td style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--text3)', textTransform: 'uppercase' }}>
                      {m.machine_type === 'washer' ? 'Yıkama' : 'Kurutma'}
                    </td>
                    <td>{m.capacity}</td>
                    <td>
                      <span className={`badge ${m.status === 'running' ? 'badge-amber' : m.status === 'done' ? 'badge-green' : 'badge-gray'}`}>
                        {m.status === 'running' ? 'Çalışıyor' : m.status === 'done' ? 'Bitti' : 'Boşta'}
                      </span>
                    </td>
                    <td>
                      <button className="btn btn-ghost btn-xs"
                        onClick={() => { if (confirm(`"${m.name}" silinsin mi?`)) deleteMachine.mutate(m.id) }}>
                        Sil
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  )
}
