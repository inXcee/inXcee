import { useEffect, useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import QrScannerModal from '../../../shared/components/QrScannerModal.jsx'
import api from '../../../shared/api/client.js'
import { EmptyState, KPI, toast, toastErr } from '../shared.jsx'
import {
  createClientEventId,
  enqueueTransportScan,
  flushTransportScanQueue,
  getTransportScanQueue,
} from '../transportScanQueue.js'

const STATUS = {
  draft: ['Taslak', 'var(--text3)'],
  published: ['Yayınlandı', 'var(--blue)'],
  boarding: ['Biniş açık', 'var(--amber)'],
  departed: ['Yolda', 'var(--accent)'],
  completed: ['Tamamlandı', 'var(--green)'],
  cancelled: ['İptal', 'var(--red)'],
}

const NEXT_ACTION = {
  draft: ['publish', 'YAYINLA'],
  published: ['boarding', 'BİNİŞİ BAŞLAT'],
  boarding: ['depart', 'KALKIŞ YAP'],
  departed: ['complete', 'TAMAMLA'],
}

const ASSIGNMENT_ACTIONS = {
  assigned: [
    ['boarded', 'BİNDİ'],
    ['no_show', 'BİNMEDİ'],
    ['cancelled', 'ÇIKAR'],
  ],
  boarded: [['assigned', 'SIFIRLA']],
  no_show: [['assigned', 'SIFIRLA']],
  waitlisted: [['assigned', 'YEDEKTEN AL'], ['cancelled', 'ÇIKAR']],
}

export default function OperationsTab({ date }) {
  const qc = useQueryClient()
  const [direction, setDirection] = useState('')
  const [status, setStatus] = useState('')
  const [routeId, setRouteId] = useState('')
  const [selectedTripId, setSelectedTripId] = useState(null)
  const [selectedAssignments, setSelectedAssignments] = useState([])
  const [qrTrip, setQrTrip] = useState(null)
  const [queueCount, setQueueCount] = useState(0)
  const [syncing, setSyncing] = useState(false)

  const params = new URLSearchParams({ date })
  if (direction) params.set('direction', direction)
  if (status) params.set('status', status)
  if (routeId) params.set('route_id', routeId)
  const { data, isLoading, isError } = useQuery({
    queryKey: ['transport-operations', date, direction, status, routeId],
    queryFn: () => api.get(`/transport/operations?${params}`).then(response => response.data),
  })
  const { data: routes = [] } = useQuery({
    queryKey: ['transport-routes'],
    queryFn: () => api.get('/transport/routes?active=1').then(response => response.data),
  })

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ['transport-operations'] })
    if (selectedTripId) qc.invalidateQueries({ queryKey: ['transport-trip', selectedTripId] })
  }
  const transition = useMutation({
    mutationFn: ({ tripId, action, body = {} }) => api.post(`/transport/trips/${tripId}/${action}`, body),
    onSuccess: response => {
      refresh()
      toast(response.data.status === 'boarding' ? 'Biniş başlatıldı' : 'Sefer güncellendi')
    },
    onError: toastErr,
  })

  const updateQueueCount = async () => setQueueCount((await getTransportScanQueue()).length)
  const syncQueue = async () => {
    if (syncing) return
    setSyncing(true)
    try {
      const result = await flushTransportScanQueue()
      setQueueCount(result.remaining)
      if (result.sent) {
        toast(`${result.sent} çevrimdışı okutma eşitlendi`)
        refresh()
      }
    } finally {
      setSyncing(false)
    }
  }

  useEffect(() => {
    updateQueueCount()
    const onQueue = () => updateQueueCount()
    const onOnline = () => syncQueue()
    window.addEventListener('yys-queue-changed', onQueue)
    window.addEventListener('online', onOnline)
    if (navigator.onLine) syncQueue()
    return () => {
      window.removeEventListener('yys-queue-changed', onQueue)
      window.removeEventListener('online', onOnline)
    }
  }, [])

  const handleScan = async rawToken => {
    const qrToken = String(rawToken || '').trim()
    if (!qrToken || !qrTrip) return
    const payload = {
      qr_token: qrToken,
      client_event_id: createClientEventId(),
      device_time: new Date().toISOString(),
    }
    try {
      if (!navigator.onLine) throw new Error('offline')
      const response = await api.post(`/transport/trips/${qrTrip.id}/scan`, payload)
      const labels = {
        boarded: `${response.data.full_name} bindi`,
        already_boarded: `${response.data.full_name} daha önce binmiş`,
        not_assigned: 'Personel bu sefere atanmamış',
        invalid_qr: 'QR geçersiz',
        rejected: 'Yedek personel henüz terfi etmedi',
      }
      toast(labels[response.data.result] || response.data.result,
        ['boarded', 'already_boarded'].includes(response.data.result) ? 'success' : 'error')
      refresh()
    } catch (error) {
      if (!error.response) {
        await enqueueTransportScan({
          tripId: qrTrip.id,
          qrToken,
          clientEventId: payload.client_event_id,
          deviceTime: payload.device_time,
        })
        await updateQueueCount()
        toast('İnternet yok · okutma güvenli kuyruğa alındı', 'warning')
      } else toastErr(error)
    }
  }

  const trips = data?.trips || []
  const totals = data?.totals || { capacity: 0, assigned: 0, waitlisted: 0, boarded: 0, no_show: 0 }

  return (
    <div className="transport-operations">
      <div className="transport-operations__filters">
        <select className="form-select" value={direction} onChange={event => setDirection(event.target.value)}
          aria-label="Sefer yönü">
          <option value="">Gidiş + dönüş</option>
          <option value="outbound">Gidiş</option>
          <option value="inbound">Dönüş</option>
        </select>
        <select className="form-select" value={status} onChange={event => setStatus(event.target.value)}
          aria-label="Sefer durumu">
          <option value="">Tüm durumlar</option>
          {Object.entries(STATUS).map(([key, value]) => <option key={key} value={key}>{value[0]}</option>)}
        </select>
        <select className="form-select" value={routeId} onChange={event => setRouteId(event.target.value)}
          aria-label="Hat">
          <option value="">Tüm hatlar</option>
          {routes.map(route => <option key={route.id} value={route.id}>{route.name}</option>)}
        </select>
        {queueCount > 0 && (
          <button className="btn btn-ghost btn-sm transport-operations__sync" onClick={syncQueue}
            disabled={syncing || !navigator.onLine}>
            {syncing ? 'EŞİTLENİYOR…' : `↻ ${queueCount} BEKLEYEN OKUTMA`}
          </button>
        )}
      </div>

      <div className="transport-operations__kpis">
        <KPI label="KAPASİTE" value={totals.capacity} color="var(--blue)" />
        <KPI label="BİNEN" value={totals.boarded} color="var(--green)" />
        <KPI label="BEKLEYEN" value={totals.assigned} color="var(--amber)" />
        <KPI label="BİNMEYEN" value={totals.no_show} color="var(--red)" />
        <KPI label="YEDEK" value={totals.waitlisted} color="var(--text3)" />
      </div>

      {data?.next_trip && (
        <button className="transport-next-trip" onClick={() => setSelectedTripId(data.next_trip.id)}>
          <span>SIRADAKİ SEFER</span>
          <strong>{data.next_trip.route_name} · {formatTime(data.next_trip.scheduled_departure)}</strong>
          <em>{data.next_trip.next_action?.label} →</em>
        </button>
      )}

      {isLoading ? (
        <div className="transport-operations__loading">Seferler yükleniyor…</div>
      ) : isError ? (
        <EmptyState icon="!" title="SEFERLER YÜKLENEMEDİ" desc="Bağlantıyı kontrol edip tekrar deneyin." />
      ) : trips.length === 0 ? (
        <EmptyState icon="🚌" title="BU TARİHTE SEFER YOK" desc="Planlama bölümünden öneri oluşturup yayınlayın." />
      ) : (
        <div className="transport-trip-grid">
          {trips.map(trip => (
            <TripCard key={trip.id} trip={trip}
              onOpen={() => { setSelectedAssignments([]); setSelectedTripId(trip.id) }}
              onScan={() => setQrTrip(trip)}
              onAction={(action, body) => transition.mutate({ tripId: trip.id, action, body })} />
          ))}
        </div>
      )}

      {selectedTripId && (
        <ManifestDrawer tripId={selectedTripId} allTrips={trips}
          selected={selectedAssignments} onSelected={setSelectedAssignments}
          onClose={() => setSelectedTripId(null)} onRefresh={refresh}
          onScan={trip => setQrTrip(trip)}
          onTransition={(action, body) => transition.mutate({ tripId: selectedTripId, action, body })} />
      )}
      <QrScannerModal open={!!qrTrip} title={`${qrTrip?.route_name || ''} · BİNİŞ QR`}
        onClose={() => setQrTrip(null)} onScan={handleScan} />
    </div>
  )
}

function TripCard({ trip, onOpen, onScan, onAction }) {
  const [statusLabel, statusColor] = STATUS[trip.status] || [trip.status, 'var(--text3)']
  const next = NEXT_ACTION[trip.status]
  const direction = trip.direction === 'outbound' ? 'GİDİŞ' : 'DÖNÜŞ'
  return (
    <article className={`transport-trip-card is-${trip.status}`}>
      <div className="transport-trip-card__stripe" style={{ background: trip.route_color || 'var(--accent)' }} />
      <header>
        <div>
          <span>{direction} · {formatTime(trip.scheduled_departure)}</span>
          <h3>{trip.route_name}</h3>
        </div>
        <span className="transport-trip-card__status" style={{ color: statusColor }}>{statusLabel}</span>
      </header>
      <div className="transport-trip-card__resources">
        <span>🚐 {trip.vehicle_plate || 'Araç yok'}</span>
        <span>👤 {trip.driver_name || 'Şoför yok'}</span>
      </div>
      <div className="transport-trip-card__counts">
        <span><strong>{trip.boarded_count || 0}</strong>Binen</span>
        <span><strong>{trip.assigned_count || 0}</strong>Bekleyen</span>
        <span><strong>{trip.no_show_count || 0}</strong>Binmeyen</span>
        <span><strong>{trip.waitlisted_count || 0}</strong>Yedek</span>
        <span><strong>{trip.capacity_snapshot}</strong>Kapasite</span>
      </div>
      <footer>
        <button className="btn btn-ghost btn-sm" onClick={onOpen}>MANİFESTO</button>
        {trip.status === 'boarding' && <button className="btn btn-ghost btn-sm" onClick={onScan}>▣ QR OKUT</button>}
        {next && <button className="btn btn-primary btn-sm" onClick={() => onAction(next[0])}>{next[1]}</button>}
      </footer>
    </article>
  )
}

function ManifestDrawer({ tripId, allTrips, selected, onSelected, onClose, onRefresh, onScan, onTransition }) {
  const qc = useQueryClient()
  const [cancelReason, setCancelReason] = useState('')
  const [resourceEdit, setResourceEdit] = useState(false)
  const [shareLink, setShareLink] = useState(null)
  const [shareBusy, setShareBusy] = useState(false)
  const { data: trip, isLoading } = useQuery({
    queryKey: ['transport-trip', tripId],
    queryFn: () => api.get(`/transport/trips/${tripId}`).then(response => response.data),
  })
  const { data: vehicles = [] } = useQuery({
    queryKey: ['transport-v2-vehicles'],
    queryFn: () => api.get('/transport/vehicles?active=1').then(response => response.data),
  })
  const { data: drivers = [] } = useQuery({
    queryKey: ['transport-v2-drivers'],
    queryFn: () => api.get('/transport/drivers?active=1').then(response => response.data),
  })
  const [resource, setResource] = useState({ vehicle_id: '', driver_id: '' })

  useEffect(() => {
    if (trip) setResource({ vehicle_id: trip.vehicle_id || '', driver_id: trip.driver_id || '' })
  }, [trip?.id])

  const assignmentMutation = useMutation({
    mutationFn: ({ id, status, reason, approve_promotion }) => api.patch(
      `/transport/trip-assignments/${id}/status`,
      { status, reason, approve_promotion },
    ),
    onSuccess: response => {
      qc.invalidateQueries({ queryKey: ['transport-trip', tripId] })
      onRefresh()
      const promotion = response.data.promotion
      if (promotion?.promoted_assignment_id) toast('İlk yedek otomatik olarak sefere alındı')
      else if (promotion?.approval_required) toast('Kalkış sonrası terfi için yönetici onayı gerekli', 'warning')
    },
    onError: toastErr,
  })

  const bulkStatus = async status => {
    try {
      for (const id of selected) {
        await api.patch(`/transport/trip-assignments/${id}/status`, { status })
      }
      onSelected([])
      qc.invalidateQueries({ queryKey: ['transport-trip', tripId] })
      onRefresh()
      toast(`${selected.length} kayıt güncellendi`)
    } catch (error) { toastErr(error) }
  }

  const saveResources = async () => {
    try {
      await api.patch(`/transport/trips/${tripId}`, {
        vehicle_id: Number(resource.vehicle_id),
        driver_id: Number(resource.driver_id),
        change_reason: 'Operasyon kaynağı değiştirildi',
      })
      setResourceEdit(false)
      qc.invalidateQueries({ queryKey: ['transport-trip', tripId] })
      onRefresh()
      toast('Araç ve şoför güncellendi')
    } catch (error) { toastErr(error) }
  }

  const moveAssignment = async (assignment, targetTripId) => {
    if (!targetTripId) return
    try {
      await api.post(`/transport/trips/${targetTripId}/assignments`, {
        staff_id: assignment.staff_id,
        stop_id: assignment.stop_id,
        reason: `${trip.route_name} seferinden taşındı`,
      })
      await api.patch(`/transport/trip-assignments/${assignment.id}/status`, {
        status: 'cancelled',
        reason: `#${targetTripId} sefere taşındı`,
      })
      qc.invalidateQueries({ queryKey: ['transport-trip', tripId] })
      onRefresh()
      toast('Personel başka sefere taşındı')
    } catch (error) { toastErr(error) }
  }

  const exportCsv = () => {
    const rows = [
      ['Ad Soyad', 'TC', 'Durak', 'Durum'],
      ...trip.assignments.map(row => [row.full_name, row.tc_no || '', row.pickup_name || '', row.status]),
    ]
    const csv = rows.map(row => row.map(cell => `"${String(cell).replaceAll('"', '""')}"`).join(',')).join('\n')
    const url = URL.createObjectURL(new Blob([`\uFEFF${csv}`], { type: 'text/csv;charset=utf-8' }))
    const link = document.createElement('a')
    link.href = url
    link.download = `servis-${trip.work_date}-${trip.route_name}.csv`
    link.click()
    URL.revokeObjectURL(url)
  }

  const shareWhatsApp = () => {
    const lines = [
      `${trip.route_name} · ${trip.direction === 'outbound' ? 'Gidiş' : 'Dönüş'}`,
      `${trip.work_date} ${formatTime(trip.scheduled_departure)}`,
      `Araç: ${trip.vehicle_plate || '—'} · Şoför: ${trip.driver_name || '—'}`,
      `Yolcu: ${trip.assignments.filter(row => !['cancelled', 'waitlisted'].includes(row.status)).length}/${trip.capacity_snapshot}`,
    ]
    window.open(`https://wa.me/?text=${encodeURIComponent(lines.join('\n'))}`, '_blank', 'noopener,noreferrer')
  }

  const createDriverLink = async () => {
    setShareBusy(true)
    try {
      const response = await api.post(`/transport/trips/${tripId}/share-link`, { expires_in_hours: 24 })
      setShareLink(response.data)
      toast('24 saatlik şoför bağlantısı hazır')
    } catch (error) {
      toastErr(error)
    } finally {
      setShareBusy(false)
    }
  }

  const revokeDriverLink = async () => {
    if (!shareLink) return
    try {
      await api.delete(`/transport/trips/${tripId}/share-link/${shareLink.id}`)
      setShareLink(null)
      toast('Şoför bağlantısı iptal edildi')
    } catch (error) { toastErr(error) }
  }

  return (
    <div className="transport-manifest" role="presentation" onMouseDown={onClose}>
      <aside role="dialog" aria-modal="true" aria-label="Sefer manifestosu"
        onMouseDown={event => event.stopPropagation()}>
        {isLoading || !trip ? <div className="transport-operations__loading">Manifesto yükleniyor…</div> : (
          <>
            <header className="transport-manifest__header">
              <div>
                <span>{trip.direction === 'outbound' ? 'GİDİŞ' : 'DÖNÜŞ'} · {trip.work_date} · {formatTime(trip.scheduled_departure)}</span>
                <h2>{trip.route_name}</h2>
              </div>
              <button onClick={onClose} aria-label="Manifestoyu kapat">×</button>
            </header>

            <div className="transport-manifest__tools">
              <button onClick={exportCsv}>CSV</button>
              <button onClick={() => window.print()}>PDF / YAZDIR</button>
              <button onClick={shareWhatsApp}>WHATSAPP</button>
              {['published', 'boarding', 'departed'].includes(trip.status) && (
                <button disabled={shareBusy} onClick={createDriverLink}>ŞOFÖR LİNKİ</button>
              )}
              {trip.status === 'boarding' && <button onClick={() => onScan(trip)}>▣ QR OKUT</button>}
            </div>

            {shareLink && (
              <section className="transport-share-card">
                <img src={shareLink.qr_data_url} alt="Şoför bağlantısı QR kodu" />
                <div>
                  <strong>Şoför erişimi hazır</strong>
                  <small>{new Date(shareLink.expires_at).toLocaleString('tr-TR')} tarihine kadar geçerli</small>
                  <div className="transport-share-card__actions">
                    <button onClick={() => navigator.clipboard.writeText(shareLink.url).then(() => toast('Bağlantı kopyalandı'))}>
                      KOPYALA
                    </button>
                    <button onClick={() => window.open(`https://wa.me/?text=${encodeURIComponent(shareLink.url)}`, '_blank', 'noopener,noreferrer')}>
                      WHATSAPP
                    </button>
                    <button onClick={revokeDriverLink}>İPTAL ET</button>
                  </div>
                </div>
              </section>
            )}

            <section className="transport-manifest__resources">
              {resourceEdit ? (
                <>
                  <select value={resource.vehicle_id} onChange={event => setResource({ ...resource, vehicle_id: event.target.value })}>
                    <option value="">Araç seçin</option>
                    {vehicles.filter(row => row.status === 'active').map(row => <option key={row.id} value={row.id}>{row.plate}</option>)}
                  </select>
                  <select value={resource.driver_id} onChange={event => setResource({ ...resource, driver_id: event.target.value })}>
                    <option value="">Şoför seçin</option>
                    {drivers.filter(row => row.status === 'active').map(row => <option key={row.id} value={row.id}>{row.full_name}</option>)}
                  </select>
                  <button className="btn btn-primary btn-sm" onClick={saveResources}>KAYDET</button>
                </>
              ) : (
                <>
                  <span>🚐 {trip.vehicle_plate || 'Araç yok'}</span>
                  <span>👤 {trip.driver_name || 'Şoför yok'}</span>
                  {!['completed', 'cancelled'].includes(trip.status) && (
                    <button className="btn btn-ghost btn-xs" onClick={() => setResourceEdit(true)}>DEĞİŞTİR</button>
                  )}
                </>
              )}
            </section>

            {selected.length > 0 && (
              <div className="transport-manifest__bulk">
                <strong>{selected.length} kişi seçildi</strong>
                <button onClick={() => bulkStatus('boarded')}>BİNDİ</button>
                <button onClick={() => bulkStatus('no_show')}>BİNMEDİ</button>
                <button onClick={() => bulkStatus('assigned')}>SIFIRLA</button>
              </div>
            )}

            <div className="transport-manifest__list">
              {trip.assignments.map(assignment => (
                <ManifestRow key={assignment.id} assignment={assignment} trip={trip}
                  selected={selected.includes(assignment.id)}
                  onSelect={checked => onSelected(checked
                    ? [...selected, assignment.id]
                    : selected.filter(id => id !== assignment.id))}
                  onStatus={(nextStatus, reason) => assignmentMutation.mutate({
                    id: assignment.id, status: nextStatus, reason,
                  })}
                  targets={allTrips.filter(candidate => candidate.id !== trip.id
                    && candidate.status !== 'cancelled'
                    && candidate.work_date === trip.work_date)}
                  onMove={targetId => moveAssignment(assignment, targetId)} />
              ))}
            </div>

            {!['completed', 'cancelled'].includes(trip.status) && (
              <div className="transport-manifest__cancel">
                <input value={cancelReason} onChange={event => setCancelReason(event.target.value)}
                  placeholder="İptal gerekçesi" />
                <button disabled={!cancelReason.trim()} onClick={() => onTransition('cancel', { reason: cancelReason })}>
                  SEFERİ İPTAL ET
                </button>
              </div>
            )}

            <div className="transport-manifest__mobile-actions">
              {trip.status === 'boarding' && <button onClick={() => onScan(trip)}>▣ QR OKUT</button>}
              {NEXT_ACTION[trip.status] && (
                <button className="is-primary" onClick={() => onTransition(NEXT_ACTION[trip.status][0])}>
                  {NEXT_ACTION[trip.status][1]}
                </button>
              )}
            </div>
          </>
        )}
      </aside>
    </div>
  )
}

function ManifestRow({ assignment, trip, selected, onSelect, onStatus, targets, onMove }) {
  const [target, setTarget] = useState('')
  const actions = ASSIGNMENT_ACTIONS[assignment.status] || []
  return (
    <div className={`transport-manifest-row is-${assignment.status}`}>
      <label>
        <input type="checkbox" checked={selected} onChange={event => onSelect(event.target.checked)} />
        <span>
          <strong>{assignment.full_name}</strong>
          <small>{assignment.pickup_name || 'Durak yok'} {assignment.stop_time ? `· ${assignment.stop_time}` : ''}</small>
        </span>
      </label>
      <span className="transport-manifest-row__state">{assignment.status.replace('_', ' ')}</span>
      <div className="transport-manifest-row__actions">
        {actions.map(([nextStatus, label]) => (
          <button key={nextStatus} onClick={() => onStatus(nextStatus, label)}>{label}</button>
        ))}
        {assignment.phone && (
          <button onClick={() => {
            const phone = String(assignment.phone).replace(/\D/g, '').replace(/^0/, '90')
            const text = `${assignment.full_name}, ${trip.route_name} servisiniz ${trip.work_date} ${formatTime(trip.scheduled_departure)} saatinde. Durak: ${assignment.pickup_name || 'belirtilmedi'}.`
            window.open(`https://wa.me/${phone}?text=${encodeURIComponent(text)}`, '_blank', 'noopener,noreferrer')
          }}>MESAJ</button>
        )}
        {!['completed', 'cancelled'].includes(trip.status) && targets.length > 0 && (
          <span className="transport-manifest-row__move">
            <select value={target} onChange={event => setTarget(event.target.value)} aria-label={`${assignment.full_name} başka sefere taşı`}>
              <option value="">Başka sefere taşı…</option>
              {targets.map(item => <option key={item.id} value={item.id}>{formatTime(item.scheduled_departure)} · {item.route_name}</option>)}
            </select>
            <button disabled={!target} onClick={() => { onMove(Number(target)); setTarget('') }}>TAŞI</button>
          </span>
        )}
      </div>
    </div>
  )
}

function formatTime(value) {
  if (!value) return '—'
  return value.slice(11, 16)
}
