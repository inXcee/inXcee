import { useState, useEffect, useMemo, useRef } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { laundryApi } from './api.js'
import SupplySettings from './components/SupplySettings.jsx'
import { confirmDialog } from '../../shared/components/ConfirmDialog.jsx'
import { SkeletonTable } from '../../shared/components/Skeleton.jsx'
import { useUrlParamState } from '../../shared/hooks/useUrlParamState.js'
import { useAuthStore } from '../../shared/store/authStore.js'

export function CardSystemSettings() {
  const qc = useQueryClient()
  const role = useAuthStore(state => state.user?.role)
  const canEdit = role === 'campus_manager'
  const { data: serverSettings = {}, isLoading } = useQuery({
    queryKey: ['laundry-card-settings'],
    queryFn: laundryApi.getCardSettings,
  })
  // Kapsam ÖLÇÜLÜR, sorulmaz: canlıda zorunluluk sıfır kartla açıldı ve kimse
  // fark etmedi. Sayı yalan söylemez.
  const { data: coverage } = useQuery({
    queryKey: ['laundry-card-coverage'],
    queryFn: laundryApi.getCardCoverage,
  })
  const [values, setValues] = useState({ intake_required: false, delivery_required: false })
  const [saving, setSaving] = useState('')
  const [error, setError] = useState('')

  useEffect(() => {
    setValues({
      intake_required: serverSettings.intake_required === true,
      delivery_required: serverSettings.delivery_required === true,
    })
  }, [serverSettings.intake_required, serverSettings.delivery_required])

  async function toggle(action) {
    if (!canEdit || saving) return
    const key = action === 'intake' ? 'intake_required' : 'delivery_required'
    const previous = values[key]
    const next = !previous
    if (next) {
      // Soru sormak yerine ölçümü göster: kaç kişinin kartı yok, sayıyla.
      const eksik = coverage?.available ? coverage.without_card : null
      const olcum = coverage?.available === false
        ? 'Kart kapsamı ÖLÇÜLEMEDİ — açmadan önce elle doğrulayın.'
        : eksik > 0
          ? `DİKKAT: ${coverage.residents} sakinden ${eksik} kişinin kartı YOK. Bu kişiler her işlemde gerekçe yazmak zorunda kalacak.`
          : `${coverage?.residents ?? 0} sakinin tamamında kart var.`
      const confirmed = await confirmDialog({
        title: 'Kart zorunluluğunu aç',
        body: `${olcum}

${action === 'intake' ? 'Kabul' : 'Teslim'} işlemlerinde kart zorunlu olacak.`,
      })
      if (!confirmed) return
    }
    setError('')
    setSaving(action)
    setValues(current => ({ ...current, [key]: next }))
    try {
      const updated = await laundryApi.updateCardSetting(action, next)
      setValues({
        intake_required: updated.intake_required === true,
        delivery_required: updated.delivery_required === true,
      })
      qc.setQueryData(['laundry-card-settings'], updated)
    } catch (requestError) {
      setValues(current => ({ ...current, [key]: previous }))
      setError(requestError?.response?.data?.error || 'Kart ayarı kaydedilemedi; önceki değer korundu.')
    } finally {
      setSaving('')
    }
  }

  const rows = [
    { action: 'intake', key: 'intake_required', title: 'Kabulde kart zorunlu', detail: 'Yeni torba teslim alınırken sakin kartı veya gerekçe ister.' },
    { action: 'delivery', key: 'delivery_required', title: 'Teslimde kart zorunlu', detail: 'Hazır torba teslim edilirken sakin kartı veya gerekçe ister.' },
  ]

  return (
    <div className="panel">
      <div className="panel-header">
        <div>
          <span className="panel-title">KART SİSTEMİ</span>
          <div className="panel-subtitle">İki anahtar bağımsızdır ve otomatik açılmaz.</div>
        </div>
        {!canEdit && <span className="badge badge-gray">Salt okunur</span>}
      </div>
      <div className="panel-body" style={{ display: 'grid', gap: 12 }}>
        {coverage && (
          <div style={{
            padding: '8px 12px', borderRadius: 9, fontSize: 11,
            border: '1px solid ' + (coverage.warnings?.length ? 'rgba(239,68,68,.4)' : 'var(--border)'),
            background: coverage.warnings?.length ? 'rgba(239,68,68,.08)' : 'var(--surface2)',
          }}>
            {coverage.available
              ? (
                <>
                  <strong>Kart kapsamı:</strong>{' '}
                  {coverage.residents} sakinden {coverage.with_card} kişide kart var
                  {coverage.ratio != null && ` (%${Math.round(coverage.ratio * 100)})`}
                  {coverage.warnings?.map(w => (
                    <div key={w} style={{ color: 'var(--red)', marginTop: 4 }}>⚠ {w}</div>
                  ))}
                  {coverage.without_card > 0 && (
                    <div style={{ color: 'var(--text3)', marginTop: 4 }}>
                      Kartsız: {coverage.missing.map(m => m.full_name).join(', ')}
                      {coverage.missing_truncated > 0 && ` +${coverage.missing_truncated} kişi daha`}
                    </div>
                  )}
                </>
              )
              // Ölçülemeyen kapsamı "tam" saymak, kaçırılan hatayı tekrar eder.
              : <span style={{ color: 'var(--amber)' }}>⚠ {coverage.reason}</span>}
          </div>
        )}
        {isLoading ? <SkeletonTable rows={2} cols={2} /> : rows.map(row => {
          const checked = values[row.key]
          return (
            <div key={row.action} style={{
              display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 16,
              padding: 14, borderRadius: 10, background: 'var(--surface2)', border: '1px solid var(--border)',
            }}>
              <div>
                <strong style={{ display: 'block', fontSize: 13 }}>{row.title}</strong>
                <span style={{ color: 'var(--text3)', fontSize: 10 }}>{row.detail}</span>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={checked}
                aria-label={row.title}
                onClick={() => toggle(row.action)}
                disabled={!canEdit || saving === row.action}
                style={{
                  minWidth: 72, padding: '7px 10px', borderRadius: 18, cursor: canEdit ? 'pointer' : 'not-allowed',
                  border: `1px solid ${checked ? 'rgba(34,197,94,.55)' : 'var(--border)'}`,
                  background: checked ? 'rgba(34,197,94,.14)' : 'var(--surface)',
                  color: checked ? 'var(--green)' : 'var(--text3)', fontWeight: 800, fontSize: 10,
                }}
              >
                {saving === row.action ? '...' : checked ? 'AÇIK' : 'KAPALI'}
              </button>
            </div>
          )
        })}
        {error && <div className="alert alert-danger">{error}</div>}
        {!canEdit && <div className="alert alert-info">Mevcut durumu görebilirsiniz. Anahtarları yalnız kampüs yöneticisi değiştirebilir.</div>}
      </div>
    </div>
  )
}

// migration 072 — ütü politikası. 'ask' = tür için karar verilmemiş.
const IRONING_CHOICES = [
  { key: 'always', label: 'Ütülenir', color: '#a78bfa', bg: 'rgba(139,92,246,.12)' },
  { key: 'never', label: 'Ütülenmez', color: '#94a3b8', bg: 'rgba(148,163,184,.12)' },
  { key: 'ask', label: 'Belirtilmedi', color: '#fbbf24', bg: 'rgba(251,191,36,.12)' },
]

function GarmentTypesAdmin() {
  const qc = useQueryClient()
  const fileRef = useRef(null)
  const [form, setForm] = useState({ name: '', emoji: '', default_requires_ironing: 0 })
  const [uploading, setUploading] = useState(false)
  const [imageUrl, setImageUrl] = useState('')
  const [editId, setEditId] = useState(null)
  const [editForm, setEditForm] = useState({})
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const { data: types = [], isLoading } = useQuery({
    queryKey: ['garment-types-all'],
    queryFn: laundryApi.getGarmentTypesAll,
  })

  async function uploadImage(file) {
    setUploading(true)
    try {
      const result = await laundryApi.uploadPhoto(file)
      setImageUrl(result.url || result)
    } catch { setError('Resim yüklenemedi') } finally { setUploading(false) }
  }

  async function createType() {
    if (!form.name.trim()) return setError('İsim zorunlu')
    setSaving(true); setError('')
    try {
      await laundryApi.createGarmentType({
        name: form.name.trim(),
        emoji: form.emoji.trim() || null,
        image_url: imageUrl || null,
        sort_order: types.length + 1,
        default_requires_ironing: form.default_requires_ironing,
      })
      setForm({ name: '', emoji: '', default_requires_ironing: 0 }); setImageUrl('')
      qc.invalidateQueries({ queryKey: ['garment-types-all'] })
      qc.invalidateQueries({ queryKey: ['garment-types'] })
    } catch(e) { setError(e?.response?.data?.error || 'Hata') } finally { setSaving(false) }
  }

  async function toggleActive(type) {
    await laundryApi.updateGarmentType(type.id, { is_active: type.is_active ? 0 : 1 })
    qc.invalidateQueries({ queryKey: ['garment-types-all'] })
    qc.invalidateQueries({ queryKey: ['garment-types'] })
  }

  async function moveOrder(type, dir) {
    const sorted = [...types].sort((a, b) => a.sort_order - b.sort_order)
    const idx = sorted.findIndex(t => t.id === type.id)
    const swap = sorted[idx + dir]
    if (!swap) return
    await laundryApi.reorderGarmentTypes([
      { id: type.id, sort_order: swap.sort_order },
      { id: swap.id, sort_order: type.sort_order },
    ])
    qc.invalidateQueries({ queryKey: ['garment-types-all'] })
    qc.invalidateQueries({ queryKey: ['garment-types'] })
  }

  async function saveEdit(id) {
    setSaving(true); setError('')
    try {
      await laundryApi.updateGarmentType(id, editForm)
      setEditId(null); setEditForm({})
      qc.invalidateQueries({ queryKey: ['garment-types-all'] })
      qc.invalidateQueries({ queryKey: ['garment-types'] })
    } catch(e) { setError(e?.response?.data?.error || 'Hata') } finally { setSaving(false) }
  }

  if (isLoading) return <SkeletonTable rows={4} cols={4} />

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* Yeni tip ekleme */}
      <div style={{ background: 'var(--bg2)', borderRadius: 12, padding: 16, display: 'flex', flexDirection: 'column', gap: 10 }}>
        <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text3)', letterSpacing: 1 }}>YENİ TİP EKLE</div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
            placeholder="İsim (örn. Bornoz)"
            style={{ flex: 1, minWidth: 120, background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 6, padding: '6px 10px', color: 'var(--text)', fontSize: 12 }} />
          <input value={form.emoji} onChange={e => setForm(f => ({ ...f, emoji: e.target.value }))}
            placeholder="Emoji"
            style={{ width: 70, background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 6, padding: '6px 8px', color: 'var(--text)', fontSize: 14, textAlign: 'center' }} />
          <button onClick={() => fileRef.current?.click()}
            style={{ padding: '6px 12px', borderRadius: 6, border: '1px dashed var(--border)', background: 'transparent', color: imageUrl ? '#4ade80' : 'var(--text3)', cursor: 'pointer', fontSize: 12 }}>
            {uploading ? '...' : imageUrl ? '✓ Resim' : '📷 Resim'}
          </button>
          <input ref={fileRef} type="file" accept="image/*" style={{ display: 'none' }}
            onChange={e => e.target.files[0] && uploadImage(e.target.files[0])} />
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, minHeight: 36, fontSize: 11, color: 'var(--text2)' }}>
            <input type="checkbox" checked={!!form.default_requires_ironing}
              onChange={e => setForm(current => ({ ...current, default_requires_ironing: e.target.checked ? 1 : 0 }))} />
            Varsayılan ütü
          </label>
        </div>
        {error && <div style={{ color: '#f87171', fontSize: 12 }}>{error}</div>}
        <button onClick={createType} disabled={saving || !form.name.trim()}
          style={{ alignSelf: 'flex-start', padding: '6px 18px', borderRadius: 6, border: 'none', background: 'rgba(240,165,0,0.15)', color: 'var(--accent)', cursor: 'pointer', fontSize: 11, fontFamily: 'var(--mono)', letterSpacing: 1 }}>
          + EKLE
        </button>
      </div>

      {/* Tip listesi */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        {[...types].sort((a, b) => a.sort_order - b.sort_order).map((type, idx, arr) => (
          <div key={type.id} style={{
            background: 'var(--bg2)', borderRadius: 10, padding: '10px 12px',
            display: 'flex', alignItems: 'center', gap: 10,
            opacity: type.is_active ? 1 : 0.45,
          }}>
            {type.image_url
              ? <img loading="lazy" src={type.image_url} alt={type.name} style={{ width: 28, height: 28, objectFit: 'contain', borderRadius: 4 }} />
              : <span style={{ fontSize: 22 }}>{type.emoji || '•'}</span>
            }
            {editId === type.id ? (
              <div style={{ flex: 1, display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
                <input value={editForm.name ?? type.name} onChange={e => setEditForm(f => ({ ...f, name: e.target.value }))}
                  style={{ width: 130, background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 4, padding: '4px 8px', color: 'var(--text)', fontSize: 13 }} />
                <input value={editForm.emoji ?? (type.emoji || '')} onChange={e => setEditForm(f => ({ ...f, emoji: e.target.value }))}
                  placeholder="Emoji"
                  style={{ width: 60, background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 4, padding: '4px 8px', color: 'var(--text)', fontSize: 13 }} />
                <button onClick={() => saveEdit(type.id)} disabled={saving}
                  style={{ padding: '4px 12px', borderRadius: 6, border: 'none', background: '#1d4ed8', color: '#fff', fontSize: 12, cursor: 'pointer' }}>Kaydet</button>
                <button onClick={() => { setEditId(null); setEditForm({}) }}
                  style={{ padding: '4px 8px', borderRadius: 6, border: 'none', background: 'transparent', color: 'var(--text3)', fontSize: 12, cursor: 'pointer' }}>İptal</button>
              </div>
            ) : (
              <div style={{ flex: 1 }}>
                <span style={{ fontSize: 13, color: 'var(--text)', fontWeight: 600 }}>{type.name}</span>
                {!type.is_active && <span style={{ fontSize: 10, color: 'var(--text3)', marginLeft: 8 }}>(gizli)</span>}
                {/* Üç durumlu ütü politikası. "Belirtilmedi" kioskta ütüyü
                    AÇIK getirir ve operatöre "kontrol et" uyarısı gösterir;
                    ütü istemeyen türü açıkça "Ütülenmez" işaretleyin. */}
                <span style={{ marginLeft: 8, display: 'inline-flex', gap: 3 }}>
                  {IRONING_CHOICES.map(choice => {
                    const active = (type.ironing_policy || 'ask') === choice.key
                    return (
                      <button key={choice.key} type="button"
                        onClick={() => laundryApi.updateGarmentType(type.id, { ironing_policy: choice.key })
                          .then(() => {
                            qc.invalidateQueries({ queryKey: ['garment-types-all'] })
                            qc.invalidateQueries({ queryKey: ['garment-types'] })
                          })}
                        style={{
                          padding: '2px 7px', borderRadius: 10, cursor: 'pointer',
                          border: `1px solid ${active ? choice.color : 'var(--border)'}`,
                          background: active ? choice.bg : 'transparent',
                          color: active ? choice.color : 'var(--text3)', fontSize: 9,
                        }}>
                        {choice.label}
                      </button>
                    )
                  })}
                </span>
              </div>
            )}
            <div style={{ display: 'flex', gap: 4 }}>
              <button onClick={() => moveOrder(type, -1)} disabled={idx === 0}
                style={{ padding: '3px 7px', borderRadius: 6, border: 'none', background: 'var(--bg)', color: idx === 0 ? 'var(--border)' : 'var(--text3)', cursor: 'pointer', fontSize: 12 }}>↑</button>
              <button onClick={() => moveOrder(type, 1)} disabled={idx === arr.length - 1}
                style={{ padding: '3px 7px', borderRadius: 6, border: 'none', background: 'var(--bg)', color: idx === arr.length - 1 ? 'var(--border)' : 'var(--text3)', cursor: 'pointer', fontSize: 12 }}>↓</button>
              <button onClick={() => { setEditId(type.id); setEditForm({}) }}
                style={{ padding: '3px 8px', borderRadius: 6, border: 'none', background: 'var(--bg)', color: '#60a5fa', cursor: 'pointer', fontSize: 12 }}>✏</button>
              <button onClick={() => toggleActive(type)}
                style={{ padding: '3px 8px', borderRadius: 6, border: 'none', background: 'var(--bg)', color: type.is_active ? '#f87171' : '#4ade80', cursor: 'pointer', fontSize: 12 }}>
                {type.is_active ? 'Gizle' : 'Göster'}
              </button>
            </div>
          </div>
        ))}
      </div>
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
      <td data-label="Asama" style={{ fontWeight: 600 }}>{STAGE_LABELS[config.stage] || config.stage}</td>
      <td data-label="Uyari">
        <input type="number" className="form-input" style={{ width: 70 }}
          value={warn} min={1} onChange={e => setWarn(e.target.value)} />
        <span style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--text3)', marginLeft: 4 }}>saat</span>
      </td>
      <td data-label="Kritik">
        <input type="number" className="form-input" style={{ width: 70 }}
          value={crit} min={1} onChange={e => setCrit(e.target.value)} />
        <span style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--text3)', marginLeft: 4 }}>saat</span>
      </td>
      <td data-label="WhatsApp">
        <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
          <input type="checkbox" checked={waNotify} onChange={e => setWaNotify(e.target.checked)} />
          <span style={{ fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--text3)' }}>WA</span>
        </label>
      </td>
      <td data-label="Islem">
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
  const [tab, setTab] = useUrlParamState('tab', 'sla')
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
          { key: 'cards',    label: '🪪 Kart Sistemi' },
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
              <SkeletonTable rows={3} cols={4} />
            ) : (
              <table className="data-table responsive-stack">
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
              <table className="data-table responsive-stack">
                <thead>
                  <tr><th>Ad</th><th>Tip</th><th>Kapasite</th><th>Durum</th><th></th></tr>
                </thead>
                <tbody>
                  {machines.map(m => (
                    <tr key={m.id}>
                      <td data-label="Ad" style={{ fontWeight: 600 }}>{m.name}</td>
                      <td data-label="Tip" style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--text3)', textTransform: 'uppercase' }}>
                        {m.machine_type === 'washer' ? 'Yıkama' : 'Kurutma'}
                      </td>
                      <td data-label="Kapasite">{m.capacity}</td>
                      <td data-label="Durum">
                        <span className={`badge ${m.status === 'running' ? 'badge-amber' : m.status === 'done' ? 'badge-green' : 'badge-gray'}`}>
                          {m.status === 'running' ? 'Çalışıyor' : m.status === 'done' ? 'Bitti' : 'Boşta'}
                        </span>
                      </td>
                      <td data-label="Islem">
                        <button className="btn btn-ghost btn-xs"
                          onClick={async () => { if (await confirmDialog({ title: 'Makine Sil', body: `"${m.name}" silinsin mi?`, danger: true })) deleteMachine.mutate(m.id) }}>
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
      {tab === 'cards' && <CardSystemSettings />}
      {tab === 'garment-types' && (
        <div className="panel">
          <div className="panel-header"><span className="panel-title">KIYAFet TİPLERİ</span></div>
          <div className="panel-body"><GarmentTypesAdmin /></div>
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
      <table className="data-table responsive-stack" style={{ marginBottom: 0 }}>
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
              <td data-label="Blok">
                <span style={{
                  fontFamily: 'var(--mono)', fontWeight: 700,
                  color: b.is_premium ? 'var(--accent)' : 'var(--text)',
                }}>
                  {b.block}
                </span>
              </td>
              <td data-label="Tip">
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
              <td data-label="Islem">
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
