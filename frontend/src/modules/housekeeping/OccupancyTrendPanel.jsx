// Doluluk trendi (docs/saha-ekrani.md → "Doluluk geçmişi"): saha doluluğunun günlük anlık görüntüleri, bugün canlı.
// Oran panelle aynı: dolu / (dolu + boş), kapalı oda hariç. Görüntüsü olmayan gün boş kalır, sıfır diye çizilmez.
import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  ComposedChart, Line, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
} from 'recharts'
import api from '../../shared/api/client.js'
import { BLOCKS } from '../../shared/blocks.js'

const RANGES = [14, 30, 90]

const dayLabel = value => {
  const [, m, d] = String(value).split('-')
  return `${Number(d)}/${Number(m)}`
}
const pctText = value => (value == null ? '—' : `%${value}`)
const signed = value => (value == null ? '—' : `${value > 0 ? '+' : ''}${value} puan`)

function Stat({ label, value, hint }) {
  return (
    <div style={{ minWidth: '110px' }}>
      <div style={{ fontSize: '11px', color: 'var(--text3)' }}>{label}</div>
      <div style={{ fontSize: '20px', fontWeight: 700, color: 'var(--text)', fontVariantNumeric: 'tabular-nums' }}>{value}</div>
      {hint && <div style={{ fontSize: '11px', color: 'var(--text3)' }}>{hint}</div>}
    </div>
  )
}

function TrendTooltip({ active, payload }) {
  if (!active || !payload?.length) return null
  const point = payload[0].payload
  return (
    <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '6px', padding: '8px 10px', fontSize: '12px' }}>
      <div style={{ fontWeight: 600, marginBottom: '4px' }}>{dayLabel(point.date)}{point.live ? ' · canlı' : ''}</div>
      {point.captured ? (
        <>
          <div>{`Doluluk ${pctText(point.pct)}`}</div>
          <div style={{ color: 'var(--text2)' }}>{`${point.occupied} dolu · ${point.empty} boş · ${point.unknown} bilinmiyor`}</div>
          <div style={{ color: 'var(--text3)' }}>{`Bilgi kapsaması ${pctText(point.coverage)}`}</div>
        </>
      ) : <div style={{ color: 'var(--text3)' }}>Bu gün için kayıt yok</div>}
    </div>
  )
}

export default function OccupancyTrendPanel() {
  const [days, setDays] = useState(30)
  const [block, setBlock] = useState('')
  const query = useQuery({
    queryKey: ['occupancy-trend', days, block],
    queryFn: () => api.get(`/housekeeping/occupancy/trend?days=${days}${block ? `&block=${encodeURIComponent(block)}` : ''}`).then(r => r.data),
    refetchInterval: 5 * 60 * 1000,
  })
  const trend = query.data
  const summary = trend?.summary
  const latest = trend?.series?.[trend.series.length - 1]

  return (
    <div className="panel" style={{ marginBottom: '14px', padding: '16px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: '12px', flexWrap: 'wrap', alignItems: 'flex-start' }}>
        <div>
          <div className="panel-title">📈 DOLULUK TRENDİ</div>
          <div className="panel-subtitle" style={{ marginTop: '5px', maxWidth: '620px' }}>
            Saha ekranından girilen oda doluluğu; her gün sonu durumu saklanır. Kapalı odalar paydaya girmez.
          </div>
        </div>
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
          <select className="form-select" aria-label="Blok" value={block} onChange={event => setBlock(event.target.value)} style={{ width: '140px' }}>
            <option value="">Tüm bloklar</option>
            {BLOCKS.map(b => <option key={b.block} value={b.block}>{b.block}</option>)}
          </select>
          <div style={{ display: 'flex', gap: '4px' }}>
            {RANGES.map(n => (
              <button key={n} type="button" className={`filter-chip${days === n ? ' active' : ''}`} aria-pressed={days === n}
                onClick={() => setDays(n)}>{`${n} gün`}</button>
            ))}
          </div>
        </div>
      </div>

      {query.isLoading && <div style={{ padding: '30px', textAlign: 'center', color: 'var(--text3)' }}>Doluluk trendi yükleniyor…</div>}
      {query.isError && <div style={{ padding: '30px', textAlign: 'center' }}>Doluluk trendi alınamadı.</div>}
      {trend && (
        <>
          <div style={{ display: 'flex', gap: '24px', flexWrap: 'wrap', margin: '16px 0 10px' }}>
            <Stat label="Bugün" value={pctText(summary.pct)}
              hint={latest?.captured ? `${latest.occupied} dolu · ${latest.empty} boş · ${latest.unknown} bilinmiyor` : null} />
            <Stat label="7 gün önceye göre" value={signed(summary.change_7d)} />
            <Stat label={`${trend.days} gün ortalaması`} value={pctText(summary.avg)} />
            <Stat label="En düşük – en yüksek" value={summary.min == null ? '—' : `%${summary.min} – %${summary.max}`} />
            <Stat label="Kayıtlı gün" value={`${summary.days_with_data} / ${trend.days}`} />
          </div>
          {summary.days_with_data <= 1 && (
            <div className="alert alert-info" style={{ marginBottom: '10px' }}>
              Günlük kayıt yeni başladı; grafik her gün sonunda bir nokta kazanır.
            </div>
          )}
          <ResponsiveContainer width="100%" height={220}>
            <ComposedChart data={trend.series} margin={{ top: 6, right: 6, left: -18, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
              <XAxis dataKey="date" tickFormatter={dayLabel} tick={{ fontSize: 10, fill: 'var(--text3)' }} tickLine={false} axisLine={false} interval="preserveStartEnd" />
              <YAxis yAxisId="pct" domain={[0, 100]} tickFormatter={v => `%${v}`} tick={{ fontSize: 10, fill: 'var(--text3)' }} tickLine={false} axisLine={false} />
              <YAxis yAxisId="rooms" orientation="right" hide />
              <Tooltip content={<TrendTooltip />} />
              <Bar yAxisId="rooms" dataKey="unknown" name="Bilinmiyor" fill="var(--border)" barSize={6} />
              <Line yAxisId="pct" type="monotone" dataKey="pct" name="Doluluk" stroke="var(--accent)" strokeWidth={2} dot={{ r: 2 }} />
            </ComposedChart>
          </ResponsiveContainer>
          <div style={{ fontSize: '11px', color: 'var(--text3)', marginTop: '4px' }}>
            Çizgi doluluk oranı; gri çubuk o gün durumu bilinmeyen oda sayısı.
          </div>
        </>
      )}
    </div>
  )
}
