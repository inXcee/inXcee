import { useEffect, useState } from 'react'
import { listQueued } from './offlineQueue.js'

function Summary({ summary = {} }) {
  const running = (summary.machines || []).filter(machine => machine.status === 'running').length
  return <div className="handover-summary"><div><span>Aktif iş</span><strong>{summary.active_jobs || 0}</strong></div><div><span>Çalışan makine</span><strong>{running}</strong></div><div><span>Bekleyen teslim</span><strong>{summary.pending_deliveries || 0}</strong></div><div><span>Kritik stok</span><strong>{summary.supplies?.critical || 0}</strong></div></div>
}

export default function HandoverView({ kioskApi, workerName, workerId, onComplete }) {
  const [handover, setHandover] = useState(null)
  const [summary, setSummary] = useState({})
  const [workers, setWorkers] = useState([])
  const [outgoingPin, setOutgoingPin] = useState('')
  const [incomingId, setIncomingId] = useState('')
  const [incomingPin, setIncomingPin] = useState('')
  const [note, setNote] = useState('')
  const [issues, setIssues] = useState('')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState(null)
  const queued = listQueued().length

  async function load() {
    try {
      const [current, staff] = await Promise.all([
        kioskApi.get('/self-service/laundry-kiosk/handovers/current'),
        kioskApi.get('/self-service/laundry-kiosk/handover-workers'),
      ])
      setHandover(current.data?.handover === null ? null : current.data)
      setSummary(current.data?.summary || {})
      setWorkers((staff.data || []).filter(worker => worker.id !== workerId))
    } catch (error) { setMessage({ type: 'error', text: error.response?.data?.error || 'Vardiya bilgisi alınamadı' }) }
  }

  useEffect(() => { load() }, []) // eslint-disable-line react-hooks/exhaustive-deps

  async function start(event) {
    event.preventDefault(); setBusy(true); setMessage(null)
    try {
      const response = await kioskApi.post('/self-service/laundry-kiosk/handovers/start', { outgoing_pin: outgoingPin, offline_queue_count: queued })
      setHandover(response.data); setSummary(response.data.summary || {}); setOutgoingPin('')
      setMessage({ type: 'ok', text: 'Çıkan personel doğrulandı. Devralan personelin PIN onayı bekleniyor.' })
    } catch (error) { setMessage({ type: 'error', text: error.response?.data?.error || 'Teslim başlatılamadı' }) }
    finally { setBusy(false) }
  }

  async function finalize(event) {
    event.preventDefault(); setBusy(true); setMessage(null)
    try {
      const response = await kioskApi.post(`/self-service/laundry-kiosk/handovers/${handover.id}/finalize`, {
        incoming_worker_id: Number(incomingId), incoming_pin: incomingPin,
        offline_queue_count: queued, note,
        issues: issues.split('\n').map(value => value.trim()).filter(Boolean),
      })
      setMessage({ type: 'ok', text: `Vardiya ${response.data.incoming_worker} personeline teslim edildi.` })
      window.setTimeout(() => onComplete?.(), 900)
    } catch (error) { setMessage({ type: 'error', text: error.response?.data?.error || 'Teslim tamamlanamadı' }) }
    finally { setBusy(false) }
  }

  return (
    <div className="handover-view">
      <header className="kiosk-work-header"><div><span className="kiosk-eyebrow">KONTROLLÜ VARDİYA DEVRİ</span><h1>Vardiya teslimi</h1><p>Aktif işler, makineler, teslimler ve stok durumu iki personelin onayıyla devredilir.</p></div><span className={`handover-queue ${queued ? 'is-blocked' : ''}`}>{queued ? `${queued} offline kayıt bekliyor` : 'Offline kuyruk boş'}</span></header>
      {message && <div className={`handover-message is-${message.type}`} role="alert">{message.text}</div>}
      <Summary summary={summary} />
      <div className="handover-machines">{(summary.machines || []).map(machine => <div key={machine.id}><span className={`machine-dot is-${machine.status}`} /><strong>{machine.name}</strong><small>{machine.status === 'running' ? 'Çalışıyor' : machine.status === 'maintenance' ? 'Bakımda' : 'Boş / hazır'}</small></div>)}</div>
      {!handover ? (
        <form className="handover-form" onSubmit={start}><div><span className="handover-step">1</span><h2>Çıkan personel doğrulaması</h2><p>{workerName} mevcut iş özetini kontrol eder ve kendi PIN’iyle teslimi başlatır.</p></div><label>Çıkan personel PIN’i<input type="password" inputMode="numeric" maxLength={4} value={outgoingPin} onChange={event => setOutgoingPin(event.target.value.replace(/\D/g, '').slice(0, 4))} /></label><button type="submit" disabled={busy || outgoingPin.length !== 4 || queued > 0}>{busy ? 'Doğrulanıyor…' : 'Teslimi başlat'}</button></form>
      ) : (
        <form className="handover-form" onSubmit={finalize}><div><span className="handover-step">2</span><h2>Devralan personel doğrulaması</h2><p>Devralan kişi özeti okur, sorunları teslim alır ve kendi PIN’ini girer.</p></div><label>Devralan personel<select value={incomingId} onChange={event => setIncomingId(event.target.value)} required><option value="">Personel seçin</option>{workers.map(worker => <option key={worker.id} value={worker.id}>{worker.full_name}</option>)}</select></label><label>Devralan PIN’i<input type="password" inputMode="numeric" maxLength={4} value={incomingPin} onChange={event => setIncomingPin(event.target.value.replace(/\D/g, '').slice(0, 4))} /></label><label className="is-wide">Açık sorunlar<textarea value={issues} onChange={event => setIssues(event.target.value)} placeholder={'Her satıra bir sorun yazın\nÖrn. Makine 2 filtre kontrolü'} /></label><label className="is-wide">Devir notu<textarea value={note} onChange={event => setNote(event.target.value)} placeholder="Devralan personelin bilmesi gerekenler" /></label><button type="submit" disabled={busy || !incomingId || incomingPin.length !== 4 || queued > 0}>{busy ? 'Tamamlanıyor…' : 'İki onayla vardiyayı devret'}</button></form>
      )}
    </div>
  )
}
