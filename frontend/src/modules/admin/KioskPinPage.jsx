import { useEffect, useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import api from '../../shared/api/client.js'
import { confirmDialog } from '../../shared/components/ConfirmDialog.jsx'
import { useDebounce } from '../../shared/hooks/useDebounce.js'

const STATUS = {
  missing: ['PIN yok', 'muted'], issued: ['Teslim bekliyor', 'warning'], delivered: ['Geçici PIN teslim', 'info'],
  change_required: ['İlk değişim bekliyor', 'warning'], expired: ['Süresi doldu', 'danger'],
  revoked: ['İptal', 'danger'], permanent: ['Kalıcı PIN', 'success'],
}

const SETTINGS = [
  ['kiosk_initial_pin_hours', 'Geçici PIN süresi', 'saat'],
  ['kiosk_shared_idle_minutes', 'Ortak AVS / sakin hareketsizlik', 'dakika'],
  ['kiosk_shared_absolute_hours', 'Ortak cihaz azami oturum', 'saat'],
  ['kiosk_laundry_idle_minutes', 'Çamaşır hareketsizlik', 'dakika'],
  ['kiosk_laundry_absolute_hours', 'Çamaşır azami vardiya oturumu', 'saat'],
  ['kiosk_personal_session_days', 'Kişisel cihaz oturumu', 'gün'],
  ['kiosk_personal_reauth_hours', 'Kişisel cihaz hassas işlem doğrulaması', 'saat'],
]

function dateTime(value) {
  return value ? new Date(value.includes('T') ? value : `${value.replace(' ', 'T')}Z`).toLocaleString('tr-TR') : '—'
}

export default function KioskPinPage() {
  const queryClient = useQueryClient()
  const [tab, setTab] = useState('pins')
  const [search, setSearch] = useState('')
  const [kind, setKind] = useState('all')
  const [status, setStatus] = useState('all')
  const [selected, setSelected] = useState(new Set())
  const [issued, setIssued] = useState([])
  const [message, setMessage] = useState(null)
  const [settingsDraft, setSettingsDraft] = useState({})
  const q = useDebounce(search, 250)

  const pinsQuery = useQuery({
    queryKey: ['kiosk-pins-v2', q, kind, status],
    queryFn: () => api.get('/kiosk-management/pins', { params: { q, kind, status, limit: 500 } }).then(response => response.data),
    enabled: tab === 'pins',
  })
  const sessionsQuery = useQuery({
    queryKey: ['kiosk-sessions'],
    queryFn: () => api.get('/kiosk-management/sessions').then(response => response.data),
    enabled: tab === 'sessions',
    refetchInterval: tab === 'sessions' ? 30_000 : false,
  })
  const settingsQuery = useQuery({
    queryKey: ['kiosk-session-settings'],
    queryFn: () => api.get('/kiosk-management/session-settings').then(response => response.data),
    enabled: tab === 'settings',
  })
  useEffect(() => { if (settingsQuery.data) setSettingsDraft(settingsQuery.data) }, [settingsQuery.data])

  const items = pinsQuery.data || []
  const selectedPrincipals = useMemo(() => items
    .filter(item => selected.has(`${item.principal_kind}:${item.principal_id}`))
    .map(item => ({ kind: item.principal_kind, id: item.principal_id })), [items, selected])

  const issueMutation = useMutation({
    mutationFn: principals => api.post('/kiosk-management/pins/issue', { principals }).then(response => response.data),
    onSuccess: data => {
      setIssued(data.items)
      setSelected(new Set())
      setMessage({ type: 'ok', text: `${data.count} geçici PIN üretildi. Kodlar bu pencere kapandıktan sonra tekrar gösterilemez.` })
      queryClient.invalidateQueries({ queryKey: ['kiosk-pins-v2'] })
    },
    onError: error => setMessage({ type: 'err', text: error.response?.data?.error || 'PIN üretilemedi.' }),
  })
  const revokeMutation = useMutation({
    mutationFn: id => api.post(`/kiosk-management/pins/${id}/revoke`, { reason: 'manager_revoked' }),
    onSuccess: () => { setMessage({ type: 'ok', text: 'PIN ve açık kiosk oturumları iptal edildi.' }); queryClient.invalidateQueries({ queryKey: ['kiosk-pins-v2'] }) },
  })
  const sessionRevokeMutation = useMutation({
    mutationFn: jti => api.post(`/kiosk-management/sessions/${encodeURIComponent(jti)}/revoke`),
    onSuccess: () => sessionsQuery.refetch(),
  })
  const principalLogoutMutation = useMutation({
    mutationFn: item => api.post(`/kiosk-management/principals/${item.principal_kind}/${item.principal_id}/logout`),
    onSuccess: () => setMessage({ type: 'ok', text: 'Kullanıcının bütün açık kiosk oturumları kapatıldı.' }),
  })
  const settingsMutation = useMutation({
    mutationFn: values => api.patch('/kiosk-management/session-settings', values).then(response => response.data),
    onSuccess: data => { setSettingsDraft(data); setMessage({ type: 'ok', text: 'Oturum politikaları güncellendi.' }) },
  })

  const toggle = key => setSelected(previous => {
    const next = new Set(previous)
    if (next.has(key)) next.delete(key); else next.add(key)
    return next
  })
  const selectVisible = () => setSelected(previous => {
    const next = new Set(previous)
    const keys = items.map(item => `${item.principal_kind}:${item.principal_id}`)
    const allSelected = keys.length > 0 && keys.every(key => next.has(key))
    keys.forEach(key => allSelected ? next.delete(key) : next.add(key))
    return next
  })

  const printIssued = async () => {
    try {
      await Promise.all(issued.map(item => api.post(`/kiosk-management/pins/${item.issuance_id}/deliver`, {
        delivered_to: item.full_name,
        delivery_method: 'printed',
      })))
      queryClient.invalidateQueries({ queryKey: ['kiosk-pins-v2'] })
      window.print()
    } catch (error) {
      setMessage({ type: 'err', text: error.response?.data?.error || 'Teslim kaydı oluşturulamadı.' })
    }
  }

  return (
    <div className="kiosk-pin-center">
      <style>{PRINT_CSS}</style>
      <div className="no-print fade-up" style={{ marginBottom: 20 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, alignItems: 'end', flexWrap: 'wrap' }}>
          <div>
            <div style={{ font: '700 10px var(--mono)', letterSpacing: 2, color: 'var(--accent)' }}>KİMLİK VE OTURUM GÜVENLİĞİ</div>
            <h2 style={{ fontSize: 28, margin: '5px 0 0' }}>Kiosk erişim merkezi</h2>
            <p style={{ color: 'var(--text3)', margin: '7px 0 0', fontSize: 13 }}>Geçici PIN teslimi, ilk giriş durumu ve açık cihaz oturumları tek yerde.</p>
          </div>
          <div className="view-toggle">
            {[['pins', 'PIN dağıtımı'], ['sessions', 'Açık oturumlar'], ['settings', 'Süre politikaları']].map(([value, label]) => (
              <button key={value} className={tab === value ? 'active' : ''} onClick={() => { setTab(value); setMessage(null) }}>{label}</button>
            ))}
          </div>
        </div>
      </div>

      {message && <div className={`no-print alert ${message.type === 'ok' ? 'alert-success' : 'alert-danger'}`} style={{ marginBottom: 12 }}>{message.text}</div>}

      {tab === 'pins' && <div className="no-print">
        <div className="panel" style={{ marginBottom: 14 }}>
          <div className="panel-body" style={{ display: 'grid', gridTemplateColumns: 'minmax(220px,1fr) 170px 190px auto', gap: 10 }}>
            <input className="form-input" placeholder="Personel ara…" value={search} onChange={event => setSearch(event.target.value)} />
            <select className="form-input" value={kind} onChange={event => { setKind(event.target.value); setSelected(new Set()) }}>
              <option value="all">Tüm kullanıcılar</option><option value="staff">AVS personeli</option><option value="personnel">Sakin / personel</option>
            </select>
            <select className="form-input" value={status} onChange={event => { setStatus(event.target.value); setSelected(new Set()) }}>
              <option value="all">Tüm PIN durumları</option>
              {Object.entries(STATUS).map(([value, [label]]) => <option key={value} value={value}>{label}</option>)}
            </select>
            <button className="btn btn-primary" disabled={!selectedPrincipals.length || issueMutation.isPending} onClick={() => issueMutation.mutate(selectedPrincipals)}>
              {issueMutation.isPending ? 'Üretiliyor…' : `${selectedPrincipals.length || ''} Geçici PIN üret`}
            </button>
          </div>
        </div>

        <div className="panel">
          <div className="panel-header">
            <div className="panel-title">KULLANICILAR · {items.length}</div>
            <button className="btn btn-ghost btn-xs" onClick={selectVisible}>Görünenleri seç / bırak</button>
          </div>
          <div style={{ overflowX: 'auto' }}>
            <table className="data-table">
              <thead><tr><th style={{ width: 42 }} /><th>Personel</th><th>Grup</th><th>Durum</th><th>Üretim / bitiş</th><th>Teslim</th><th /></tr></thead>
              <tbody>
                {items.map(item => {
                  const key = `${item.principal_kind}:${item.principal_id}`
                  const badge = STATUS[item.pin_status] || STATUS.missing
                  return <tr key={key}>
                    <td><input type="checkbox" checked={selected.has(key)} onChange={() => toggle(key)} aria-label={`${item.full_name} seç`} /></td>
                    <td><strong>{item.full_name}</strong><small style={small}>{item.principal_kind === 'staff' ? 'AVS personeli' : 'Sakin / personel'}</small></td>
                    <td>{item.group_name || '—'}</td>
                    <td><span className={`status-pill ${badge[1]}`}>{badge[0]}</span></td>
                    <td><span>{dateTime(item.issued_at)}</span><small style={small}>{item.expires_at ? `Bitiş: ${dateTime(item.expires_at)}` : 'Kalıcı / eski kayıt'}</small></td>
                    <td>{item.delivered_at ? <><span>{dateTime(item.delivered_at)}</span><small style={small}>{item.delivered_to || item.delivery_method}</small></> : '—'}</td>
                    <td style={{ textAlign: 'right' }}>
                      <button className="btn btn-ghost btn-xs" onClick={() => issueMutation.mutate([{ kind: item.principal_kind, id: item.principal_id }])}>Yenile</button>{' '}
                      <button className="btn btn-ghost btn-xs" onClick={() => principalLogoutMutation.mutate(item)}>Oturumları kapat</button>{' '}
                      {item.issuance_id && !['revoked', 'permanent'].includes(item.pin_status) && <button className="btn btn-danger btn-xs" onClick={async () => {
                        if (await confirmDialog({ title: 'PIN’i iptal et', body: `${item.full_name} için PIN ve açık kiosk oturumları kapatılsın mı?`, danger: true })) revokeMutation.mutate(item.issuance_id)
                      }}>İptal</button>}
                    </td>
                  </tr>
                })}
                {!pinsQuery.isLoading && !items.length && <tr><td colSpan={7} style={{ textAlign: 'center', padding: 32, color: 'var(--text3)' }}>Filtreye uygun kullanıcı yok.</td></tr>}
              </tbody>
            </table>
          </div>
        </div>
      </div>}

      {tab === 'sessions' && <div className="panel no-print">
        <div className="panel-header"><div className="panel-title">AÇIK KİOSK OTURUMLARI · {sessionsQuery.data?.length || 0}</div><button className="btn btn-ghost btn-xs" onClick={() => sessionsQuery.refetch()}>Yenile</button></div>
        <div style={{ overflowX: 'auto' }}><table className="data-table"><thead><tr><th>Kullanıcı</th><th>Cihaz</th><th>Mod</th><th>Son hareket</th><th>Durum</th><th /></tr></thead><tbody>
          {(sessionsQuery.data || []).map(item => <tr key={item.jti}>
            <td><strong>{item.full_name}</strong><small style={small}>{item.principal_kind}</small></td>
            <td>{item.device_name || 'Kayıtsız / eski cihaz'}</td><td>{item.session_mode || '—'}</td><td>{dateTime(item.last_seen_at || item.created_at)}</td>
            <td><span className={`status-pill ${item.pin_change_required ? 'warning' : item.locked_at ? 'danger' : 'success'}`}>{item.pin_change_required ? 'PIN değişimi' : item.locked_at ? 'Kilitli' : 'Açık'}</span></td>
            <td style={{ textAlign: 'right' }}><button className="btn btn-danger btn-xs" onClick={() => sessionRevokeMutation.mutate(item.jti)}>Çıkış yaptır</button></td>
          </tr>)}
        </tbody></table></div>
      </div>}

      {tab === 'settings' && <div className="panel no-print" style={{ maxWidth: 860 }}>
        <div className="panel-header"><div className="panel-title">OTURUM POLİTİKALARI</div></div>
        <div className="panel-body">
          <p style={{ color: 'var(--text3)', fontSize: 13, marginTop: 0 }}>Yeni girişlerde uygulanır. Hareketsizlik kilidi cihaz kaydını silmez; yalnız personel tekrar PIN doğrular.</p>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(240px,1fr))', gap: 12 }}>
            {SETTINGS.map(([key, label, unit]) => <label key={key} style={{ border: '1px solid var(--border)', borderRadius: 10, padding: 12 }}>
              <span style={{ display: 'block', fontSize: 12, marginBottom: 7 }}>{label}</span>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}><input className="form-input" type="number" min="1" value={settingsDraft[key] ?? ''} onChange={event => setSettingsDraft(previous => ({ ...previous, [key]: Number(event.target.value) }))} /><small style={{ color: 'var(--text3)' }}>{unit}</small></div>
            </label>)}
          </div>
          <button className="btn btn-primary" style={{ marginTop: 16 }} disabled={settingsMutation.isPending} onClick={() => settingsMutation.mutate(settingsDraft)}>Politikaları kaydet</button>
        </div>
      </div>}

      {issued.length > 0 && <div className="pin-reveal no-print" role="dialog" aria-modal="true" aria-label="Üretilen geçici PIN'ler">
        <div className="pin-reveal-card">
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}><div><div style={{ font: '700 10px var(--mono)', color: 'var(--warning)', letterSpacing: 2 }}>YALNIZ BU KEZ GÖRÜNTÜLENİR</div><h3 style={{ margin: '5px 0' }}>Teslim fişleri hazır</h3></div><button className="btn btn-ghost" onClick={() => setIssued([])}>Kapat</button></div>
          <p style={{ color: 'var(--text3)', fontSize: 13 }}>Her PIN 6 haneli, 24 saatlik ve ilk girişte 4 haneli kalıcı PIN ile değiştirilmesi zorunludur.</p>
          <div className="pin-grid">{issued.map(item => <div key={item.issuance_id} className="pin-ticket-mini"><strong>{item.full_name}</strong><code>{item.pin}</code><small>{dateTime(item.expires_at)} tarihine kadar</small></div>)}</div>
          <button className="btn btn-primary" onClick={printIssued}>Yazdır ve teslim kaydını oluştur</button>
        </div>
      </div>}

      {issued.length > 0 && <section className="pin-print-sheet">
        <header><h1>Kiosk geçici PIN teslim fişleri</h1><p>Oluşturma: {new Date().toLocaleString('tr-TR')}</p></header>
        {issued.map(item => <article key={item.issuance_id}>
          <div><b>{item.full_name}</b><span>{item.principal_kind === 'staff' ? 'AVS personeli' : 'Sakin / personel'}</span></div>
          <div className="printed-pin">{item.pin}</div>
          <p>Bu kod tek kullanımlıdır ve {dateTime(item.expires_at)} tarihine kadar geçerlidir. İlk girişte yalnız sizin bileceğiniz 4 haneli kalıcı PIN’i belirleyin.</p>
          <footer><span>Teslim eden: ____________________</span><span>Teslim alan imza: ____________________</span><span>Tarih: ____________________</span></footer>
        </article>)}
      </section>}
    </div>
  )
}

const small = { display: 'block', color: 'var(--text3)', fontSize: 10, marginTop: 3 }
const PRINT_CSS = `
.pin-print-sheet{display:none}.pin-reveal{position:fixed;inset:0;z-index:9999;background:rgba(2,6,14,.9);display:grid;place-items:center;padding:18px}.pin-reveal-card{width:min(820px,100%);max-height:90vh;overflow:auto;background:var(--bg2);border:1px solid var(--border);border-radius:18px;padding:22px}.pin-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:10px;margin:16px 0}.pin-ticket-mini{display:grid;gap:6px;border:1px solid var(--border);border-radius:12px;padding:14px}.pin-ticket-mini code{font-size:28px;letter-spacing:7px;color:var(--accent)}
@media(max-width:760px){.kiosk-pin-center .panel-body{grid-template-columns:1fr!important}.kiosk-pin-center .view-toggle{width:100%;overflow:auto}}
@media print{body *{visibility:hidden!important}.pin-print-sheet,.pin-print-sheet *{visibility:visible!important}.pin-print-sheet{display:block;position:absolute;inset:0;color:#111;background:#fff;font-family:Arial,sans-serif}.pin-print-sheet header{margin-bottom:18px}.pin-print-sheet article{break-inside:avoid;border:2px solid #222;border-radius:10px;padding:18px;margin:0 0 16px;min-height:190px}.pin-print-sheet article>div:first-child{display:flex;justify-content:space-between}.printed-pin{font:700 36px monospace;letter-spacing:12px;text-align:center;border:1px dashed #555;padding:12px;margin:18px 0}.pin-print-sheet p{font-size:12px;line-height:1.5}.pin-print-sheet footer{display:grid;grid-template-columns:1fr 1fr;gap:18px;font-size:11px;margin-top:24px}.pin-print-sheet footer span:last-child{grid-column:1/-1}}
`
