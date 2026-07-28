import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'

const STATUS_LABELS = {
  published: 'Yayınlandı',
  boarding: 'Biniş açık',
  departed: 'Yolda',
  completed: 'Tamamlandı',
}

export default function DriverTripPage() {
  const { token } = useParams()
  const [data, setData] = useState(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const load = async () => {
    const response = await fetch(`/public/transport/trips/${encodeURIComponent(token)}`, {
      headers: { Accept: 'application/json' },
      cache: 'no-store',
    })
    const body = await response.json()
    if (!response.ok) throw new Error(body.error || 'Sefer yüklenemedi')
    setData(body)
  }

  useEffect(() => {
    load().catch(reason => setError(reason.message))
  }, [token])

  const transition = async action => {
    setBusy(true)
    setError('')
    try {
      const response = await fetch(`/public/transport/trips/${encodeURIComponent(token)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action }),
      })
      const body = await response.json()
      if (!response.ok) throw new Error(body.error || 'İşlem yapılamadı')
      await load()
    } catch (reason) {
      setError(reason.message)
    } finally {
      setBusy(false)
    }
  }

  if (error && !data) return <DriverState title="Bağlantı kullanılamıyor" detail={error} />
  if (!data) return <DriverState title="Sefer yükleniyor…" />
  const { trip, manifest } = data

  return (
    <main className="driver-trip">
      <header className="driver-trip__hero">
        <span>ŞOFÖR SEFER EKRANI</span>
        <h1>{trip.route_name}</h1>
        <p>{trip.direction === 'outbound' ? 'Gidiş' : 'Dönüş'} · {formatDate(trip.scheduled_departure)}</p>
        <strong>{STATUS_LABELS[trip.status] || trip.status}</strong>
      </header>

      <section className="driver-trip__summary">
        <span><small>ARAÇ</small>{trip.vehicle_plate || '—'}</span>
        <span><small>YOLCU</small>{manifest.filter(row => row.status !== 'waitlisted').length}</span>
        <span><small>KAPASİTE</small>{trip.capacity}</span>
      </section>

      {error && <div className="driver-trip__error" role="alert">{error}</div>}
      <section className="driver-trip__manifest">
        <h2>Manifesto</h2>
        {manifest.map(person => (
          <article key={person.id}>
            <span className={`driver-trip__dot is-${person.status}`} aria-hidden="true" />
            <div>
              <strong>{person.full_name}</strong>
              <small>{person.stop_name || 'Durak belirtilmedi'}{person.scheduled_time ? ` · ${person.scheduled_time}` : ''}</small>
            </div>
            <em>{assignmentLabel(person.status)}</em>
          </article>
        ))}
      </section>
      <p className="driver-trip__privacy">🔒 {data.privacy}</p>

      <footer className="driver-trip__actions">
        {['published', 'boarding'].includes(trip.status) && (
          <button disabled={busy} onClick={() => transition('start')}>SEFERE BAŞLADIM</button>
        )}
        {trip.status === 'departed' && (
          <button disabled={busy} onClick={() => transition('complete')}>SEFERİ TAMAMLADIM</button>
        )}
        {trip.status === 'completed' && <span>✓ Sefer tamamlandı</span>}
      </footer>
    </main>
  )
}

function DriverState({ title, detail }) {
  return <main className="driver-trip driver-trip--state"><h1>{title}</h1>{detail && <p>{detail}</p>}</main>
}

function assignmentLabel(status) {
  return {
    assigned: 'Bekliyor',
    boarded: 'Bindi',
    no_show: 'Binmedi',
    waitlisted: 'Yedek',
  }[status] || status
}

function formatDate(value) {
  if (!value) return '—'
  return `${value.slice(8, 10)}.${value.slice(5, 7)}.${value.slice(0, 4)} · ${value.slice(11, 16)}`
}
