import { useState, useEffect, useMemo } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { laundryApi } from './api.js'
import SupplySettings from './components/SupplySettings.jsx'

function GarmentTypesSettings() {
  const qc = useQueryClient()
  const [newName, setNewName] = useState('')
  const [newEmoji, setNewEmoji] = useState('')
  const [editId, setEditId] = useState(null)
  const [editName, setEditName] = useState('')
  const [editEmoji, setEditEmoji] = useState('')
  const [error, setError] = useState('')

  const { data: types = [] } = useQuery({
    queryKey: ['garment-types-all'],
    queryFn: laundryApi.getGarmentTypesAll,
  })

  const create = useMutation({
    mutationFn: laundryApi.createGarmentType,
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['garment-types-all'] }); setNewName(''); setNewEmoji(''); setError('') },
    onError: (e) => setError(e?.response?.data?.error || 'Hata'),
  })

  const update = useMutation({
    mutationFn: ({ id, data }) => laundryApi.updateGarmentType(id, data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['garment-types-all'] }); setEditId(null) },
    onError: (e) => setError(e?.response?.data?.error || 'Hata'),
  })

  const reorder = useMutation({
    mutationFn: laundryApi.reorderGarmentTypes,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['garment-types-all'] }),
  })

  function handleCreate() {
    if (!newName.trim()) return setError('İsim gerekli')
    create.mutate({ name: newName.trim(), emoji: newEmoji.trim() || null, sort_order: types.length + 1 })
  }

  function handleSaveEdit(t) {
    update.mutate({ id: t.id, data: { name: editName, emoji: editEmoji || null } })
  }

  function handleToggleActive(t) {
    update.mutate({ id: t.id, data: { is_active: t.is_active ? 0 : 1 } })
  }

  function handleMove(t, dir) {
    const active = [...types].sort((a, b) => a.sort_order - b.sort_order)
    const idx = active.findIndex(x => x.id === t.id)
    const swapIdx = idx + dir
    if (swapIdx < 0 || swapIdx >= active.length) return
    const items = active.map((x, i) => {
      if (i === idx) return { id: x.id, sort_order: active[swapIdx].sort_order }
      if (i === swapIdx) return { id: x.id, sort_order: active[idx].sort_order }
      return { id: x.id, sort_order: x.sort_order }
    })
    reorder.mutate(items)
  }

  const sorted = [...types].sort((a, b) => a.sort_order - b.sort_order)

  return (
    <div>
      <table className="data-table">
        <thead>
          <tr>
            <th>Sıra</th><th>Emoji</th><th>İsim</th><th>Durum</th><th>İşlem</th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((t, idx) => (
            <tr key={t.id} style={{ opacity: t.is_active ? 1 : 0.45 }}>
              <td>
                <div style={{ display: 'flex', gap: 4 }}>
                  <button onClick={() => handleMove(t, -1)} disabled={idx === 0} style={{ background: 'transparent', border: 'none', color: 'var(--text3)', cursor: 'pointer', fontSize: 12 }}>▲</button>
                  <button onClick={() => handleMove(t, 1)} disabled={idx === sorted.length - 1} style={{ background: 'transparent', border: 'none', color: 'var(--text3)', cursor: 'pointer', fontSize: 12 }}>▼</button>
                </div>
              </td>
              <td>
                {editId === t.id
                  ? <input value={editEmoji} onChange={e => setEditEmoji(e.target.value)} style={{ width: 50, background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 4, padding: '2px 6px', color: 'var(--text)', fontSize: 14 }} />
                  : <span style={{ fontSize: 20 }}>{t.emoji || '—'}</span>}
              </td>
              <td>
                {editId === t.id
                  ? <input value={editName} onChange={e => setEditName(e.target.value)} style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 4, padding: '2px 8px', color: 'var(--text)', fontSize: 12 }} />
                  : <span style={{ fontFamily: 'var(--mono)', fontSize: 12 }}>{t.name}</span>}
              </td>
              <td>
                <button onClick={() => handleToggleActive(t)}
                  style={{ padding: '2px 8px', borderRadius: 4, border: 'none', background: t.is_active ? 'rgba(74,222,128,0.15)' : 'rgba(100,116,139,0.15)', color: t.is_active ? '#4ade80' : '#64748b', fontSize: 10, cursor: 'pointer', fontFamily: 'var(--mono)', letterSpacing: 1 }}>
                  {t.is_active ? 'AKTİF' : 'PASİF'}
                </button>
              </td>
              <td>
                {editId === t.id
                  ? <div style={{ display: 'flex', gap: 4 }}>
                      <button onClick={() => handleSaveEdit(t)} style={{ padding: '2px 8px', borderRadius: 4, border: 'none', background: 'rgba(74,222,128,0.15)', color: '#4ade80', fontSize: 10, cursor: 'pointer' }}>Kaydet</button>
                      <button onClick={() => setEditId(null)} style={{ padding: '2px 8px', borderRadius: 4, border: 'none', background: 'transparent', color: 'var(--text3)', fontSize: 10, cursor: 'pointer' }}>İptal</button>
                    </div>
                  : <button onClick={() => { setEditId(t.id); setEditName(t.name); setEditEmoji(t.emoji || '') }}
                      style={{ padding: '2px 8px', borderRadius: 4, border: '1px solid var(--border)', background: 'transparent', color: 'var(--text3)', fontSize: 10, cursor: 'pointer' }}>Düzenle</button>}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <div style={{ marginTop: 16, display: 'flex', gap: 8, alignItems: 'center' }}>
        <input value={newEmoji} onChange={e => setNewEmoji(e.target.value)} placeholder="emoji" style={{ width: 60, background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 6, padding: '6px 8px', color: 'var(--text)', fontSize: 14 }} />
        <input value={newName} onChange={e => setNewName(e.target.value)} placeholder="Yeni tip adı..." style={{ flex: 1, background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 6, padding: '6px 10px', color: 'var(--text)', fontSize: 12 }} />
        <button onClick={handleCreate} disabled={create.isPending}
          style={{ padding: '6px 14px', borderRadius: 6, border: 'none', background: 'rgba(240,165,0,0.15)', color: 'var(--accent)', fontSize: 11, cursor: 'pointer', fontFamily: 'var(--mono)', letterSpacing: 1 }}>
          + EKLE
        </button>
      </div>
      {error && <div style={{ marginTop: 6, color: '#f87171', fontSize: 11 }}>{error}</div>}
    </div>
  )
}

const STAGE_LABELS = { dirty: 'Sepet (Kirli)', washing: 'Yıkama', ready: 'Hazır' }

function SlaRow({ config, onSave }) {
  const [warn, setWarn] = useState(config.warning_hours)
  const [crit, setCrit] = useState(config.critical_hours)
  const [waNotify, setWaNotify] = useState(!!config.whatsapp_notify)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    setWarn(config.warning_hours)
    setCrit(config.critical_hours)
    setWaNotify(!!config.whatsapp_notify)
  }, [config])

  const handleSave = async () => {
    setError('')
    if (+crit <= +warn) { setError('Kritik eşik uyarıdan büyük olmalı'); return }
    setSaving(true)
    try {
      await onSave({ stage: config.stage, warning_hours: +warn, critical_hours: +crit, whatsapp_notify: waNotify ? 1 : 0 })
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
        <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
          <input type="checkbox" checked={waNotify} onChange={e => setWaNotify(e.target.checked)} />
          <span style={{ fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--text3)' }}>WA</span>
        </label>
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

function ClothingSettings() {
  const DEFAULT_TYPES = [
    'Pantolon','Gömlek','T-Shirt','Kazak','Sweat','Polar','Mont','Hırka',
    'Body','İçlik','Alt Eşofman','Üst Eşofman','Boxer','Külot','Çorap',
    'Havlu Tkm','El Havlusu','Ayak Havlusu','Büyük Havlu','Ceket',
    'Yastık K.','İş Mont','İş Pantalonu','Şort','Atlet','Diğer',
  ]

  const qc = useQueryClient()
  const { data: settings = {} } = useQuery({
    queryKey: ['laundry-settings'],
    queryFn: laundryApi.getLaundrySettings,
  })

  const types = useMemo(() => {
    if (settings.clothing_types) {
      try { return JSON.parse(settings.clothing_types) } catch {}
    }
    return DEFAULT_TYPES
  }, [settings.clothing_types])

  const [newType, setNewType] = useState('')

  const updateSetting = useMutation({
    mutationFn: ({ key, value }) => laundryApi.updateLaundrySetting(key, value),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['laundry-settings'] }),
  })

  const save = (list) => {
    updateSetting.mutate({ key: 'clothing_types', value: JSON.stringify(list) })
  }

  const add = () => {
    const t = newType.trim()
    if (!t || types.includes(t)) return
    save([...types, t])
    setNewType('')
  }

  const remove = (type) => save(types.filter(t => t !== type))
  const reset = () => save(DEFAULT_TYPES)

  return (
    <div>
      <label className="form-label">KIYAFETLERİ ÖZELLEŞTIR</label>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 14 }}>
        {types.map(type => (
          <span key={type} style={{
            display: 'flex', alignItems: 'center', gap: 5,
            padding: '4px 10px', borderRadius: 16,
            background: 'var(--surface2)', border: '1px solid var(--border)',
            fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--text)',
          }}>
            {type}
            <button onClick={() => remove(type)} style={{
              background: 'none', border: 'none', cursor: 'pointer',
              color: 'var(--text3)', fontSize: 11, padding: 0, lineHeight: 1,
            }}>✕</button>
          </span>
        ))}
      </div>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 10 }}>
        <input
          className="form-input"
          value={newType}
          onChange={e => setNewType(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && add()}
          placeholder="Yeni kıyafet tipi..."
          style={{ flex: 1 }}
        />
        <button className="btn btn-sm" style={{ background: 'var(--accent)', color: '#000' }}
          onClick={add} disabled={!newType.trim()}>
          + Ekle
        </button>
      </div>
      <button className="btn btn-ghost btn-xs" onClick={reset} style={{ color: 'var(--text3)', fontSize: 9 }}>
        Varsayılana Sıfırla
      </button>
    </div>
  )
}

function GoalsSettings() {
  const qc = useQueryClient()
  const { data: settings = {} } = useQuery({
    queryKey: ['laundry-settings'],
    queryFn: laundryApi.getLaundrySettings,
  })
  const [goal, setGoal] = useState(50)
  useEffect(() => {
    if (settings.daily_goal !== undefined) setGoal(parseInt(settings.daily_goal) || 50)
  }, [settings.daily_goal])
  const [saved, setSaved] = useState(false)

  const save = async () => {
    await laundryApi.updateLaundrySetting('daily_goal', String(goal))
    qc.invalidateQueries({ queryKey: ['laundry-settings'] })
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  return (
    <div>
      <label className="form-label">GÜNLÜK HEDEF</label>
      <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 16 }}>
        <input
          type="number"
          className="form-input"
          value={goal}
          min={1}
          max={9999}
          onChange={e => setGoal(Math.max(1, parseInt(e.target.value) || 1))}
          style={{ width: 100 }}
        />
        <span style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--text3)' }}>parça/gün</span>
        <button className="btn btn-sm" style={{ background: 'var(--accent)', color: '#000' }} onClick={save}>
          {saved ? '✓ Kaydedildi' : 'Kaydet'}
        </button>
      </div>
      <div style={{ fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--text3)', lineHeight: 1.6 }}>
        Bu hedef KPI strip'te "Bugün Yıkanan" kartında referans alınır.
        Hedefe ulaşıldığında kart rengi yeşile döner.
      </div>
    </div>
  )
}

export default function LaundrySettings() {
  const [tab, setTab] = useState('sla')
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

      <div style={{ display: 'flex', gap: 4, marginBottom: 20, borderBottom: '1px solid var(--border)', paddingBottom: 10 }}>
        {[
          { key: 'sla',      label: '⏱ SLA' },
          { key: 'machines', label: '⚙ Makineler' },
          { key: 'clothing', label: '👕 Kıyafetler' },
          { key: 'goals',    label: '🎯 Hedefler' },
          { key: 'blocks',   label: '🏢 Bloklar' },
          { key: 'stock',    label: '📦 Stok' },
          { key: 'garment-types', label: '👔 Kıyafet Tipleri' },
        ].map(t => (
          <button key={t.key} onClick={() => setTab(t.key)} style={{
            padding: '5px 12px', borderRadius: 6, cursor: 'pointer',
            fontFamily: 'var(--mono)', fontSize: 10, letterSpacing: 1,
            background: tab === t.key ? 'rgba(240,165,0,0.12)' : 'transparent',
            border: `1px solid ${tab === t.key ? 'rgba(240,165,0,0.3)' : 'var(--border)'}`,
            color: tab === t.key ? 'var(--accent)' : 'var(--text3)',
          }}>{t.label}</button>
        ))}
      </div>

      {/* SLA CONFIG */}
      {tab === 'sla' && (
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
                  <tr><th>Aşama</th><th>Uyarı</th><th>Kritik</th><th>WhatsApp</th><th></th></tr>
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
      )}

      {/* MACHINES */}
      {tab === 'machines' && (
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
      )}

      {tab === 'clothing' && <ClothingSettings />}
      {tab === 'goals' && <GoalsSettings />}
      {tab === 'blocks' && <BlockSettings />}
      {tab === 'stock' && <SupplySettings />}
      {tab === 'garment-types' && (
        <div className="panel">
          <div className="panel-header"><span className="panel-title">KIYAFet TİPLERİ</span></div>
          <div className="panel-body"><GarmentTypesSettings /></div>
        </div>
      )}
    </div>
  )
}

function BlockSettings() {
  const qc = useQueryClient()
  const { data: blocks = [] } = useQuery({
    queryKey: ['laundry-block-config'],
    queryFn: laundryApi.getBlockConfig,
  })

  const update = useMutation({
    mutationFn: ({ block, is_premium }) => laundryApi.updateBlockConfig(block, is_premium),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['laundry-block-config'] }),
  })

  const premiumBlocks = blocks.filter(b => b.is_premium)
  const regularBlocks = blocks.filter(b => !b.is_premium)

  return (
    <div>
      <label className="form-label">BLOK TİPİ YÖNETİMİ</label>
      <div style={{ fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--text3)', marginBottom: 14, lineHeight: 1.6 }}>
        Premium bloklar kıyafet-bazlı takip sistemini kullanır (garment kodları, brand/model/beden).
        Regular bloklar mevcut sistemde çalışır.
      </div>
      <table className="data-table" style={{ marginBottom: 0 }}>
        <thead>
          <tr>
            <th>Blok</th>
            <th>Tip</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {blocks.map(b => (
            <tr key={b.block}>
              <td>
                <span style={{
                  fontFamily: 'var(--mono)', fontWeight: 700,
                  color: b.is_premium ? 'var(--accent)' : 'var(--text)',
                }}>
                  {b.block}
                </span>
              </td>
              <td>
                <span style={{
                  fontFamily: 'var(--mono)', fontSize: 9,
                  padding: '2px 8px', borderRadius: 4,
                  background: b.is_premium ? 'rgba(240,165,0,0.12)' : 'var(--surface2)',
                  border: `1px solid ${b.is_premium ? 'rgba(240,165,0,0.3)' : 'var(--border)'}`,
                  color: b.is_premium ? 'var(--accent)' : 'var(--text3)',
                }}>
                  {b.is_premium ? '★ Premium' : 'Regular'}
                </span>
              </td>
              <td>
                <button
                  className="btn btn-ghost btn-xs"
                  onClick={() => update.mutate({ block: b.block, is_premium: b.is_premium ? 0 : 1 })}
                  disabled={update.isPending}
                  style={{ fontSize: 9 }}
                >
                  {b.is_premium ? 'Regular yap' : 'Premium yap'}
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <div style={{ marginTop: 12, fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--text3)' }}>
        Premium: {premiumBlocks.map(b => b.block).join(', ')} · Regular: {regularBlocks.map(b => b.block).join(', ')}
      </div>
    </div>
  )
}
