import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import api from '../../../shared/api/client.js'
import { useAuthStore } from '../../../shared/store/authStore.js'
import { EmptyState, Label, ModalActions, ModalShell, Section, toast, toastErr } from '../shared.jsx'

const STATUS = {
  active: ['AKTİF', 'var(--green)'],
  out_of_service: ['SERVİS DIŞI', 'var(--red)'],
  unavailable: ['MÜSAİT DEĞİL', 'var(--amber)'],
  inactive: ['PASİF', 'var(--text4)'],
}

export default function ResourcesTab() {
  const user = useAuthStore(state => state.user)
  const canConfigure = user?.role === 'campus_manager'
  const qc = useQueryClient()
  const [modal, setModal] = useState(null)
  const { data: vehicles = [] } = useQuery({
    queryKey: ['transport-v2-vehicles'],
    queryFn: () => api.get('/transport/vehicles').then(response => response.data),
  })
  const { data: drivers = [] } = useQuery({
    queryKey: ['transport-v2-drivers'],
    queryFn: () => api.get('/transport/drivers').then(response => response.data),
  })
  const { data: unavailable = [] } = useQuery({
    queryKey: ['transport-v2-unavailability'],
    queryFn: () => api.get('/transport/resource-unavailability').then(response => response.data),
  })
  const remove = useMutation({
    mutationFn: ({ type, id }) => api.delete(`/transport/${type}/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['transport-v2-vehicles'] })
      qc.invalidateQueries({ queryKey: ['transport-v2-drivers'] })
      toast('Kaynak pasifleştirildi')
    },
    onError: toastErr,
  })

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, marginBottom: 14, flexWrap: 'wrap' }}>
        <div style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--text3)' }}>
          {vehicles.filter(row => row.status === 'active').length} aktif araç · {drivers.filter(row => row.status === 'active').length} aktif şoför
        </div>
        {canConfigure && (
          <div style={{ display: 'flex', gap: 6 }}>
            <button className="btn btn-ghost btn-sm" onClick={() => setModal('unavailable')}>+ MÜSAİT DEĞİL</button>
            <button className="btn btn-ghost btn-sm" onClick={() => setModal('driver')}>+ ŞOFÖR</button>
            <button className="btn btn-primary btn-sm" onClick={() => setModal('vehicle')}>+ ARAÇ</button>
          </div>
        )}
      </div>

      <Section title="🚐 ARAÇLAR">
        {vehicles.length === 0 ? <EmptyState icon="🚐" title="ARAÇ YOK" desc="İlk aracı tanımlayın" /> : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(230px,1fr))', gap: 8 }}>
            {vehicles.map(vehicle => <ResourceCard key={vehicle.id}
              title={vehicle.plate} sub={vehicle.label || `${vehicle.capacity} kişilik`}
              status={vehicle.status} meta={`${vehicle.capacity} kişi · ${vehicle.upcoming_trip_count} yaklaşan sefer`}
              onDeactivate={canConfigure && vehicle.status !== 'inactive' ? () => remove.mutate({ type: 'vehicles', id: vehicle.id }) : null} />)}
          </div>
        )}
      </Section>

      <Section title="🧑‍✈️ ŞOFÖRLER">
        {drivers.length === 0 ? <EmptyState icon="🧑‍✈️" title="ŞOFÖR YOK" desc="İlk şoförü tanımlayın" /> : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(230px,1fr))', gap: 8 }}>
            {drivers.map(driver => <ResourceCard key={driver.id}
              title={driver.full_name} sub={driver.phone || 'Telefon yok'} status={driver.status}
              meta={`${driver.route_count} hat · ${driver.upcoming_trip_count} yaklaşan sefer`}
              onDeactivate={canConfigure && driver.status !== 'inactive' ? () => remove.mutate({ type: 'drivers', id: driver.id }) : null} />)}
          </div>
        )}
      </Section>

      {unavailable.length > 0 && (
        <Section title="⛔ MÜSAİT OLMAYAN KAYNAKLAR">
          {unavailable.map(row => (
            <div key={row.id} style={{ padding: 8, borderBottom: '1px solid var(--border)', fontSize: 12 }}>
              <strong>{row.vehicle_plate || row.driver_name}</strong>
              <span style={{ color: 'var(--text3)', marginLeft: 8 }}>{row.starts_at} → {row.ends_at}</span>
              {row.reason && <span style={{ color: 'var(--amber)', marginLeft: 8 }}>{row.reason}</span>}
            </div>
          ))}
        </Section>
      )}

      {modal === 'vehicle' && <VehicleModal onClose={() => setModal(null)} />}
      {modal === 'driver' && <DriverModal onClose={() => setModal(null)} />}
      {modal === 'unavailable' && <UnavailableModal vehicles={vehicles} drivers={drivers} onClose={() => setModal(null)} />}
    </div>
  )
}

function ResourceCard({ title, sub, status, meta, onDeactivate }) {
  const [label, color] = STATUS[status] || [status, 'var(--text3)']
  return (
    <div style={{ padding: 12, border: '1px solid var(--border)', borderRadius: 10, background: 'var(--surface2)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
        <strong>{title}</strong>
        <span style={{ fontFamily: 'var(--mono)', fontSize: 8, color }}>{label}</span>
      </div>
      <div style={{ color: 'var(--text3)', fontSize: 11, marginTop: 3 }}>{sub}</div>
      <div style={{ fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--text4)', marginTop: 8 }}>{meta}</div>
      {onDeactivate && <button className="btn btn-ghost btn-xs" onClick={onDeactivate} style={{ marginTop: 8 }}>PASİFLEŞTİR</button>}
    </div>
  )
}

function VehicleModal({ onClose }) {
  const qc = useQueryClient()
  const [form, setForm] = useState({ plate: '', label: '', capacity: 16 })
  const mutation = useMutation({
    mutationFn: () => api.post('/transport/vehicles', form),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['transport-v2-vehicles'] }); toast('Araç eklendi'); onClose() },
    onError: toastErr,
  })
  return <ModalShell title="YENİ ARAÇ" onClose={onClose}>
    <Label>Plaka *</Label><input className="form-input" value={form.plate} onChange={event => setForm({ ...form, plate: event.target.value })} autoFocus />
    <Label>Görünen ad</Label><input className="form-input" value={form.label} onChange={event => setForm({ ...form, label: event.target.value })} />
    <Label>Kapasite</Label><input className="form-input" type="number" min="1" max="200" value={form.capacity} onChange={event => setForm({ ...form, capacity: +event.target.value })} />
    <ModalActions onClose={onClose} onSave={() => mutation.mutate()} disabled={!form.plate || mutation.isPending} loading={mutation.isPending} />
  </ModalShell>
}

function DriverModal({ onClose }) {
  const qc = useQueryClient()
  const [form, setForm] = useState({ full_name: '', phone: '' })
  const mutation = useMutation({
    mutationFn: () => api.post('/transport/drivers', form),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['transport-v2-drivers'] }); toast('Şoför eklendi'); onClose() },
    onError: toastErr,
  })
  return <ModalShell title="YENİ ŞOFÖR" onClose={onClose}>
    <Label>Ad soyad *</Label><input className="form-input" value={form.full_name} onChange={event => setForm({ ...form, full_name: event.target.value })} autoFocus />
    <Label>Telefon</Label><input className="form-input" value={form.phone} onChange={event => setForm({ ...form, phone: event.target.value })} />
    <ModalActions onClose={onClose} onSave={() => mutation.mutate()} disabled={!form.full_name || mutation.isPending} loading={mutation.isPending} />
  </ModalShell>
}

function UnavailableModal({ vehicles, drivers, onClose }) {
  const qc = useQueryClient()
  const [form, setForm] = useState({ resource: '', starts_at: '', ends_at: '', reason: '' })
  const mutation = useMutation({
    mutationFn: () => {
      const [kind, id] = form.resource.split(':')
      return api.post('/transport/resource-unavailability', {
        [kind === 'vehicle' ? 'vehicle_id' : 'driver_id']: +id,
        starts_at: form.starts_at,
        ends_at: form.ends_at,
        reason: form.reason,
      })
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['transport-v2-unavailability'] }); toast('Müsaitlik kaydedildi'); onClose() },
    onError: toastErr,
  })
  return <ModalShell title="MÜSAİT DEĞİL" onClose={onClose}>
    <Label>Kaynak *</Label>
    <select className="form-select" value={form.resource} onChange={event => setForm({ ...form, resource: event.target.value })}>
      <option value="">Seçin</option>
      {vehicles.filter(row => row.status === 'active').map(row => <option key={`v${row.id}`} value={`vehicle:${row.id}`}>Araç · {row.plate}</option>)}
      {drivers.filter(row => row.status === 'active').map(row => <option key={`d${row.id}`} value={`driver:${row.id}`}>Şoför · {row.full_name}</option>)}
    </select>
    <Label>Başlangıç *</Label><input className="form-input" type="datetime-local" value={form.starts_at} onChange={event => setForm({ ...form, starts_at: event.target.value })} />
    <Label>Bitiş *</Label><input className="form-input" type="datetime-local" value={form.ends_at} onChange={event => setForm({ ...form, ends_at: event.target.value })} />
    <Label>Gerekçe</Label><input className="form-input" value={form.reason} onChange={event => setForm({ ...form, reason: event.target.value })} />
    <ModalActions onClose={onClose} onSave={() => mutation.mutate()} disabled={!form.resource || !form.starts_at || !form.ends_at || mutation.isPending} loading={mutation.isPending} />
  </ModalShell>
}

