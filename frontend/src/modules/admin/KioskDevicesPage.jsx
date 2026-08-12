import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import api from '../../shared/api/client.js'
import { useAuthStore } from '../../shared/store/authStore.js'
import { confirmDialog } from '../../shared/components/ConfirmDialog.jsx'
import { SkeletonGrid } from '../../shared/components/Skeleton.jsx'

const DEVICE_TYPES = [
  ['laundry_terminal', 'Çamaşır terminali'],
  ['avs_shared', 'AVS ortak'],
  ['avs_personal', 'AVS kişisel'],
  ['resident_shared', 'Personel/sakin ortak'],
  ['scan_station', 'Okutma istasyonu'],
  ['display_general', 'Genel bilgi ekranı'],
  ['display_kitchen', 'Mutfak ekranı'],
]

const MODE_BY_TYPE = {
  laundry_terminal: 'shared', avs_shared: 'shared', avs_personal: 'personal',
  resident_shared: 'shared', scan_station: 'unattended', display_general: 'display', display_kitchen: 'display',
}

const typeLabel = type => DEVICE_TYPES.find(item => item[0] === type)?.[1] || type

function localDate(value) {
  if (!value) return 'Henüz bağlantı yok'
  const normalized = value.includes('T') ? value : `${value.replace(' ', 'T')}Z`
  return new Date(normalized).toLocaleString('tr-TR')
}

function Kpi({ label, value, detail, color = 'var(--accent)' }) {
  return (
    <div style={{ padding: 16, border: '1px solid var(--border)', borderRadius: 10, background: 'var(--surface2)' }}>
      <div style={{ fontFamily: 'var(--display)', fontSize: 28, color }}>{value}</div>
      <div style={{ fontFamily: 'var(--mono)', fontSize: 9, letterSpacing: 1.5, color: 'var(--text3)' }}>{label}</div>
      {detail && <div style={{ marginTop: 5, fontSize: 11, color: 'var(--text3)' }}>{detail}</div>}
    </div>
  )
}

export default function KioskDevicesPage() {
  const queryClient = useQueryClient()
  const isManager = useAuthStore(state => state.user?.role === 'campus_manager')
  const [search, setSearch] = useState('')
  const [status, setStatus] = useState('all')
  const [showEnrollment, setShowEnrollment] = useState(false)
  const [issuedCode, setIssuedCode] = useState(null)
  const [form, setForm] = useState({
    name: '', device_type: 'laundry_terminal', mode: 'shared', location: '', expires_minutes: 30,
  })

  const overviewQuery = useQuery({
    queryKey: ['kiosk-management-overview'],
    queryFn: () => api.get('/kiosk-management/overview').then(response => response.data),
    refetchInterval: 30_000,
  })
  const devicesQuery = useQuery({
    queryKey: ['kiosk-management-devices'],
    queryFn: () => api.get('/kiosk-management/devices').then(response => response.data),
    refetchInterval: 30_000,
  })

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ['kiosk-management-overview'] })
    queryClient.invalidateQueries({ queryKey: ['kiosk-management-devices'] })
  }

  const issueMutation = useMutation({
    mutationFn: body => api.post('/kiosk-management/enrollment-codes', body).then(response => response.data),
    onSuccess: data => { setIssuedCode(data); refresh() },
  })
  const patchMutation = useMutation({
    mutationFn: ({ id, body }) => api.patch(`/kiosk-management/devices/${id}`, body),
    onSuccess: refresh,
  })
  const commandMutation = useMutation({
    mutationFn: ({ id, command_type }) => api.post(`/kiosk-management/devices/${id}/commands`, { command_type, payload: {} }),
    onSuccess: refresh,
  })
  const revokeMutation = useMutation({
    mutationFn: id => api.post(`/kiosk-management/devices/${id}/revoke`),
    onSuccess: refresh,
  })

  const devices = useMemo(() => (devicesQuery.data || []).filter(device => {
    const term = search.toLocaleLowerCase('tr-TR')
    const searchable = `${device.name} ${device.location || ''} ${typeLabel(device.device_type)}`.toLocaleLowerCase('tr-TR')
    const matchesSearch = !term || searchable.includes(term)
    const matchesStatus = status === 'all'
      || (status === 'online' ? device.online : status === 'offline' ? !device.online : device.status === status)
    return matchesSearch && matchesStatus
  }), [devicesQuery.data, search, status])

  const overview = overviewQuery.data
  if (overviewQuery.isLoading || devicesQuery.isLoading) return <div style={{ padding: 24 }}><SkeletonGrid count={6} /></div>
  if (overviewQuery.error || devicesQuery.error) {
    return <div style={{ padding: 24, color: 'var(--red)' }}>Kiosk cihaz bilgileri yüklenemedi. <button className="btn btn-sm" onClick={refresh}>Tekrar dene</button></div>
  }

  const staff = overview?.pin_coverage?.staff || { configured: 0, total: 0 }
  const personnel = overview?.pin_coverage?.personnel || { configured: 0, total: 0 }
  const queue = overview?.queues || {}

  async function revoke(id) {
    if (await confirmDialog('Bu cihazın erişimi kalıcı olarak iptal edilsin mi?')) revokeMutation.mutate(id)
  }

  return (
    <div style={{ padding: 24 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, alignItems: 'flex-start', flexWrap: 'wrap', marginBottom: 20 }}>
        <div>
          <h2 style={{ fontSize: 28, letterSpacing: 3 }}>KİOSK CİHAZ MERKEZİ</h2>
          <p style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--text3)', letterSpacing: 1, marginTop: 4 }}>KAYIT · SAĞLIK · KUYRUK · UZAKTAN KONTROL</p>
        </div>
        {isManager && <button className="btn btn-primary" aria-label="Yeni cihaz kaydı" onClick={() => { setShowEnrollment(true); setIssuedCode(null) }}>＋ YENİ CİHAZ</button>}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(150px,1fr))', gap: 10, marginBottom: 18 }}>
        <Kpi label="KAYITLI" value={overview.devices.registered || 0} detail={`${overview.devices.pending_enrollment || 0} bekleyen kayıt`} />
        <Kpi label="ÇEVRİMİÇİ" value={overview.devices.online || 0} color="#16a34a" />
        <Kpi label="ÇEVRİMDIŞI" value={overview.devices.offline || 0} color={overview.devices.offline ? '#dc2626' : 'var(--text3)'} />
        <Kpi label="PERSONEL PIN" value={`${staff.configured || 0} / ${staff.total || 0}`} />
        <Kpi label="SAKİN PIN" value={`${personnel.configured || 0} / ${personnel.total || 0}`} />
        <Kpi label="OFFLINE KUYRUK" value={queue.pending || 0} detail={`${queue.pending || 0} işlem · ${queue.errors || 0} hata`} color={queue.errors ? '#dc2626' : '#f59e0b'} />
      </div>

      {showEnrollment && isManager && (
        <section aria-label="Yeni cihaz kayıt formu" style={{ padding: 18, border: '1px solid var(--accent)', borderRadius: 10, background: 'rgba(240,165,0,.06)', marginBottom: 18 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 12 }}>
            <strong>Tek kullanımlık cihaz kayıt kodu</strong>
            <button className="btn btn-xs" onClick={() => setShowEnrollment(false)}>Kapat</button>
          </div>
          {!issuedCode ? (
            <form onSubmit={event => { event.preventDefault(); issueMutation.mutate({ ...form, location: form.location || null }) }}>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(180px,1fr))', gap: 10 }}>
                <label style={{ fontSize: 11 }}>Cihaz adı<input aria-label="Cihaz adı" required className="form-input" value={form.name} onChange={event => setForm(current => ({ ...current, name: event.target.value }))} /></label>
                <label style={{ fontSize: 11 }}>Cihaz türü<select className="form-select" value={form.device_type} onChange={event => setForm(current => ({ ...current, device_type: event.target.value, mode: MODE_BY_TYPE[event.target.value] }))}>{DEVICE_TYPES.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
                <label style={{ fontSize: 11 }}>Konum<input className="form-input" value={form.location} onChange={event => setForm(current => ({ ...current, location: event.target.value }))} /></label>
                <label style={{ fontSize: 11 }}>Kod süresi<select className="form-select" value={form.expires_minutes} onChange={event => setForm(current => ({ ...current, expires_minutes: Number(event.target.value) }))}><option value={30}>30 dakika</option><option value={60}>1 saat</option><option value={240}>4 saat</option></select></label>
              </div>
              {issueMutation.error && <div style={{ color: 'var(--red)', marginTop: 10 }}>{issueMutation.error.response?.data?.error || 'Kod üretilemedi'}</div>}
              <button type="submit" className="btn btn-primary" aria-label="Kayıt kodu üret" disabled={issueMutation.isPending} style={{ marginTop: 12 }}>KAYIT KODU ÜRET</button>
            </form>
          ) : (
            <div>
              <div style={{ fontFamily: 'var(--mono)', fontSize: 22, letterSpacing: 2, padding: 12, background: 'var(--surface2)', borderRadius: 8, display: 'inline-block', userSelect: 'all' }}>{issuedCode.code}</div>
              <p style={{ marginTop: 9, fontSize: 12, color: 'var(--text2)' }}>Bu kod yalnız bir kez kullanılabilir. Cihazda <strong>{window.location.origin}/kiosk-enroll</strong> adresini açın.</p>
              <p style={{ fontSize: 11, color: 'var(--text3)' }}>Son kullanım: {localDate(issuedCode.expires_at)}</p>
            </div>
          )}
        </section>
      )}

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
        <input className="form-input" aria-label="Cihaz ara" placeholder="Cihaz veya konum ara" value={search} onChange={event => setSearch(event.target.value)} style={{ maxWidth: 300 }} />
        <select className="form-select" aria-label="Durum filtresi" value={status} onChange={event => setStatus(event.target.value)} style={{ maxWidth: 180 }}>
          <option value="all">Tüm durumlar</option><option value="online">Çevrimiçi</option><option value="offline">Çevrimdışı</option><option value="locked">Kilitli</option><option value="maintenance">Bakımda</option><option value="revoked">İptal</option>
        </select>
      </div>

      <div style={{ display: 'grid', gap: 10 }}>
        {devices.length === 0 ? <div className="panel" style={{ padding: 24, color: 'var(--text3)' }}>Filtreye uygun cihaz yok.</div> : devices.map(device => (
          <article key={device.id} style={{ padding: 16, border: '1px solid var(--border)', borderRadius: 10, background: 'var(--surface2)', opacity: device.status === 'revoked' ? .6 : 1 }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 14, flexWrap: 'wrap' }}>
              <div style={{ flex: '1 1 260px' }}>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                  <strong style={{ fontSize: 15 }}>{device.name}</strong>
                  <span style={{ fontFamily: 'var(--mono)', fontSize: 9, color: device.online ? '#16a34a' : '#dc2626' }}>{device.online ? '● ÇEVRİMİÇİ' : '○ ÇEVRİMDIŞI'}</span>
                  {device.status !== 'active' && <span style={{ fontFamily: 'var(--mono)', fontSize: 9, color: '#f59e0b' }}>{device.status.toLocaleUpperCase('tr-TR')}</span>}
                </div>
                <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 5 }}>{typeLabel(device.device_type)} · {device.mode} {device.location ? `· ${device.location}` : ''}</div>
                <div style={{ fontSize: 10, color: 'var(--text4)', marginTop: 4 }}>Son bağlantı: {localDate(device.last_seen_at)} · Sürüm: {device.app_version || 'bilinmiyor'}</div>
              </div>
              <div style={{ minWidth: 155, fontFamily: 'var(--mono)', fontSize: 11 }}>
                <div>Kuyruk: <strong>{device.queue_count || 0}</strong></div>
                <div style={{ color: device.error_count ? '#dc2626' : 'var(--text3)' }}>Hata: <strong>{device.error_count || 0}</strong></div>
                <div>Kullanıcı: {device.last_principal_name || '—'}</div>
              </div>
              {isManager && device.status !== 'revoked' && (
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                  {device.status === 'locked' ? <button className="btn btn-xs" onClick={() => patchMutation.mutate({ id: device.id, body: { status: 'active' } })}>Kilidi aç</button> : <button className="btn btn-xs" aria-label="Cihazı kilitle" onClick={() => commandMutation.mutate({ id: device.id, command_type: 'lock' })}>Kilitle</button>}
                  <button className="btn btn-xs" onClick={() => commandMutation.mutate({ id: device.id, command_type: 'config_refresh' })}>Ayar yenile</button>
                  <button className="btn btn-xs" onClick={() => commandMutation.mutate({ id: device.id, command_type: 'app_reload' })}>Uygulamayı yenile</button>
                  <button className="btn btn-xs" onClick={() => patchMutation.mutate({ id: device.id, body: { status: device.status === 'maintenance' ? 'active' : 'maintenance' } })}>{device.status === 'maintenance' ? 'Bakımı bitir' : 'Bakıma al'}</button>
                  <button className="btn btn-xs" style={{ color: '#dc2626' }} onClick={() => revoke(device.id)}>İptal et</button>
                </div>
              )}
            </div>
          </article>
        ))}
      </div>
    </div>
  )
}
