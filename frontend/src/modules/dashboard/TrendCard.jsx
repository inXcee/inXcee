import {
  AreaChart, Area, LineChart, Line,
  XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
} from 'recharts'

const CONFIGS = {
  occupancy: { label: 'Doluluk', unit: '%', color: 'var(--accent)', type: 'area' },
  sla: { label: 'Bakım SLA uyumu', unit: '%', color: 'var(--accent)', type: 'area' },
  housekeeping: { label: 'Temizlik tamamlama', unit: '%', color: 'var(--accent)', type: 'area' },
  checkins: { label: 'Giriş / çıkış', unit: '', color: null, type: 'line2' },
}

function formatDate(dateStr) {
  const d = new Date(dateStr + 'T00:00:00')
  return `${d.getDate()}/${d.getMonth() + 1}`
}

function getTrend(data, cfg) {
  if (!data || data.length < 2) return null
  const last = cfg.type === 'line2' ? (data[data.length - 1].in ?? 0) : (data[data.length - 1].value ?? 0)
  const prev = cfg.type === 'line2' ? (data[data.length - 2].in ?? 0) : (data[data.length - 2].value ?? 0)
  if (last > prev) return { arrow: '↑', color: 'var(--green)' }
  if (last < prev) return { arrow: '↓', color: 'var(--red)' }
  return { arrow: '→', color: 'var(--text3)' }
}

export default function TrendCard({ metric, data }) {
  const cfg = CONFIGS[metric]
  if (!cfg || !data || data.length === 0) return null

  const trend = getTrend(data, cfg)
  const lastPoint = data[data.length - 1]
  const displayValue = cfg.type === 'line2'
    ? `${lastPoint.in ?? 0} / ${lastPoint.out ?? 0}`
    : `${lastPoint.value ?? 0}${cfg.unit}`

  const tooltipStyle = { background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '6px', fontSize: '11px' }

  return (
    <div style={{
      background: 'var(--surface)',
      border: '1px solid var(--border)',
      borderRadius: '12px',
      padding: '16px 16px 10px',
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '10px' }}>
        <div>
          <div style={{ fontSize: '11px', color: 'var(--text2)', fontWeight: 500 }}>
            {cfg.label}
          </div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: '6px', marginTop: '4px' }}>
            <span style={{ fontSize: '22px', fontWeight: 600, color: 'var(--text)', lineHeight: 1 }}>
              {displayValue}
            </span>
            {trend && (
              <span style={{ fontSize: '13px', color: trend.color, fontWeight: 600 }}>
                {trend.arrow}
              </span>
            )}
          </div>
        </div>
        {cfg.type === 'line2' && (
          <div style={{ display: 'flex', gap: '10px', fontSize: '10px', color: 'var(--text3)' }}>
            <span style={{ color: 'var(--green)' }}>● Giriş</span>
            <span style={{ color: 'var(--red)' }}>● Çıkış</span>
          </div>
        )}
      </div>

      <ResponsiveContainer width="100%" height={70}>
        {cfg.type === 'line2' ? (
          <LineChart data={data} margin={{ top: 0, right: 0, left: -30, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
            <XAxis dataKey="date" tickFormatter={formatDate} tick={{ fontSize: 9, fill: 'var(--text3)' }} tickLine={false} axisLine={false} interval="preserveStartEnd" />
            <YAxis tick={{ fontSize: 9, fill: 'var(--text3)' }} tickLine={false} axisLine={false} />
            <Tooltip contentStyle={tooltipStyle} labelFormatter={formatDate} formatter={(val, name) => [val, name === 'in' ? 'Giriş' : 'Çıkış']} />
            <Line type="monotone" dataKey="in" stroke="var(--green)" strokeWidth={1.5} dot={false} />
            <Line type="monotone" dataKey="out" stroke="var(--red)" strokeWidth={1.5} dot={false} />
          </LineChart>
        ) : (
          <AreaChart data={data} margin={{ top: 0, right: 0, left: -30, bottom: 0 }}>
            <defs>
              <linearGradient id={`grad-${metric}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor={cfg.color} stopOpacity={0.2} />
                <stop offset="95%" stopColor={cfg.color} stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
            <XAxis dataKey="date" tickFormatter={formatDate} tick={{ fontSize: 9, fill: 'var(--text3)' }} tickLine={false} axisLine={false} interval="preserveStartEnd" />
            <YAxis domain={[0, 100]} tick={{ fontSize: 9, fill: 'var(--text3)' }} tickLine={false} axisLine={false} />
            <Tooltip contentStyle={tooltipStyle} labelFormatter={formatDate} formatter={(val) => [`${val}%`]} />
            <Area type="monotone" dataKey="value" stroke={cfg.color} strokeWidth={1.5} fill={`url(#grad-${metric})`} dot={false} />
          </AreaChart>
        )}
      </ResponsiveContainer>
    </div>
  )
}
