import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import api from '../../../shared/api/client.js'
import { confirmDialog } from '../../../shared/components/ConfirmDialog.jsx'
import { toastErr, shiftColor, ModalOverlay, formatShiftHour } from '../shared.jsx'
import RotationPanel from './RotationPanel.jsx'

export default function SettingsTab({ departments, shiftDefs }) {
  const qc = useQueryClient()
  const [defModal, setDefModal] = useState(null)
  const [defForm, setDefForm] = useState({ name: '', start_hour: '', end_hour: '', color_class: 'bg-blue-400' })
  const [locModal, setLocModal] = useState(null)
  const [locForm, setLocForm] = useState({ name: '', dept_id: '', site: '', color_class: 'bg-blue-400', sort_order: '' })
  const [roleModal, setRoleModal] = useState(null)
  const [roleForm, setRoleForm] = useState({ name: '', sort_order: '', expected_dept_id: '' })

  const { data: workLocations = [] } = useQuery({
    queryKey: ['shift-work-locations'],
    queryFn: () => api.get('/shifts/work-locations').then(r => r.data),
  })

  const { data: staffRoles = [] } = useQuery({
    queryKey: ['shift-roles'],
    queryFn: () => api.get('/shifts/roles').then(r => r.data),
  })

  // Ayarlar'daki her değişiklik açık çizelgeyi/kırılımı/coverage'ı da tazelesin — "düzenleyince planda güncellensin"
  const refreshPlan = () => {
    const keys = ['shift-defs', 'shift-work-locations', 'shift-roles', 'staff-list', 'staff-list-active', 'staff-quality', 'schedule', 'shift-coverage', 'shift-breakdown']
    keys.forEach(k => qc.invalidateQueries({ queryKey: [k] }))
  }
  const createDef = useMutation({ mutationFn: data => api.post('/shifts/definitions', data), onSuccess: () => { refreshPlan(); setDefModal(null) }, onError: toastErr })
  const updateDef = useMutation({ mutationFn: ({ id, ...data }) => api.put(`/shifts/definitions/${id}`, data), onSuccess: () => { refreshPlan(); setDefModal(null) }, onError: toastErr })
  const deleteDef = useMutation({ mutationFn: (id) => api.delete(`/shifts/definitions/${id}`), onSuccess: refreshPlan })
  const createLoc = useMutation({ mutationFn: data => api.post('/shifts/work-locations', data), onSuccess: () => { refreshPlan(); setLocModal(null) }, onError: toastErr })
  const updateLoc = useMutation({ mutationFn: ({ id, ...data }) => api.put(`/shifts/work-locations/${id}`, data), onSuccess: () => { refreshPlan(); setLocModal(null) }, onError: toastErr })
  const deleteLoc = useMutation({ mutationFn: id => api.delete(`/shifts/work-locations/${id}`), onSuccess: refreshPlan, onError: toastErr })
  const createRole = useMutation({ mutationFn: data => api.post('/shifts/roles', data), onSuccess: () => { refreshPlan(); setRoleModal(null) }, onError: toastErr })
  const updateRole = useMutation({ mutationFn: ({ id, ...data }) => api.put(`/shifts/roles/${id}`, data), onSuccess: () => { refreshPlan(); setRoleModal(null) }, onError: toastErr })
  const deleteRole = useMutation({ mutationFn: id => api.delete(`/shifts/roles/${id}`), onSuccess: refreshPlan, onError: toastErr })

  const DEF_COLORS = [
    'bg-blue-400', 'bg-blue-600', 'bg-indigo-600', 'bg-violet-500',
    'bg-emerald-500', 'bg-green-500', 'bg-lime-500', 'bg-teal-500',
    'bg-cyan-500', 'bg-orange-400', 'bg-orange-500', 'bg-amber-500',
    'bg-yellow-500', 'bg-red-500', 'bg-rose-500', 'bg-pink-500',
    'bg-fuchsia-500', 'bg-slate-500',
  ]

  return (
    <div className="fade-up">
      <div className="sect"><div className="sect-title">VARDIYA TANIMLARI</div><div className="sect-line" /></div>

      <div className="panel" style={{ marginBottom: '28px' }}>
        <div className="panel-header">
          <div><div className="panel-title">VARDIYA TANIMLARI</div><div className="panel-subtitle">{shiftDefs.length} TANIM</div></div>
          <button className="btn btn-primary btn-sm" onClick={() => { setDefForm({ name: '', start_hour: '', end_hour: '', color_class: 'bg-blue-400' }); setDefModal({}) }}>+ Yeni Tanim</button>
        </div>
        <div className="panel-body" style={{ padding: 0 }}>
          {shiftDefs.length === 0 ? (
            <div className="empty-state"><div className="empty-icon">&#9881;</div><div className="empty-title">TANIM YOK</div></div>
          ) : (
            <table className="data-table responsive-stack">
              <thead><tr><th>Renk</th><th>Ad</th><th>Baslangic</th><th>Bitis</th><th>Islem</th></tr></thead>
              <tbody>
                {shiftDefs.map(s => {
                  const sc = shiftColor(s.color_class)
                  return (
                    <tr key={s.id}>
                      <td data-label="Renk"><span style={{ width: '16px', height: '16px', borderRadius: '4px', background: sc.text, display: 'inline-block' }} /></td>
                      <td data-label="Ad" style={{ fontWeight: 600 }}>{s.name}</td>
                      <td data-label="Baslangic" style={{ fontFamily: 'var(--mono)', color: 'var(--text2)' }}>{formatShiftHour(s.start_hour)}</td>
                      <td data-label="Bitis" style={{ fontFamily: 'var(--mono)', color: 'var(--text2)' }}>{formatShiftHour(s.end_hour)}</td>
                      <td data-label="Islem">
                        <div style={{ display: 'flex', gap: '6px', justifyContent: 'flex-end', flexWrap: 'wrap' }}>
                          <button className="btn btn-ghost btn-sm" onClick={() => { setDefForm({ name: s.name, start_hour: s.start_hour?.toString() || '', end_hour: s.end_hour?.toString() || '', color_class: s.color_class || 'bg-blue-400', min_staff: s.min_staff?.toString() || '' }); setDefModal(s) }}>Duzenle</button>
                          <button className="btn btn-danger btn-sm" onClick={async () => { if (await confirmDialog({ title: 'Tanımı Sil', body: `${s.name} tanımını silmek istediğinizden emin misiniz?`, danger: true })) deleteDef.mutate(s.id) }}>Sil</button>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>

      <div className="panel" style={{ marginBottom: '28px' }}>
        <div className="panel-header">
          <div><div className="panel-title">CALISMA NOKTALARI</div><div className="panel-subtitle">{workLocations.length} NOKTA</div></div>
          <button className="btn btn-primary btn-sm" onClick={() => { setLocForm({ name: '', dept_id: '', site: '', color_class: 'bg-blue-400', sort_order: '' }); setLocModal({}) }}>+ Yeni Nokta</button>
        </div>
        <div className="panel-body" style={{ padding: 0 }}>
          <table className="data-table responsive-stack">
            <thead><tr><th>Renk</th><th>Nokta</th><th>Site</th><th>Bolum</th><th>Sira</th><th>Islem</th></tr></thead>
            <tbody>
              {workLocations.map(loc => {
                const sc = shiftColor(loc.color_class)
                return (
                  <tr key={loc.id}>
                    <td data-label="Renk"><span style={{ width: '16px', height: '16px', borderRadius: '4px', background: sc.text, display: 'inline-block' }} /></td>
                    <td data-label="Nokta" style={{ fontWeight: 600 }}>{loc.name}</td>
                    <td data-label="Site">{loc.site ? <span className="badge badge-blue" style={{ fontSize: '10px' }}>{loc.site}</span> : '-'}</td>
                    <td data-label="Bolum">{loc.dept_name || '-'}</td>
                    <td data-label="Sira" style={{ fontFamily: 'var(--mono)' }}>{loc.sort_order ?? 0}</td>
                    <td data-label="Islem">
                      <div style={{ display: 'flex', gap: '6px', justifyContent: 'flex-end', flexWrap: 'wrap' }}>
                        <button className="btn btn-ghost btn-sm" onClick={() => { setLocForm({ name: loc.name, dept_id: loc.dept_id?.toString() || '', site: loc.site || '', color_class: loc.color_class || 'bg-blue-400', sort_order: loc.sort_order?.toString() || '' }); setLocModal(loc) }}>Duzenle</button>
                        <button className="btn btn-danger btn-sm" onClick={async () => { if (await confirmDialog({ title: 'Noktayi Pasiflestir', body: `${loc.name} pasif yapilsin mi?`, danger: true })) deleteLoc.mutate(loc.id) }}>Pasif</button>
                      </div>
                    </td>
                  </tr>
                )
              })}
              {workLocations.length === 0 && <tr><td colSpan={6} style={{ textAlign: 'center', color: 'var(--text3)', padding: '20px' }}>Nokta yok</td></tr>}
            </tbody>
          </table>
        </div>
      </div>

      <div className="panel" style={{ marginBottom: '28px' }}>
        <div className="panel-header">
          <div><div className="panel-title">PERSONEL ROLLERI</div><div className="panel-subtitle">{staffRoles.length} ROL</div></div>
          <button className="btn btn-primary btn-sm" onClick={() => { setRoleForm({ name: '', sort_order: '', expected_dept_id: '' }); setRoleModal({}) }}>+ Yeni Rol</button>
        </div>
        <div className="panel-body" style={{ padding: 0 }}>
          <table className="data-table responsive-stack">
            <thead><tr><th>Rol</th><th>Beklenen Bolum</th><th>Sira</th><th>Islem</th></tr></thead>
            <tbody>
              {staffRoles.map(role => (
                <tr key={role.id}>
                  <td data-label="Rol" style={{ fontWeight: 600 }}>{role.name}</td>
                  <td data-label="Beklenen Bolum">{role.expected_dept_name || 'Genel / serbest'}</td>
                  <td data-label="Sira" style={{ fontFamily: 'var(--mono)' }}>{role.sort_order ?? 0}</td>
                  <td data-label="Islem">
                    <div style={{ display: 'flex', gap: '6px', justifyContent: 'flex-end', flexWrap: 'wrap' }}>
                      <button className="btn btn-ghost btn-sm" onClick={() => { setRoleForm({ name: role.name, sort_order: role.sort_order?.toString() || '', expected_dept_id: role.expected_dept_id?.toString() || '' }); setRoleModal(role) }}>Duzenle</button>
                      <button className="btn btn-danger btn-sm" onClick={async () => { if (await confirmDialog({ title: 'Rolu Pasiflestir', body: `${role.name} pasif yapilsin mi?`, danger: true })) deleteRole.mutate(role.id) }}>Pasif</button>
                    </div>
                  </td>
                </tr>
              ))}
              {staffRoles.length === 0 && <tr><td colSpan={4} style={{ textAlign: 'center', color: 'var(--text3)', padding: '20px' }}>Rol yok</td></tr>}
            </tbody>
          </table>
        </div>
      </div>

      <RotationPanel departments={departments} shiftDefs={shiftDefs} />

      {defModal !== null && (
        <ModalOverlay onClose={() => setDefModal(null)}>
          <h3 style={{ fontFamily: 'var(--display)', fontSize: '18px', letterSpacing: '2px', marginBottom: '16px' }}>{defModal.id ? 'VARDIYA TANIMINI DUZENLE' : 'YENI VARDIYA TANIMI'}</h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
            <div><label className="form-label">Vardiya Adi</label><input className="form-input" value={defForm.name} onChange={e => setDefForm(p => ({ ...p, name: e.target.value }))} /></div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '10px' }}>
              <div><label className="form-label">Baslangic Saati</label><input type="number" min="0" max="23" className="form-input" value={defForm.start_hour} onChange={e => setDefForm(p => ({ ...p, start_hour: e.target.value }))} /></div>
              <div><label className="form-label">Bitis Saati</label><input type="number" min="0" max="24" className="form-input" value={defForm.end_hour} onChange={e => setDefForm(p => ({ ...p, end_hour: e.target.value }))} /></div>
              <div><label className="form-label" title="Bu vardiya icin gunluk hedef kisi (0=hedefsiz)">Kadro Hedefi</label><input type="number" min="0" className="form-input" value={defForm.min_staff ?? ''} onChange={e => setDefForm(p => ({ ...p, min_staff: e.target.value }))} placeholder="0" /></div>
            </div>
            <div><label className="form-label">Renk</label>
              <div style={{ display: 'flex', gap: '8px' }}>
                {DEF_COLORS.map(c => { const sc = shiftColor(c); return (<button key={c} onClick={() => setDefForm(p => ({ ...p, color_class: c }))} style={{ width: '32px', height: '32px', borderRadius: '6px', background: sc.bg, border: `2px solid ${defForm.color_class === c ? sc.text : 'transparent'}`, cursor: 'pointer' }}><span style={{ width: '12px', height: '12px', borderRadius: '3px', background: sc.text, display: 'inline-block' }} /></button>) })}
              </div>
            </div>
          </div>
          <div style={{ display: 'flex', gap: '8px', marginTop: '16px' }}>
            <button className="btn btn-primary" style={{ flex: 1, opacity: (!defForm.name || !defForm.start_hour || !defForm.end_hour) ? 0.5 : 1 }}
              disabled={!defForm.name || !defForm.start_hour || !defForm.end_hour}
              onClick={() => {
                const payload = { name: defForm.name, start_hour: parseInt(defForm.start_hour), end_hour: parseInt(defForm.end_hour), color_class: defForm.color_class, min_staff: parseInt(defForm.min_staff) || 0 }
                if (defModal.id) updateDef.mutate({ id: defModal.id, ...payload }); else createDef.mutate(payload)
              }}>
              {defModal.id ? 'Guncelle' : 'Olustur'}
            </button>
            <button className="btn btn-ghost" onClick={() => setDefModal(null)}>Iptal</button>
          </div>
        </ModalOverlay>
      )}

      {locModal !== null && (
        <ModalOverlay onClose={() => setLocModal(null)}>
          <h3 style={{ fontFamily: 'var(--display)', fontSize: '18px', letterSpacing: '2px', marginBottom: '16px' }}>{locModal.id ? 'CALISMA NOKTASINI DUZENLE' : 'YENI CALISMA NOKTASI'}</h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
            <div><label className="form-label">Nokta Adi</label><input className="form-input" value={locForm.name} onChange={e => setLocForm(p => ({ ...p, name: e.target.value }))} /></div>
            <div><label className="form-label">Bagli Bolum</label>
              <select className="form-select" value={locForm.dept_id} onChange={e => setLocForm(p => ({ ...p, dept_id: e.target.value }))}>
                <option value="">Bolumsuz / genel</option>
                {departments.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
              </select>
            </div>
            <div><label className="form-label">Site (OTC / LOKAL / KAMP)</label>
              <input className="form-input" list="wl-site-list" placeholder="OTC / LOKAL / KAMP" value={locForm.site} onChange={e => setLocForm(p => ({ ...p, site: e.target.value }))} />
              <datalist id="wl-site-list">
                <option value="OTC" /><option value="LOKAL" /><option value="KAMP" />
                {[...new Set(workLocations.map(l => l.site).filter(Boolean))].map(s => <option key={s} value={s} />)}
              </datalist>
            </div>
            <div><label className="form-label">Sira</label><input type="number" className="form-input" value={locForm.sort_order} onChange={e => setLocForm(p => ({ ...p, sort_order: e.target.value }))} /></div>
            <div><label className="form-label">Renk</label>
              <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                {DEF_COLORS.map(c => { const sc = shiftColor(c); return (<button key={c} onClick={() => setLocForm(p => ({ ...p, color_class: c }))} style={{ width: '32px', height: '32px', borderRadius: '6px', background: sc.bg, border: `2px solid ${locForm.color_class === c ? sc.text : 'transparent'}`, cursor: 'pointer' }}><span style={{ width: '12px', height: '12px', borderRadius: '3px', background: sc.text, display: 'inline-block' }} /></button>) })}
              </div>
            </div>
          </div>
          <div style={{ display: 'flex', gap: '8px', marginTop: '16px' }}>
            <button className="btn btn-primary" style={{ flex: 1, opacity: !locForm.name ? 0.5 : 1 }}
              disabled={!locForm.name}
              onClick={() => {
                const payload = { name: locForm.name, dept_id: locForm.dept_id ? parseInt(locForm.dept_id) : null, site: locForm.site?.trim() || null, color_class: locForm.color_class, sort_order: parseInt(locForm.sort_order) || 0 }
                if (locModal.id) updateLoc.mutate({ id: locModal.id, ...payload }); else createLoc.mutate(payload)
              }}>
              {locModal.id ? 'Guncelle' : 'Olustur'}
            </button>
            <button className="btn btn-ghost" onClick={() => setLocModal(null)}>Iptal</button>
          </div>
        </ModalOverlay>
      )}

      {roleModal !== null && (
        <ModalOverlay onClose={() => setRoleModal(null)}>
          <h3 style={{ fontFamily: 'var(--display)', fontSize: '18px', letterSpacing: '2px', marginBottom: '16px' }}>{roleModal.id ? 'ROLU DUZENLE' : 'YENI ROL'}</h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
            <div><label className="form-label">Rol Adi</label><input className="form-input" value={roleForm.name} onChange={e => setRoleForm(p => ({ ...p, name: e.target.value }))} /></div>
            <div><label className="form-label">Beklenen Bolum</label>
              <select className="form-select" value={roleForm.expected_dept_id} onChange={e => setRoleForm(p => ({ ...p, expected_dept_id: e.target.value }))}>
                <option value="">Genel / birden fazla bolumde kullanilir</option>
                {departments.map(department => <option key={department.id} value={department.id}>{department.name}</option>)}
              </select>
            </div>
            <div><label className="form-label">Sira</label><input type="number" className="form-input" value={roleForm.sort_order} onChange={e => setRoleForm(p => ({ ...p, sort_order: e.target.value }))} /></div>
          </div>
          <div style={{ display: 'flex', gap: '8px', marginTop: '16px' }}>
            <button className="btn btn-primary" style={{ flex: 1, opacity: !roleForm.name ? 0.5 : 1 }}
              disabled={!roleForm.name}
              onClick={() => {
                const payload = { name: roleForm.name, sort_order: parseInt(roleForm.sort_order) || 0, expected_dept_id: roleForm.expected_dept_id ? parseInt(roleForm.expected_dept_id) : null }
                if (roleModal.id) updateRole.mutate({ id: roleModal.id, ...payload }); else createRole.mutate(payload)
              }}>
              {roleModal.id ? 'Guncelle' : 'Olustur'}
            </button>
            <button className="btn btn-ghost" onClick={() => setRoleModal(null)}>Iptal</button>
          </div>
        </ModalOverlay>
      )}
    </div>
  )
}
