import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import api from '../../../shared/api/client.js'
import { EmptyState, KPI, toast, toastErr } from '../shared.jsx'

const BREAKDOWNS = [
  ['route', 'HATLAR'],
  ['vehicle', 'ARAÇLAR'],
  ['driver', 'ŞOFÖRLER'],
  ['shift', 'VARDİYALAR'],
  ['people', 'PERSONEL'],
]

export default function AnalyticsTab() {
  const today = new Date().toISOString().slice(0, 10)
  const monthAgo = new Date(Date.now() - 29 * 86400000).toISOString().slice(0, 10)
  const [filters, setFilters] = useState({
    start: monthAgo,
    end: today,
    direction: '',
    status: '',
    route_id: '',
    vehicle_id: '',
    driver_id: '',
    shift_id: '',
  })
  const [breakdown, setBreakdown] = useState('route')
  const queryString = useMemo(() => {
    const params = new URLSearchParams()
    Object.entries(filters).forEach(([key, value]) => {
      if (value) params.set(key, value)
    })
    return params.toString()
  }, [filters])

  const { data, isLoading, isError } = useQuery({
    queryKey: ['transport-analytics', queryString],
    queryFn: () => api.get(`/transport/analytics?${queryString}`).then(response => response.data),
  })

  const update = (key, value) => setFilters(current => ({ ...current, [key]: value }))
  const exportReport = async format => {
    try {
      const response = await api.get(`/transport/analytics/export/${format}?${queryString}`, {
        responseType: 'blob',
      })
      const url = URL.createObjectURL(response.data)
      const link = document.createElement('a')
      link.href = url
      link.download = `servis-analiz-${filters.start}-${filters.end}.${format}`
      link.click()
      URL.revokeObjectURL(url)
      toast(`${format.toUpperCase()} raporu hazır`)
    } catch (error) { toastErr(error) }
  }

  if (isLoading) return <div className="transport-analytics__loading">Analiz hazırlanıyor…</div>
  if (isError || !data) {
    return <EmptyState icon="!" title="ANALİZ YÜKLENEMEDİ" desc="Filtreleri kontrol edip yeniden deneyin." />
  }

  const rows = breakdown === 'people' ? data.people : data[`by_${breakdown}`] || []
  const maxTrips = Math.max(...data.daily.map(row => row.trips), 1)

  return (
    <div className="transport-analytics">
      <section className="transport-analytics__filters" aria-label="Analiz filtreleri">
        <label>Başlangıç<input type="date" value={filters.start} onChange={event => update('start', event.target.value)} /></label>
        <label>Bitiş<input type="date" value={filters.end} onChange={event => update('end', event.target.value)} /></label>
        <Filter label="Yön" value={filters.direction} onChange={value => update('direction', value)}
          options={[['outbound', 'Gidiş'], ['inbound', 'Dönüş']]} />
        <Filter label="Durum" value={filters.status} onChange={value => update('status', value)}
          options={[
            ['draft', 'Taslak'], ['published', 'Yayınlandı'], ['boarding', 'Biniş'],
            ['departed', 'Yolda'], ['completed', 'Tamamlandı'], ['cancelled', 'İptal'],
          ]} />
        <Filter label="Hat" value={filters.route_id} onChange={value => update('route_id', value)}
          options={(data.filters.routes || []).map(row => [row.id, row.label])} />
        <Filter label="Araç" value={filters.vehicle_id} onChange={value => update('vehicle_id', value)}
          options={(data.filters.vehicles || []).map(row => [row.id, row.label])} />
        <Filter label="Şoför" value={filters.driver_id} onChange={value => update('driver_id', value)}
          options={(data.filters.drivers || []).map(row => [row.id, row.label])} />
        <Filter label="Vardiya" value={filters.shift_id} onChange={value => update('shift_id', value)}
          options={(data.filters.shifts || []).map(row => [row.id, row.label])} />
      </section>

      <div className="transport-analytics__export">
        <span>{data.range.start} → {data.range.end}</span>
        <button onClick={() => exportReport('csv')}>CSV</button>
        <button onClick={() => exportReport('xlsx')}>EXCEL</button>
        <button onClick={() => exportReport('pdf')}>PDF</button>
      </div>

      <section className="transport-analytics__kpis">
        <KPI label="SEFER" value={data.kpis.trips} color="var(--blue)" />
        <KPI label="DOLULUK" value={`%${data.kpis.occupancy_pct}`} color="var(--accent)" />
        <KPI label="BİNİŞ" value={`%${data.kpis.boarding_pct}`} color="var(--green)" />
        <KPI label="NO-SHOW" value={`%${data.kpis.no_show_pct}`} color="var(--red)" />
        <KPI label="ZAMANINDA" value={`%${data.kpis.on_time_pct}`} color="var(--green)" />
        <KPI label="İPTAL" value={`%${data.kpis.cancellation_pct}`} color="var(--amber)" />
        <KPI label="KAPSAMA" value={`%${data.kpis.coverage_pct}`} color="var(--blue)" />
      </section>

      <section className="transport-analytics__panel">
        <header><h2>Günlük operasyon</h2><span>{data.daily.length} gün</span></header>
        {data.daily.length === 0 ? <p className="transport-analytics__empty">Bu aralıkta sefer yok.</p> : (
          <div className="transport-analytics__trend">
            {data.daily.map(day => (
              <div key={day.date} title={`${day.date}: ${day.trips} sefer`}>
                <strong>{day.trips}</strong>
                <i style={{ height: `${Math.max(8, day.trips / maxTrips * 96)}px` }} />
                <small>{day.date.slice(5)}</small>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="transport-analytics__panel">
        <header className="transport-analytics__breakdowns">
          <h2>Detaya in</h2>
          <nav aria-label="Analiz kırılımı">
            {BREAKDOWNS.map(([key, label]) => (
              <button key={key} className={breakdown === key ? 'is-active' : ''}
                onClick={() => setBreakdown(key)}>{label}</button>
            ))}
          </nav>
        </header>
        {rows.length === 0 ? <p className="transport-analytics__empty">Bu kırılımda veri yok.</p> : (
          <div className="transport-analytics__table-wrap">
            <table>
              <thead>
                <tr>
                  <th>{breakdown === 'people' ? 'Personel' : 'Kaynak'}</th>
                  {breakdown === 'people' && <th>Departman</th>}
                  <th>Sefer / Atama</th>
                  <th>Binen</th>
                  <th>Binmeyen</th>
                  <th>{breakdown === 'people' ? 'Son sefer' : 'Doluluk'}</th>
                </tr>
              </thead>
              <tbody>
                {rows.map(row => (
                  <tr key={row.id}>
                    <td><strong>{row.label || 'Tanımsız'}</strong></td>
                    {breakdown === 'people' && <td>{row.department || '—'}</td>}
                    <td>{breakdown === 'people' ? row.assignments : row.trips}</td>
                    <td>{row.boarded || 0}</td>
                    <td>{row.no_show || 0}</td>
                    <td>{breakdown === 'people' ? row.last_trip || '—' : `%${row.occupancy_pct || 0}`}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="transport-analytics__panel">
        <header><h2>Sefer kayıtları</h2><span>{data.trips.length} kayıt</span></header>
        <div className="transport-analytics__table-wrap">
          <table>
            <thead><tr><th>Tarih / saat</th><th>Hat</th><th>Yön</th><th>Kaynak</th><th>Durum</th><th>Binen / kapasite</th></tr></thead>
            <tbody>
              {data.trips.map(trip => (
                <tr key={trip.id}>
                  <td>{trip.work_date} · {String(trip.scheduled_departure).slice(11, 16)}</td>
                  <td><strong>{trip.route_name}</strong></td>
                  <td>{trip.direction === 'outbound' ? 'Gidiş' : 'Dönüş'}</td>
                  <td>{trip.vehicle || '—'} · {trip.driver || '—'}</td>
                  <td>{trip.status}</td>
                  <td>{trip.boarded || 0} / {trip.capacity}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  )
}

function Filter({ label, value, onChange, options }) {
  return (
    <label>{label}
      <select value={value} onChange={event => onChange(event.target.value)}>
        <option value="">Tümü</option>
        {options.map(([key, text]) => <option key={key} value={key}>{text}</option>)}
      </select>
    </label>
  )
}
