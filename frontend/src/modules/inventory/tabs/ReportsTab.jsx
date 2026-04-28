import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Cell } from 'recharts'
import api from '../../../shared/api/client.js'
import { money, cat } from '../constants.js'

const ABC_COLORS = { A: 'var(--green)', B: 'var(--amber)', C: 'var(--red)' }

function Section({ title, children }) {
  return (
    <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '14px', overflow: 'hidden', marginBottom: '16px' }}>
      <div style={{ height: '2px', background: 'linear-gradient(90deg,var(--accent),var(--purple))' }} />
      <div style={{ padding: '14px 18px', borderBottom: '1px solid var(--border)' }}>
        <div style={{ fontFamily: 'var(--display)', fontSize: '13px', letterSpacing: '2px' }}>{title}</div>
      </div>
      <div style={{ padding: '14px 18px' }}>{children}</div>
    </div>
  )
}

function ABCSection({ days }) {
  const { data } = useQuery({
    queryKey: ['inv-abc', days],
    queryFn: () => api.get(`/inventory/analytics/abc?days=${days}`).then(r => r.data),
  })
  if (!data) return null
  const top10 = data.items.slice(0, 10)
  const counts = { A: 0, B: 0, C: 0 }
  data.items.forEach(it => { if (it.consumption_value > 0) counts[it.abc_class]++ })
  return (
    <Section title={`ABC ANALIZI (SON ${days} GUN)`}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: '8px', marginBottom: '14px' }}>
        {[
          ['TOPLAM', money(data.total)],
          ['A SINIFI', `${counts.A} urun`],
          ['B SINIFI', `${counts.B} urun`],
          ['C SINIFI', `${counts.C} urun`],
        ].map(([l, v]) => (
          <div key={l} style={{ padding: '8px 10px', background: 'var(--surface2)', borderRadius: '10px' }}>
            <div style={{ fontFamily: 'var(--mono)', fontSize: '8px', color: 'var(--text4)', letterSpacing: '1px' }}>{l}</div>
            <div style={{ fontFamily: 'var(--mono)', fontSize: '12px', color: 'var(--accent)', fontWeight: 700, marginTop: '3px' }}>{v}</div>
          </div>
        ))}
      </div>
      <div style={{ width: '100%', height: 240 }}>
        <ResponsiveContainer>
          <BarChart data={top10}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
            <XAxis dataKey="item_name" tick={{ fontSize: 9, fill: 'var(--text3)' }} interval={0} angle={-25} textAnchor="end" height={60} />
            <YAxis tick={{ fontSize: 10, fill: 'var(--text3)' }} />
            <Tooltip contentStyle={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '8px', fontSize: '11px' }} formatter={(v) => money(v)} />
            <Bar dataKey="consumption_value" name="Tuketim Degeri">
              {top10.map((it, i) => <Cell key={i} fill={ABC_COLORS[it.abc_class]} />)}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
      <div style={{ overflow: 'auto', maxHeight: '320px', marginTop: '10px' }}>
        <table className="data-table" style={{ margin: 0 }}>
          <thead><tr><th>SIRA</th><th>URUN</th><th>KAT.</th><th>DEGER</th><th>%</th><th>KUM.%</th><th>SINIF</th></tr></thead>
          <tbody>
            {data.items.map((it, idx) => {
              const ct = cat(it.category)
              return (
                <tr key={it.id}>
                  <td style={{ fontFamily: 'var(--mono)', color: 'var(--text4)' }}>{idx + 1}</td>
                  <td style={{ fontWeight: 500, fontSize: '12px' }}>{it.item_name}</td>
                  <td><span style={{ padding: '2px 6px', borderRadius: '6px', fontSize: '9px', background: ct?.bg, color: ct?.color, fontFamily: 'var(--mono)' }}>{ct?.icon}</span></td>
                  <td style={{ fontFamily: 'var(--mono)', color: 'var(--accent)', fontWeight: 600 }}>{money(it.consumption_value)}</td>
                  <td style={{ fontFamily: 'var(--mono)', fontSize: '10px', color: 'var(--text3)' }}>{it.percentage}%</td>
                  <td style={{ fontFamily: 'var(--mono)', fontSize: '10px', color: 'var(--text3)' }}>{it.cumulative_pct}%</td>
                  <td><span style={{ padding: '2px 8px', borderRadius: '6px', fontSize: '8px', fontWeight: 700, background: `color-mix(in srgb, ${ABC_COLORS[it.abc_class]} 12%, transparent)`, color: ABC_COLORS[it.abc_class], fontFamily: 'var(--mono)' }}>{it.abc_class}</span></td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </Section>
  )
}

function DepartmentSection({ days }) {
  const { data } = useQuery({
    queryKey: ['inv-dept', days],
    queryFn: () => api.get(`/inventory/analytics/department-consumption?days=${days}`).then(r => r.data),
  })
  if (!data) return null
  // Aggregate by department (sum across categories)
  const deptMap = {}
  data.rows.forEach(r => {
    if (!deptMap[r.department]) deptMap[r.department] = { department: r.department, total_value: 0, total_qty: 0 }
    deptMap[r.department].total_value += r.total_value
    deptMap[r.department].total_qty += r.total_qty
  })
  const aggregated = Object.values(deptMap).sort((a, b) => b.total_value - a.total_value)
  return (
    <Section title={`DEPARTMAN TUKETIM (SON ${days} GUN)`}>
      {aggregated.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '24px', fontFamily: 'var(--mono)', fontSize: '11px', color: 'var(--text3)' }}>Veri yok</div>
      ) : (
        <div style={{ width: '100%', height: 220 }}>
          <ResponsiveContainer>
            <BarChart data={aggregated} layout="vertical">
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
              <XAxis type="number" tick={{ fontSize: 10, fill: 'var(--text3)' }} />
              <YAxis dataKey="department" type="category" tick={{ fontSize: 10, fill: 'var(--text3)' }} width={120} />
              <Tooltip contentStyle={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '8px', fontSize: '11px' }} formatter={(v) => money(v)} />
              <Bar dataKey="total_value" fill="var(--accent)" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </Section>
  )
}

function HeatmapSection({ days }) {
  const { data } = useQuery({
    queryKey: ['inv-heatmap', days],
    queryFn: () => api.get(`/inventory/analytics/heatmap?days=${days}`).then(r => r.data),
  })
  if (!data) return null
  return (
    <Section title={`GUN BAZLI HAREKET (SON ${days} GUN)`}>
      <div style={{ width: '100%', height: 240 }}>
        <ResponsiveContainer>
          <BarChart data={data.rows}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
            <XAxis dataKey="date" tick={{ fontSize: 9, fill: 'var(--text3)' }} />
            <YAxis tick={{ fontSize: 10, fill: 'var(--text3)' }} />
            <Tooltip contentStyle={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '8px', fontSize: '11px' }} />
            <Bar dataKey="in_qty" name="Giris" fill="var(--green)" />
            <Bar dataKey="out_qty" name="Cikis" fill="var(--red)" />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </Section>
  )
}

export default function ReportsTab() {
  const [days, setDays] = useState(30)
  const downloadMonthlyPdf = () => {
    const d = new Date()
    d.setMonth(d.getMonth() - 1)
    const month = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
    api.get(`/inventory/analytics/monthly-pdf?month=${month}`, { responseType: 'blob' }).then(r => {
      const url = URL.createObjectURL(r.data)
      const a = document.createElement('a'); a.href = url; a.download = `envanter-${month}.pdf`; a.click()
      URL.revokeObjectURL(url)
    })
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '8px', marginBottom: '14px', flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', gap: '4px', alignItems: 'center' }}>
          <span style={{ fontFamily: 'var(--mono)', fontSize: '10px', color: 'var(--text3)' }}>DONEM</span>
          {[7, 14, 30, 60, 90].map(d => (
            <button key={d} onClick={() => setDays(d)} className={`btn btn-xs ${days === d ? 'btn-primary' : 'btn-ghost'}`} style={{ borderRadius: '8px' }}>{d}G</button>
          ))}
        </div>
        <button onClick={downloadMonthlyPdf} className="btn btn-ghost btn-sm" style={{ borderRadius: '10px', color: 'var(--purple)' }}>📄 GECMIS AY PDF</button>
      </div>
      <ABCSection days={days} />
      <DepartmentSection days={days} />
      <HeatmapSection days={days} />
    </div>
  )
}
