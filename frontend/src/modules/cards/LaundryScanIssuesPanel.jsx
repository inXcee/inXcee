import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import api from '../../shared/api/client.js'

const RESULT_OPTIONS = [
  ['', 'Tüm sorunlar'],
  ['mismatch', 'Başka oda kartı'],
  ['unknown_card', 'Tanımsız kart'],
  ['inactive', 'Pasif / kayıp / iptal'],
  ['override', 'Gerekçeli geçiş'],
]

const RESULT_META = {
  mismatch: ['EŞLEŞMEDİ', '#b45309', '#fef3c7'],
  unknown_card: ['TANIMSIZ', '#dc2626', '#fee2e2'],
  inactive: ['PASİF', '#dc2626', '#fee2e2'],
  override: ['GEREKÇELİ', '#7c3aed', '#ede9fe'],
}

function isoDate(date) { return date.toISOString().slice(0, 10) }

export default function LaundryScanIssuesPanel() {
  const [filters, setFilters] = useState(() => {
    const now = new Date()
    const from = new Date(now)
    from.setDate(from.getDate() - 30)
    return { from: isoDate(from), to: isoDate(now), result: '' }
  })
  const params = useMemo(() => {
    const query = new URLSearchParams({ from: filters.from, to: filters.to, limit: '500' })
    if (filters.result) query.set('result', filters.result)
    return query.toString()
  }, [filters])

  const issues = useQuery({ queryKey: ['laundry-card-scans', params], queryFn: () => api.get(`/laundry/card-scans?${params}`).then(response => response.data) })
  const stats = useQuery({ queryKey: ['laundry-card-scan-stats', filters.from, filters.to], queryFn: () => api.get(`/laundry/card-scan-stats?from=${filters.from}&to=${filters.to}`).then(response => response.data) })
  const data = stats.data || {}
  const rows = issues.data?.items || []

  return (
    <div className="fade-up-1">
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 10, marginBottom: 14 }}>
        <Kpi label="TOPLAM OKUTMA" value={data.total ?? '—'} />
        <Kpi label="BAŞARI ORANI" value={data.success_ratio == null ? '—' : `%${Math.round(data.success_ratio * 100)}`} color="#16a34a" />
        <Kpi label="EŞLEŞMEYEN" value={data.mismatch ?? '—'} color="#b45309" />
        <Kpi label="TANIMSIZ / PASİF" value={data.available === false ? '—' : (data.unknown_card || 0) + (data.inactive || 0)} color="#dc2626" />
        <Kpi label="GEREKÇELİ" value={data.override ?? '—'} color="#7c3aed" />
      </div>

      <div className="panel" style={{ marginBottom: 14 }}>
        <div className="panel-header"><div className="panel-title">FİLTRELER</div><span style={muted}>En fazla 500 kayıt</span></div>
        <div className="panel-body" style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'end' }}>
          <Filter label="BAŞLANGIÇ"><input className="form-input" aria-label="Okutma başlangıç tarihi" type="date" value={filters.from} onChange={event => setFilters(current => ({ ...current, from: event.target.value }))} /></Filter>
          <Filter label="BİTİŞ"><input className="form-input" aria-label="Okutma bitiş tarihi" type="date" value={filters.to} onChange={event => setFilters(current => ({ ...current, to: event.target.value }))} /></Filter>
          <Filter label="SONUÇ"><select className="form-input" aria-label="Okutma sonuç filtresi" value={filters.result} onChange={event => setFilters(current => ({ ...current, result: event.target.value }))}>{RESULT_OPTIONS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></Filter>
          <button className="btn btn-xs" onClick={() => { issues.refetch(); stats.refetch() }}>↻ Yenile</button>
        </div>
      </div>

      <div className="panel" style={{ overflow: 'hidden' }}>
        <div className="panel-header"><div className="panel-title">SORUNLU OKUTMALAR</div><span style={muted}>{rows.length} kayıt</span></div>
        {issues.isLoading ? <div style={{ padding: 24, ...muted }}>Yükleniyor…</div> : issues.data?.available === false ? <div style={{ padding: 24, color: '#dc2626' }}>{issues.data.reason}</div> : rows.length === 0 ? <div style={{ padding: 30, textAlign: 'center', ...muted }}>Seçilen aralıkta sorunlu okutma yok</div> : (
          <div style={{ overflowX: 'auto' }}>
            <table className="data-table" style={{ minWidth: 980, width: '100%' }}>
              <thead><tr><th>SONUÇ</th><th>KART SAHİBİ</th><th>ODA</th><th>İŞLEM</th><th>TORBA</th><th>OPERATÖR</th><th>TARİH</th><th>GEREKÇE / KOD</th></tr></thead>
              <tbody>{rows.map(row => {
                const meta = RESULT_META[row.result] || [row.result, 'var(--text)', 'var(--surface2)']
                return <tr key={row.id}>
                  <td><span style={{ fontFamily: 'var(--mono)', fontSize: 9, padding: '3px 7px', borderRadius: 5, color: meta[1], background: meta[2] }}>{meta[0]}</span></td>
                  <td>{row.card_holder_name || '—'}</td>
                  <td>{row.block && row.room_no ? `${row.block}/${row.room_no}` : '—'}</td>
                  <td>{row.action === 'intake' ? 'Kabul' : 'Teslim'}</td>
                  <td>{row.bag_no || (row.item_id ? `#${row.item_id}` : '—')}</td>
                  <td>{row.operator_name || row.worker_name || '—'}</td>
                  <td style={{ whiteSpace: 'nowrap' }}>{row.created_at ? new Date(`${row.created_at.replace(' ', 'T')}Z`).toLocaleString('tr-TR') : '—'}</td>
                  <td style={{ maxWidth: 240 }}>{row.override_reason || row.scanned_code || '—'}</td>
                </tr>
              })}</tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}

function Filter({ label, children }) { return <label style={{ minWidth: 170 }}><span className="form-label">{label}</span>{children}</label> }
function Kpi({ label, value, color = 'var(--text)' }) { return <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: 14 }}><div style={muted}>{label}</div><div style={{ fontFamily: 'var(--display)', fontSize: 24, color, marginTop: 4 }}>{value}</div></div> }
const muted = { fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--text3)' }
