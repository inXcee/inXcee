import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import api from '../../../shared/api/client.js'
import { confirmDialog } from '../../../shared/components/ConfirmDialog.jsx'
import { toastErr, toastOk, shiftColor } from '../shared.jsx'

// Faz 30 — İsimli rotasyon şablonları: desen oluştur → önizle (kural uyarıları) → uygula
export default function RotationPanel({ departments, shiftDefs }) {
  const qc = useQueryClient()
  const [newTpl, setNewTpl] = useState({ name: '', pattern: [] })
  const [form, setForm] = useState({ template_id: '', dept_id: '', staff_ids: [], start_date: '', weeks: '4', stagger: true })
  const [preview, setPreview] = useState(null)

  const { data: templates = [] } = useQuery({
    queryKey: ['rotation-templates'],
    queryFn: () => api.get('/shifts/rotation-templates').then(r => r.data),
  })
  const { data: staffList = [] } = useQuery({
    queryKey: ['rotation-staff', form.dept_id],
    queryFn: () => api.get('/shifts/staff', { params: { is_active: 1, ...(form.dept_id ? { dept_id: form.dept_id } : {}) } }).then(r => r.data),
  })

  const createTpl = useMutation({
    mutationFn: d => api.post('/shifts/rotation-templates', d),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['rotation-templates'] }); setNewTpl({ name: '', pattern: [] }); toastOk('Şablon kaydedildi') },
    onError: toastErr,
  })
  const deleteTpl = useMutation({
    mutationFn: id => api.delete(`/shifts/rotation-templates/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['rotation-templates'] }),
    onError: toastErr,
  })
  const previewMut = useMutation({
    mutationFn: d => api.post('/shifts/rotation-templates/preview', d).then(r => r.data),
    onSuccess: setPreview,
    onError: toastErr,
  })
  const applyMut = useMutation({
    mutationFn: d => api.post('/shifts/rotation-templates/apply', d).then(r => r.data),
    onSuccess: res => {
      toastOk(`Rotasyon uygulandı — ${res.count} gün girişi yazıldı`)
      setPreview(null)
      qc.invalidateQueries({ queryKey: ['schedule'] })
      qc.invalidateQueries({ queryKey: ['puantaj'] })
      qc.invalidateQueries({ queryKey: ['puantaj-days-month'] })
    },
    onError: toastErr,
  })

  const defName = id => shiftDefs.find(s => s.id === id)?.name || `#${id}`
  const filteredStaff = staffList.filter(s => !form.dept_id || String(s.department_id) === String(form.dept_id))

  const patternChips = (pattern, onRemove) => (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '5px' }}>
      {pattern.map((item, i) => {
        const isOff = item.shift_def_id == null
        const def = isOff ? null : shiftDefs.find(s => s.id === item.shift_def_id)
        const sc = def ? shiftColor(def.color_class) : null
        return (
          <span key={i} style={{
            display: 'inline-flex', alignItems: 'center', gap: '4px',
            padding: '3px 8px', borderRadius: '14px',
            background: isOff ? 'rgba(167,139,250,.15)' : (sc?.bg || 'var(--surface2)'),
            color: isOff ? 'var(--purple)' : (sc?.text || 'var(--text2)'),
            fontFamily: 'var(--mono)', fontSize: '9px', fontWeight: 700,
          }}>
            {i + 1}. {isOff ? 'OFF' : defName(item.shift_def_id)}
            {onRemove && (
              <button onClick={() => onRemove(i)} style={{ border: 'none', background: 'transparent', color: 'inherit', cursor: 'pointer', padding: 0, fontSize: '10px' }}>✕</button>
            )}
          </span>
        )
      })}
    </div>
  )

  const payload = () => ({
    template_id: parseInt(form.template_id),
    staff_ids: form.staff_ids,
    start_date: form.start_date,
    weeks: parseInt(form.weeks) || 1,
    stagger: form.stagger,
  })
  const canPreview = form.template_id && form.staff_ids.length > 0 && form.start_date
  const updateForm = patch => { setForm(p => ({ ...p, ...patch })); setPreview(null) }

  const doApply = async () => {
    const warnCount = preview?.warnings?.length || 0
    if (warnCount > 0) {
      const ok = await confirmDialog({
        title: 'Uyarılara Rağmen Uygula',
        body: `${warnCount} kural uyarısı var (dinlenme/kesintisiz çalışma). Yine de uygulansın mı?`,
        danger: true,
      })
      if (!ok) return
    }
    applyMut.mutate(payload())
  }

  return (
    <>
      <div className="sect"><div className="sect-title">ROTASYON SABLONLARI</div><div className="sect-line" /></div>

      <div className="panel" style={{ marginBottom: '20px' }}>
        <div className="panel-header">
          <div><div className="panel-title">ŞABLONLAR</div><div className="panel-subtitle">{templates.length} ŞABLON — desen: gün sırasıyla vardiya ya da OFF</div></div>
        </div>
        <div className="panel-body">
          {templates.length === 0 && (
            <div style={{ fontSize: '11px', color: 'var(--text3)', marginBottom: '10px' }}>
              Henüz şablon yok. Örnek: 2 gündüz + 2 gece + 2 OFF.
            </div>
          )}
          {templates.map(t => (
            <div key={t.id} style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '8px 0', borderBottom: '1px solid var(--border)', flexWrap: 'wrap' }}>
              <span style={{ fontWeight: 700, fontSize: '12px', minWidth: '160px' }}>{t.name}</span>
              {patternChips(t.pattern)}
              <button className="btn btn-danger btn-sm" style={{ marginLeft: 'auto' }}
                onClick={async () => {
                  if (await confirmDialog({ title: 'Şablonu Sil', body: `${t.name} şablonu silinsin mi?`, danger: true })) deleteTpl.mutate(t.id)
                }}>Sil</button>
            </div>
          ))}

          <div style={{ marginTop: '14px', padding: '12px', background: 'var(--surface2)', borderRadius: '8px', border: '1px solid var(--border)' }}>
            <div style={{ fontFamily: 'var(--mono)', fontSize: '9px', color: 'var(--text3)', letterSpacing: '1px', marginBottom: '8px' }}>YENİ ŞABLON</div>
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center' }}>
              <input className="form-input" placeholder="Şablon adı (örn. 2G+2A+2OFF)" value={newTpl.name}
                onChange={e => setNewTpl(p => ({ ...p, name: e.target.value }))} style={{ width: '220px', fontSize: '11px' }} />
              <select className="form-select" value="" style={{ width: 'auto', fontSize: '11px' }}
                onChange={e => {
                  if (e.target.value === '') return
                  const val = e.target.value === 'off' ? null : parseInt(e.target.value)
                  setNewTpl(p => ({ ...p, pattern: [...p.pattern, { shift_def_id: val }] }))
                }}>
                <option value="">+ Gün ekle...</option>
                {shiftDefs.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                <option value="off">OFF (haftalık izin)</option>
              </select>
              <button className="btn btn-primary btn-sm"
                disabled={!newTpl.name.trim() || newTpl.pattern.length === 0 || createTpl.isPending}
                onClick={() => createTpl.mutate(newTpl)}>
                {createTpl.isPending ? 'Kaydediliyor...' : 'Şablonu Kaydet'}
              </button>
            </div>
            {newTpl.pattern.length > 0 && (
              <div style={{ marginTop: '8px' }}>
                {patternChips(newTpl.pattern, i => setNewTpl(p => ({ ...p, pattern: p.pattern.filter((_, j) => j !== i) })))}
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="panel">
        <div className="panel-header">
          <div><div className="panel-title">ROTASYON UYGULA</div><div className="panel-subtitle">ÖNİZLE → UYARILARI GÖR → UYGULA</div></div>
        </div>
        <div className="panel-body">
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '12px' }}>
            <div><label className="form-label">Şablon</label>
              <select className="form-select" value={form.template_id} onChange={e => updateForm({ template_id: e.target.value })}>
                <option value="">Şablon seçin...</option>
                {templates.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
              </select>
            </div>
            <div><label className="form-label">Bölüm (personel filtresi)</label>
              <select className="form-select" value={form.dept_id} onChange={e => updateForm({ dept_id: e.target.value, staff_ids: [] })}>
                <option value="">Tümü</option>
                {departments.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
              </select>
            </div>
            <div><label className="form-label">Başlangıç Tarihi</label>
              <input type="date" className="form-input" value={form.start_date} onChange={e => updateForm({ start_date: e.target.value })} />
            </div>
            <div><label className="form-label">Hafta Sayısı (1-8)</label>
              <input type="number" min="1" max="8" className="form-input" value={form.weeks} onChange={e => updateForm({ weeks: e.target.value })} />
            </div>
          </div>

          <div style={{ marginTop: '12px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
              <label className="form-label" style={{ margin: 0 }}>Personel ({form.staff_ids.length} seçili)</label>
              <button className="btn btn-ghost btn-sm" style={{ fontSize: '9px' }}
                onClick={() => updateForm({
                  staff_ids: form.staff_ids.length === filteredStaff.length ? [] : filteredStaff.map(s => s.id),
                })}>
                {form.staff_ids.length === filteredStaff.length && filteredStaff.length > 0 ? 'Seçimi temizle' : 'Tümünü seç'}
              </button>
            </div>
            <div style={{ maxHeight: '160px', overflowY: 'auto', border: '1px solid var(--border)', borderRadius: '8px', padding: '8px', display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: '4px' }}>
              {filteredStaff.length === 0 && <span style={{ fontSize: '11px', color: 'var(--text3)' }}>Personel bulunamadı</span>}
              {filteredStaff.map(s => (
                <label key={s.id} style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '11px', cursor: 'pointer' }}>
                  <input type="checkbox" checked={form.staff_ids.includes(s.id)}
                    onChange={e => updateForm({
                      staff_ids: e.target.checked ? [...form.staff_ids, s.id] : form.staff_ids.filter(id => id !== s.id),
                    })} />
                  {s.full_name}
                </label>
              ))}
            </div>
          </div>

          <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '11px', marginTop: '10px', cursor: 'pointer' }}>
            <input type="checkbox" checked={form.stagger} onChange={e => updateForm({ stagger: e.target.checked })} />
            Kaydırmalı başlat (her personel desende bir sonraki günden başlar — vardiyalar dönüşümlü kapanır)
          </label>

          <div style={{ marginTop: '14px', display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
            <button className="btn btn-ghost" disabled={!canPreview || previewMut.isPending} onClick={() => previewMut.mutate(payload())}>
              {previewMut.isPending ? 'Hesaplanıyor...' : '🔍 Önizle'}
            </button>
            <button className="btn btn-primary" disabled={!preview || applyMut.isPending} onClick={doApply}>
              {applyMut.isPending ? 'Uygulanıyor...' : preview ? `Uygula (${preview.total_entries} giriş)` : 'Uygula'}
            </button>
          </div>

          {preview && (
            <div style={{ marginTop: '14px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
              <div style={{ padding: '10px 12px', background: 'var(--surface2)', borderRadius: '8px', border: '1px solid var(--border)' }}>
                <div style={{ fontFamily: 'var(--mono)', fontSize: '9px', color: 'var(--text3)', letterSpacing: '1px', marginBottom: '6px' }}>
                  ÖNİZLEME — {form.start_date} → {preview.end_date} ({preview.days} gün)
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                  {preview.per_staff.map(p => (
                    <span key={p.staff_id} style={{ fontFamily: 'var(--mono)', fontSize: '10px', padding: '3px 8px', borderRadius: '5px', background: 'var(--surface)', border: '1px solid var(--border)' }}>
                      {p.name}: <span style={{ color: 'var(--green)' }}>{p.scheduled} iş</span> · <span style={{ color: 'var(--purple)' }}>{p.off} off</span>
                    </span>
                  ))}
                </div>
              </div>
              {preview.warnings.length > 0 ? (
                <div style={{ padding: '10px 12px', background: 'rgba(239,68,68,.07)', borderRadius: '8px', border: '1px solid rgba(239,68,68,.3)' }}>
                  <div style={{ fontFamily: 'var(--mono)', fontSize: '9px', color: 'var(--red)', letterSpacing: '1px', marginBottom: '6px' }}>
                    ⚠ {preview.warnings.length} KURAL UYARISI
                  </div>
                  {preview.warnings.map((w, i) => (
                    <div key={i} style={{ fontSize: '11px', color: 'var(--text2)', padding: '2px 0' }}>
                      {w.type === 'rest' ? '🛌' : '📆'} {w.message}
                    </div>
                  ))}
                </div>
              ) : (
                <div style={{ fontSize: '11px', color: 'var(--green)' }}>✓ Kural ihlali yok (kesintisiz çalışma ≤ 6 gün, dinlenme ≥ 11 saat)</div>
              )}
            </div>
          )}
        </div>
      </div>
    </>
  )
}
