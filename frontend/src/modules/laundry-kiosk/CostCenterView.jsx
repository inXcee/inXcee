import { useEffect, useMemo, useState } from 'react'

function dateValue(daysAgo = 0) {
  const date = new Date()
  date.setDate(date.getDate() - daysAgo)
  return date.toLocaleDateString('en-CA')
}

function number(value, digits = 1) {
  return new Intl.NumberFormat('tr-TR', { maximumFractionDigits: digits }).format(Number(value || 0))
}

function currency(value) {
  return new Intl.NumberFormat('tr-TR', { style: 'currency', currency: 'TRY' }).format(Number(value || 0))
}

export default function CostCenterView({ kioskApi }) {
  const [from, setFrom] = useState(() => dateValue(30))
  const [to, setTo] = useState(() => dateValue())
  const [data, setData] = useState({ summary: {}, loads: [] })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  async function load() {
    setLoading(true)
    setError('')
    try {
      const response = await kioskApi.get(`/self-service/laundry-kiosk/costs?from=${from}&to=${to}`)
      setData(response.data)
    } catch (requestError) {
      setError(requestError.response?.data?.error || 'Maliyet raporu yüklenemedi')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const mostExpensive = useMemo(() => [...(data.loads || [])]
    .sort((left, right) => Number(right.total_cost) - Number(left.total_cost))[0], [data.loads])
  const summary = data.summary || {}

  return (
    <section className="cost-center">
      <header className="kiosk-work-header">
        <div><span className="kiosk-eyebrow">TÜKETİM VE VERİMLİLİK</span><h1>Çamaşır maliyet merkezi</h1><p>Makine yükü, kg, sarf, su ve enerji maliyetlerini aynı dönem içinde karşılaştırın.</p></div>
        <form className="cost-filters" onSubmit={event => { event.preventDefault(); load() }}>
          <label>Başlangıç<input type="date" value={from} onChange={event => setFrom(event.target.value)} /></label>
          <label>Bitiş<input type="date" value={to} onChange={event => setTo(event.target.value)} /></label>
          <button type="submit" disabled={loading}>{loading ? 'Yükleniyor…' : 'Uygula'}</button>
        </form>
      </header>

      {error && <div className="hardware-message">{error}</div>}
      <div className="cost-summary">
        <article><span>Makine yükü</span><strong>{summary.loads || 0}</strong><small>tamamlanan çalışma</small></article>
        <article><span>Toplam ağırlık</span><strong>{number(summary.weight_kg)} kg</strong><small>işlenen çamaşır</small></article>
        <article><span>Su / enerji</span><strong>{number(summary.water_liters, 0)} L</strong><small>{number(summary.energy_kwh, 2)} kWh</small></article>
        <article className="is-cost"><span>Toplam maliyet</span><strong>{currency(summary.total_cost)}</strong><small>{currency(summary.cost_per_kg)} / kg</small></article>
      </div>

      {mostExpensive && <div className="cost-highlight"><span>En yüksek maliyetli yük</span><strong>{mostExpensive.machine_name} · {currency(mostExpensive.total_cost)}</strong><small>{number(mostExpensive.weight_kg)} kg · {mostExpensive.program}</small></div>}

      <div className="cost-table-wrap">
        <table className="cost-table">
          <thead><tr><th>Makine / yük</th><th>Program</th><th>Torba</th><th>Kg</th><th>Su</th><th>Enerji</th><th>Sarf</th><th>Toplam</th></tr></thead>
          <tbody>
            {(data.loads || []).map(load => (
              <tr key={load.id}>
                <td><strong>{load.machine_name}</strong><small>#{load.load_id}</small></td>
                <td>{load.program}</td><td>{load.bag_count}</td><td>{number(load.weight_kg)}</td>
                <td>{number(load.water_liters, 0)} L</td><td>{number(load.energy_kwh, 2)} kWh</td>
                <td>{currency(load.supplies_cost)}</td><td><strong>{currency(load.total_cost)}</strong></td>
              </tr>
            ))}
          </tbody>
        </table>
        {!loading && !(data.loads || []).length && <div className="loss-empty"><span>₺</span><strong>Bu dönemde maliyet kaydı yok.</strong><small>Makine yükü tamamlandığında hesap otomatik oluşur.</small></div>}
      </div>
    </section>
  )
}
