import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import api from '../../shared/api/client.js'
import { useToastStore } from '../../shared/store/toastStore.js'
import { SkeletonTable } from '../../shared/components/Skeleton.jsx'
import { useUrlParamState } from '../../shared/hooks/useUrlParamState.js'

const toast = (m, t = 'success') => useToastStore.getState().addToast(m, t)

const TABS = [
  { key: 'absence',    label: '✗ DEVAMSIZLIK DASHBOARD' },
  { key: 'cost',       label: '💰 KİŞİ BAŞI MALİYET' },
  { key: 'comparison', label: '📊 KARŞILAŞTIRMA' },
  { key: 'builder',    label: '🔧 RAPOR BUILDER' },
]

export default function AdvancedReportsPage() {
  const [tab, setTab] = useUrlParamState('tab', 'absence')

  return (
    <div style={{ maxWidth: 1280 }} className="fade-up">
      <div style={{ marginBottom: 16 }}>
        <h1 style={{ fontSize: 28, letterSpacing: 4, color: 'var(--text)', margin: 0 }}>İLERİ RAPORLAR</h1>
        <p style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--text3)', marginTop: 4, letterSpacing: 1.5 }}>
          DEVAMSIZLIK · MALİYET · KARŞILAŞTIRMA · ÖZEL BUILDER
        </p>
      </div>

      <div style={{ display: 'flex', gap: 2, marginBottom: 14, background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: 3, overflowX: 'auto' }}>
        {TABS.map(t => (
          <button key={t.key} onClick={() => setTab(t.key)} style={{
            flex: 1, padding: '10px 12px', border: 'none', borderRadius: 9,
            background: tab === t.key ? 'var(--accent)' : 'transparent',
            color: tab === t.key ? '#000' : 'var(--text3)',
            fontSize: 10, fontWeight: 700, fontFamily: 'var(--mono)', letterSpacing: 1, cursor: 'pointer', whiteSpace: 'nowrap',
          }}>{t.label}</button>
        ))}
      </div>

      {tab === 'absence' && <AbsenceTab />}
      {tab === 'cost' && <CostTab />}
      {tab === 'comparison' && <ComparisonTab />}
      {tab === 'builder' && <BuilderTab />}
    </div>
  )
}

function AbsenceTab() {
  const [days, setDays] = useState(30)
  const { data, isLoading, error } = useQuery({
    queryKey: ['absence-dash', days],
    queryFn: () => api.get(`/reports/absence-dashboard?days=${days}`).then(r => r.data),
  })

  if (isLoading) return <SkeletonTable rows={5} cols={4} />
  if (error) return <div style={{ padding: 30, color: 'var(--red)' }}>Yüklenemedi: {error?.response?.data?.error || error?.message || 'Sunucu hatası'}</div>
  if (!data) return <div style={{ padding: 30, color: 'var(--text3)' }}>Veri yok</div>

  const trend = data.trend || []
  const byDept = data.by_dept || []
  const summary = data.summary || {}
  const maxTrend = Math.max(...trend.map(t => (t.shift_absent || 0) + (t.worked || 0)), 1)

  return (
    <div>
      <div style={{ marginBottom: 12, display: 'flex', gap: 6 }}>
        {[7, 30, 90, 180].map(d => (
          <button key={d} onClick={() => setDays(d)} className="btn btn-ghost btn-xs"
            style={{ borderRadius: 8, ...(days === d ? { background: 'var(--accent)', color: '#000' } : {}) }}>{d}G</button>
        ))}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10, marginBottom: 14 }}>
        <KPI label="VARDİYA DEVAMSIZ" value={summary.total_shift_absent || 0} color="var(--red)" />
        <KPI label="SERVİS BİNMEDİ" value={summary.total_no_show || 0} color="var(--red)" />
        <KPI label="DİSİPLİN KAYDI" value={summary.total_discipline || 0} color="var(--amber)" />
        <KPI label="ETKİLENEN KİŞİ" value={summary.unique_absent_staff || 0} color="var(--accent)" />
      </div>

      <Section title="VARDİYA TRENDİ (günlük)">
        <div style={{ display: 'flex', alignItems: 'flex-end', gap: 3, height: 140, overflowX: 'auto', padding: '0 4px' }}>
          {trend.map(t => {
            const totalH = ((t.worked + t.shift_absent) / maxTrend) * 120
            const absentH = t.worked + t.shift_absent > 0 ? totalH * (t.shift_absent / (t.worked + t.shift_absent)) : 0
            return (
              <div key={t.date} style={{ minWidth: 22, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }} title={`${t.date}: ${t.worked} çalıştı, ${t.shift_absent} yok`}>
                <div style={{ height: 120, display: 'flex', flexDirection: 'column-reverse', width: 18 }}>
                  <div style={{ height: (totalH - absentH), background: 'var(--green)', borderRadius: '2px 2px 0 0' }} />
                  <div style={{ height: absentH, background: 'var(--red)' }} />
                </div>
                <div style={{ fontFamily: 'var(--mono)', fontSize: 7, color: 'var(--text4)' }}>{t.date.slice(8)}</div>
              </div>
            )
          })}
        </div>
      </Section>

      <Section title={`DEPARTMAN BAZLI (${byDept.length})`}>
        {!byDept.length ? <div style={{ color: 'var(--text4)' }}>Veri yok</div> : (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
            <thead>
              <tr style={{ background: 'var(--surface2)' }}>
                <th style={{ padding: 8, textAlign: 'left', fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--text3)' }}>DEPARTMAN</th>
                <th style={{ padding: 8, textAlign: 'right', fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--green)' }}>ÇALIŞTI</th>
                <th style={{ padding: 8, textAlign: 'right', fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--red)' }}>YOK</th>
                <th style={{ padding: 8, textAlign: 'right', fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--text3)' }}>ORAN</th>
              </tr>
            </thead>
            <tbody>
              {byDept.map((d, i) => {
                const total = d.worked + d.shift_absent
                const pct = total > 0 ? Math.round(d.shift_absent / total * 100) : 0
                return (
                  <tr key={i} style={{ borderTop: '1px solid var(--border)' }}>
                    <td style={{ padding: 8, fontWeight: 600 }}>{d.dept_name}</td>
                    <td style={{ padding: 8, textAlign: 'right', fontFamily: 'var(--mono)', color: 'var(--green)' }}>{d.worked}</td>
                    <td style={{ padding: 8, textAlign: 'right', fontFamily: 'var(--mono)', color: 'var(--red)' }}>{d.shift_absent}</td>
                    <td style={{ padding: 8, textAlign: 'right', fontFamily: 'var(--mono)', fontWeight: 700, color: pct > 20 ? 'var(--red)' : pct > 10 ? 'var(--amber)' : 'var(--green)' }}>%{pct}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </Section>
    </div>
  )
}

function CostTab() {
  const thisMonth = new Date().toISOString().slice(0, 7)
  const [month, setMonth] = useState(thisMonth)
  const { data, isLoading } = useQuery({
    queryKey: ['cost-per-person', month],
    queryFn: () => api.get(`/reports/cost-per-person?month=${month}`).then(r => r.data),
  })

  function exportCsv() {
    if (!data?.rows?.length) { toast('Veri yok', 'error'); return }
    const headers = ['ID', 'Ad Soyad', 'Departman', 'Yemek Sayısı', 'Yemek Maliyeti', 'Servis Kullanımı', 'KKD Sayısı', 'Kesinti', 'Maaş']
    const rows = data.rows.map(r => [r.id, r.full_name, r.dept_name, r.meal_count, r.meal_cost, r.transport_count, r.kkd_count, r.deductions, r.salary || ''])
    const csv = [headers.join(';'), ...rows.map(row => row.join(';'))].join('\n')
    const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a'); a.href = url; a.download = `maliyet-${month}.csv`; a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div>
      <div style={{ marginBottom: 12, display: 'flex', gap: 8, alignItems: 'center', justifyContent: 'space-between' }}>
        <input type="month" className="form-input" value={month} onChange={e => setMonth(e.target.value)} style={{ width: 'auto', fontSize: 12 }} />
        <button onClick={exportCsv} className="btn btn-primary btn-sm" style={{ borderRadius: 10 }}>📊 CSV</button>
      </div>

      {isLoading ? <SkeletonTable rows={5} cols={4} /> : !data?.rows?.length ? (
        <div style={{ padding: 50, textAlign: 'center', background: 'var(--surface)', borderRadius: 14 }}>Veri yok</div>
      ) : (
        <div style={{ background: 'var(--surface)', borderRadius: 14, border: '1px solid var(--border)', overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
            <thead>
              <tr style={{ background: 'var(--surface2)' }}>
                <th style={{ padding: 8, textAlign: 'left', fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--text3)' }}>PERSONEL</th>
                <th style={{ padding: 8, textAlign: 'left', fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--text3)' }}>DEP</th>
                <th style={{ padding: 8, textAlign: 'right', fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--amber)' }}>🍽 ADET</th>
                <th style={{ padding: 8, textAlign: 'right', fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--amber)' }}>YMK ₺</th>
                <th style={{ padding: 8, textAlign: 'right', fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--accent)' }}>🚌 BİN</th>
                <th style={{ padding: 8, textAlign: 'right', fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--purple)' }}>🦺 KKD</th>
                <th style={{ padding: 8, textAlign: 'right', fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--red)' }}>KSN ₺</th>
                <th style={{ padding: 8, textAlign: 'right', fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--text3)' }}>MAAŞ</th>
              </tr>
            </thead>
            <tbody>
              {data.rows.map(r => (
                <tr key={r.id} style={{ borderTop: '1px solid var(--border)' }}>
                  <td style={{ padding: 8 }}><strong>{r.full_name}</strong></td>
                  <td style={{ padding: 8, fontFamily: 'var(--mono)', fontSize: 10 }}>{r.dept_name || '—'}</td>
                  <td style={{ padding: 8, textAlign: 'right', fontFamily: 'var(--mono)' }}>{r.meal_count}</td>
                  <td style={{ padding: 8, textAlign: 'right', fontFamily: 'var(--mono)', color: 'var(--amber)' }}>{r.meal_cost?.toFixed(2) || '—'}</td>
                  <td style={{ padding: 8, textAlign: 'right', fontFamily: 'var(--mono)', color: 'var(--accent)' }}>{r.transport_count}</td>
                  <td style={{ padding: 8, textAlign: 'right', fontFamily: 'var(--mono)', color: 'var(--purple)' }}>{r.kkd_count}</td>
                  <td style={{ padding: 8, textAlign: 'right', fontFamily: 'var(--mono)', color: r.deductions > 0 ? 'var(--red)' : 'var(--text4)' }}>{r.deductions > 0 ? '-' + r.deductions.toFixed(2) : '—'}</td>
                  <td style={{ padding: 8, textAlign: 'right', fontFamily: 'var(--mono)', color: 'var(--text3)' }}>{r.salary ? `${r.salary}` : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

function ComparisonTab() {
  const thisMonth = new Date().toISOString().slice(0, 7)
  const [month, setMonth] = useState(thisMonth)
  const { data, isLoading } = useQuery({
    queryKey: ['comparison', month],
    queryFn: () => api.get(`/reports/comparison?month=${month}`).then(r => r.data),
  })

  if (isLoading || !data) return <SkeletonTable rows={5} cols={4} />

  const METRICS = [
    ['worked', '✅ Çalışılan Gün', 'var(--green)'],
    ['absent', '❌ Devamsızlık', 'var(--red)'],
    ['no_show', '🚌 Servis Binmedi', 'var(--red)'],
    ['discipline', '⚠ Disiplin Kayıt', 'var(--amber)'],
    ['maintenance', '🔧 Bakım Talebi', 'var(--accent)'],
    ['meals', '🍽 Yemek Sayım', 'var(--purple)'],
    ['active_staff', '👥 Aktif Personel', 'var(--blue)'],
  ]

  return (
    <div>
      <div style={{ marginBottom: 12, display: 'flex', gap: 8, alignItems: 'center' }}>
        <input type="month" className="form-input" value={month} onChange={e => setMonth(e.target.value)} style={{ width: 'auto', fontSize: 12 }} />
        <span style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--text3)' }}>VS {data.previous_month}</span>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 10 }}>
        {METRICS.map(([k, l, c]) => {
          const m = data.delta?.[k]
          if (!m) return null
          const diff = m.diff || 0
          const isPositive = (k === 'worked' || k === 'meals' || k === 'active_staff') ? diff > 0 : diff < 0
          const arrowColor = diff === 0 ? 'var(--text3)' : isPositive ? 'var(--green)' : 'var(--red)'
          return (
            <div key={k} style={{ padding: 14, background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, borderLeft: `4px solid ${c}` }}>
              <div style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--text3)' }}>{l}</div>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginTop: 6 }}>
                <span style={{ fontFamily: 'var(--display)', fontSize: 24, color: c }}>{m.current ?? 0}</span>
                <span style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--text3)' }}>vs {m.previous ?? 0}</span>
              </div>
              <div style={{ marginTop: 4, fontFamily: 'var(--mono)', fontSize: 11, color: arrowColor }}>
                {diff > 0 && '↑'}{diff < 0 && '↓'}{diff === 0 && '='} {Math.abs(diff)}
                {m.pct != null && <span style={{ marginLeft: 6 }}>(%{m.pct > 0 ? '+' : ''}{m.pct})</span>}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

const ALL_COLS = {
  full_name: 'Ad Soyad', tc_no: 'TC No', phone: 'Telefon', email: 'E-posta',
  position: 'Pozisyon', hire_date: 'İşe Giriş', contract_end: 'Sözleşme Bitiş',
  birth_date: 'Doğum', blood_type: 'Kan Grubu', gender: 'Cinsiyet',
  salary: 'Maaş', dept_name: 'Departman', pickup_name: 'Durak', company_name: 'Firma',
}

function BuilderTab() {
  const [selected, setSelected] = useState(['full_name', 'dept_name', 'phone', 'position'])

  const { data, isLoading } = useQuery({
    queryKey: ['staff-builder', selected.join(',')],
    queryFn: () => api.get(`/reports/staff-builder?cols=${selected.join(',')}`).then(r => r.data),
  })

  function toggleCol(c) {
    setSelected(s => s.includes(c) ? s.filter(x => x !== c) : [...s, c])
  }

  function exportCsv() {
    if (!data?.rows?.length) { toast('Veri yok', 'error'); return }
    const headers = selected.map(c => ALL_COLS[c] || c)
    const csv = [headers.join(';'), ...data.rows.map(r => selected.map(c => r[c] ?? '').join(';'))].join('\n')
    const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a'); a.href = url; a.download = 'personel-ozel.csv'; a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div>
      <div style={{ marginBottom: 14, padding: 14, background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12 }}>
        <div style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--text3)', letterSpacing: 1.5, marginBottom: 8 }}>
          KOLON SEÇ ({selected.length} seçili)
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {Object.entries(ALL_COLS).map(([k, v]) => {
            const on = selected.includes(k)
            return (
              <button key={k} onClick={() => toggleCol(k)} style={{
                padding: '6px 10px', borderRadius: 8, border: 'none', cursor: 'pointer',
                background: on ? 'var(--accent)' : 'var(--surface2)',
                color: on ? '#000' : 'var(--text3)',
                fontSize: 11, fontFamily: 'var(--mono)',
              }}>{on ? '✓ ' : ''}{v}</button>
            )
          })}
        </div>
      </div>

      <div style={{ marginBottom: 10, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--text3)' }}>{data?.rows?.length || 0} kayıt</span>
        <button onClick={exportCsv} className="btn btn-primary btn-sm" style={{ borderRadius: 10 }}>📊 CSV İNDİR</button>
      </div>

      {isLoading ? <SkeletonTable rows={5} cols={4} /> : (
        <div style={{ background: 'var(--surface)', borderRadius: 14, border: '1px solid var(--border)', overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
            <thead>
              <tr style={{ background: 'var(--surface2)' }}>
                {selected.map(c => (
                  <th key={c} style={{ padding: 8, textAlign: 'left', fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--text3)', letterSpacing: 1 }}>
                    {ALL_COLS[c]}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {(data?.rows || []).slice(0, 300).map(r => (
                <tr key={r.id} style={{ borderTop: '1px solid var(--border)' }}>
                  {selected.map(c => (
                    <td key={c} style={{ padding: 8, fontFamily: c.includes('name') ? 'inherit' : 'var(--mono)', fontSize: c.includes('name') ? 12 : 10 }}>
                      {r[c] ?? '—'}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

function KPI({ label, value, color }) {
  return (
    <div style={{ padding: 14, background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12 }}>
      <div style={{ fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--text3)', letterSpacing: 1.5 }}>{label}</div>
      <div style={{ fontFamily: 'var(--display)', fontSize: 24, color, marginTop: 4 }}>{value}</div>
    </div>
  )
}

function Section({ title, children }) {
  return (
    <div style={{ marginBottom: 14, padding: 14, background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12 }}>
      <div style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--text3)', letterSpacing: 2, marginBottom: 10 }}>{title}</div>
      {children}
    </div>
  )
}
