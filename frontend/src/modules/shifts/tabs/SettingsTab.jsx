import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import api from '../../../shared/api/client.js'
import { confirmDialog } from '../../../shared/components/ConfirmDialog.jsx'
import { toastErr, shiftColor, ModalOverlay, formatShiftHour } from '../shared.jsx'
import RotationPanel from './RotationPanel.jsx'

export default function SettingsTab({ departments, shiftDefs }) {
  const qc = useQueryClient()
  const [defModal, setDefModal] = useState(null)
  const [defForm, setDefForm] = useState({ name: '', start_hour: '', end_hour: '', color_class: 'bg-blue-400' })

  const createDef = useMutation({ mutationFn: data => api.post('/shifts/definitions', data), onSuccess: () => { qc.invalidateQueries({ queryKey: ['shift-defs'] }); setDefModal(null) }, onError: toastErr })
  const updateDef = useMutation({ mutationFn: ({ id, ...data }) => api.put(`/shifts/definitions/${id}`, data), onSuccess: () => { qc.invalidateQueries({ queryKey: ['shift-defs'] }); setDefModal(null) }, onError: toastErr })
  const deleteDef = useMutation({ mutationFn: (id) => api.delete(`/shifts/definitions/${id}`), onSuccess: () => qc.invalidateQueries({ queryKey: ['shift-defs'] }) })

  const DEF_COLORS = ['bg-blue-400', 'bg-orange-400', 'bg-indigo-600']

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
    </div>
  )
}
