import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import api from '../../../shared/api/client.js'
import { useAuthStore } from '../../../shared/store/authStore.js'
import { KPI, Label, ModalActions, ModalShell, Section, todayStr, toast, toastErr } from '../shared.jsx'

const addDays = (date, days) => {
  const value = new Date(`${date}T12:00:00Z`)
  value.setUTCDate(value.getUTCDate() + days)
  return value.toISOString().slice(0, 10)
}

export default function PlanningTab() {
  const today = todayStr()
  const qc = useQueryClient()
  const user = useAuthStore(state => state.user)
  const canConfigure = user?.role === 'campus_manager'
  const [start, setStart] = useState(today)
  const [end, setEnd] = useState(addDays(today, 6))
  const [preview, setPreview] = useState(null)
  const [warningReason, setWarningReason] = useState('')
  const [templateOpen, setTemplateOpen] = useState(false)
  const { data: templates = [] } = useQuery({
    queryKey: ['transport-v2-templates'],
    queryFn: () => api.get('/transport/trip-templates').then(response => response.data),
  })
  const previewMutation = useMutation({
    mutationFn: () => api.post('/transport/plan/preview', { start_date: start, end_date: end }).then(response => response.data),
    onSuccess: setPreview,
    onError: toastErr,
  })
  const publishMutation = useMutation({
    mutationFn: () => api.post('/transport/plan/publish', {
      start_date: start,
      end_date: end,
      base_revision: preview.base_revision,
      warning_reason: warningReason || undefined,
    }),
    onSuccess: response => {
      toast(`${response.data.trips.length} sefer yayınlandı`)
      qc.invalidateQueries({ queryKey: ['transport-v2-operations'] })
      setPreview(null)
    },
    onError: toastErr,
  })

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'end', gap: 8, flexWrap: 'wrap', marginBottom: 14 }}>
        <div><Label>Başlangıç</Label><input className="form-input" type="date" value={start} onChange={event => { setStart(event.target.value); setPreview(null) }} /></div>
        <div><Label>Bitiş</Label><input className="form-input" type="date" value={end} onChange={event => { setEnd(event.target.value); setPreview(null) }} /></div>
        <button className="btn btn-primary" onClick={() => previewMutation.mutate()} disabled={!templates.length || previewMutation.isPending}>
          {previewMutation.isPending ? 'HAZIRLANIYOR…' : '⚡ PLAN ÖNER'}
        </button>
        {canConfigure && <button className="btn btn-ghost" onClick={() => setTemplateOpen(true)}>+ ŞABLON</button>}
      </div>

      <Section title={`🗓 SEFER ŞABLONLARI (${templates.length})`}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(230px,1fr))', gap: 8 }}>
          {templates.map(template => (
            <div key={template.id} style={{ padding: 10, borderRadius: 9, background: 'var(--surface2)', borderLeft: `4px solid ${template.route_color || 'var(--accent)'}` }}>
              <strong>{template.name}</strong>
              <div style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--text3)', marginTop: 4 }}>
                {template.direction === 'outbound' ? 'GİDİŞ' : 'DÖNÜŞ'} · {template.departure_time} · {template.route_name}
              </div>
              <div style={{ fontSize: 10, color: 'var(--text4)', marginTop: 4 }}>{template.vehicle_plate || 'Araç yok'} · {template.driver_name || 'Şoför yok'}</div>
            </div>
          ))}
        </div>
      </Section>

      {preview && <>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(145px,1fr))', gap: 8, marginBottom: 12 }}>
          <KPI label="SEFER" value={preview.summary.trip_count} color="var(--accent)" />
          <KPI label="ATAMA" value={preview.summary.assignment_count} color="var(--green)" />
          <KPI label="YEDEK" value={preview.summary.waitlist_count} color="var(--amber)" />
          <KPI label="ENGEL" value={preview.summary.blocker_count} color={preview.summary.blocker_count ? 'var(--red)' : 'var(--green)'} />
        </div>
        {(preview.blockers.length > 0 || preview.warnings.length > 0) && (
          <Section title="⚠ PLAN KONTROLÜ" danger={preview.blockers.length > 0}>
            {[...preview.blockers, ...preview.warnings].map((item, index) => (
              <div key={`${item.code}-${index}`} style={{ padding: 6, color: item.severity === 'blocker' ? 'var(--red)' : 'var(--amber)', fontSize: 12 }}>
                {item.severity === 'blocker' ? '⛔' : '⚠'} {item.message}
              </div>
            ))}
          </Section>
        )}
        <Section title="ÖNERİLEN SEFERLER">
          {preview.trips.map(trip => (
            <div key={trip.key} style={{ display: 'grid', gridTemplateColumns: '120px 1fr auto', gap: 8, padding: 9, borderBottom: '1px solid var(--border)', alignItems: 'center' }}>
              <strong>{trip.work_date}<br />{trip.scheduled_departure.slice(11, 16)}</strong>
              <div>{trip.route_name}<div style={{ fontSize: 10, color: 'var(--text3)' }}>{trip.direction === 'outbound' ? 'Gidiş' : 'Dönüş'} · {trip.vehicle_plate} · {trip.driver_name}</div></div>
              <span style={{ fontFamily: 'var(--mono)', fontSize: 11 }}>{trip.assignments.length}/{trip.capacity}{trip.waitlist.length ? ` +${trip.waitlist.length} yedek` : ''}</span>
            </div>
          ))}
        </Section>
        {preview.warnings.length > 0 && <>
          <Label>Uyarılarla yayınlama gerekçesi *</Label>
          <input className="form-input" value={warningReason} onChange={event => setWarningReason(event.target.value)} placeholder="Kontrol edildi…" />
        </>}
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <button className="btn btn-ghost" onClick={() => setPreview(null)}>VAZGEÇ</button>
          <button className="btn btn-primary" onClick={() => publishMutation.mutate()}
            disabled={preview.blockers.length > 0 || (preview.warnings.length > 0 && !warningReason.trim()) || publishMutation.isPending}>
            ✓ PLANI YAYINLA
          </button>
        </div>
      </>}
      {templateOpen && <TemplateModal onClose={() => setTemplateOpen(false)} />}
    </div>
  )
}

function TemplateModal({ onClose }) {
  const qc = useQueryClient()
  const [form, setForm] = useState({
    name: '', route_id: '', direction: 'outbound', departure_time: '07:00',
    days_of_week: [1, 2, 3, 4, 5], default_vehicle_id: '', default_driver_id: '',
  })
  const { data: routes = [] } = useQuery({ queryKey: ['transport-routes-template'], queryFn: () => api.get('/transport/routes?active=1').then(r => r.data) })
  const { data: vehicles = [] } = useQuery({ queryKey: ['transport-v2-vehicles'], queryFn: () => api.get('/transport/vehicles?active=1').then(r => r.data) })
  const { data: drivers = [] } = useQuery({ queryKey: ['transport-v2-drivers'], queryFn: () => api.get('/transport/drivers?active=1').then(r => r.data) })
  const mutation = useMutation({
    mutationFn: () => api.post('/transport/trip-templates', {
      ...form,
      route_id: +form.route_id,
      default_vehicle_id: +form.default_vehicle_id,
      default_driver_id: +form.default_driver_id,
    }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['transport-v2-templates'] }); toast('Şablon eklendi'); onClose() },
    onError: toastErr,
  })
  return <ModalShell title="YENİ SEFER ŞABLONU" onClose={onClose} wide>
    <Label>Şablon adı *</Label><input className="form-input" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} autoFocus />
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
      <div><Label>Hat *</Label><select className="form-select" value={form.route_id} onChange={e => setForm({ ...form, route_id: e.target.value })}><option value="">Seçin</option>{routes.map(row => <option key={row.id} value={row.id}>{row.name}</option>)}</select></div>
      <div><Label>Yön</Label><select className="form-select" value={form.direction} onChange={e => setForm({ ...form, direction: e.target.value })}><option value="outbound">Gidiş</option><option value="inbound">Dönüş</option></select></div>
      <div><Label>Kalkış</Label><input className="form-input" type="time" value={form.departure_time} onChange={e => setForm({ ...form, departure_time: e.target.value })} /></div>
      <div><Label>Araç *</Label><select className="form-select" value={form.default_vehicle_id} onChange={e => setForm({ ...form, default_vehicle_id: e.target.value })}><option value="">Seçin</option>{vehicles.map(row => <option key={row.id} value={row.id}>{row.plate}</option>)}</select></div>
      <div><Label>Şoför *</Label><select className="form-select" value={form.default_driver_id} onChange={e => setForm({ ...form, default_driver_id: e.target.value })}><option value="">Seçin</option>{drivers.map(row => <option key={row.id} value={row.id}>{row.full_name}</option>)}</select></div>
    </div>
    <ModalActions onClose={onClose} onSave={() => mutation.mutate()}
      disabled={!form.name || !form.route_id || !form.default_vehicle_id || !form.default_driver_id || mutation.isPending} loading={mutation.isPending} />
  </ModalShell>
}

