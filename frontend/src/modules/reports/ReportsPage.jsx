import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useAuthStore } from '../../shared/store/authStore.js'
import api from '../../shared/api/client.js'

const API_BASE = '/api'

const REPORTS = [
  {
    id: 'housekeeping',
    title: 'Gunluk Temizlik Raporu',
    description: 'Temizlik gorevleri, tamamlanan ve atlanan isler',
    icon: '◈',
    color: 'var(--green)',
    endpoint: '/reports/housekeeping',
    dataEndpoint: '/reports/housekeeping/data',
    hasDate: true,
    summaryKeys: [
      { key: 'done', label: 'TAMAMLANDI', color: 'var(--green)' },
      { key: 'skipped', label: 'ATLANDI', color: 'var(--red)' },
      { key: 'pending', label: 'BEKLİYOR', color: 'var(--accent)' },
    ],
    tableColumns: ['Alan', 'Blok', 'Kat', 'Durum', 'Temizlikçi', 'Açıklama'],
    tableRow: t => [t.area, t.block || '-', t.floor || '-', t.durum, t.temizlikci, t.aciklama],
    dataKey: 'tasks',
  },
  {
    id: 'maintenance',
    title: 'Haftalik Bakim Ozeti',
    description: 'Son 7 gun — acik/kapanan talepler, SLA durumu',
    icon: '⚙',
    color: 'var(--blue)',
    endpoint: '/reports/maintenance',
    dataEndpoint: '/reports/maintenance/data',
    hasDate: false,
    summaryKeys: [
      { key: 'open', label: 'AÇIK', color: 'var(--red)' },
      { key: 'closed', label: 'KAPANDI', color: 'var(--green)' },
      { key: 'overdue', label: 'SLA AŞILDI', color: 'var(--accent)' },
    ],
    tableColumns: ['#', 'Konum', 'Öncelik', 'Durum', 'Teknisyen', 'SLA'],
    tableRow: r => [r.id, r.location, r.priority, r.durum, r.teknisyen, r.sla],
    dataKey: 'requests',
  },
  {
    id: 'occupancy',
    title: 'Aylik Doluluk Raporu',
    description: 'Blok bazli doluluk, firma bazli personel dagilimi',
    icon: '⊞',
    color: 'var(--purple)',
    endpoint: '/reports/occupancy',
    dataEndpoint: '/reports/occupancy/data',
    hasDate: false,
    summaryKeys: [
      { key: 'totals.dolu', label: 'DOLU YATAK', color: 'var(--accent)' },
      { key: 'totals.yatak', label: 'TOPLAM YATAK', color: 'var(--text)' },
      { key: 'totals.oda', label: 'TOPLAM ODA', color: 'var(--blue)' },
    ],
    tableColumns: ['Blok', 'Oda', 'Toplam Yatak', 'Dolu', 'Boş', 'Doluluk %'],
    tableRow: b => [
      b.block, b.oda_sayisi, b.toplam_yatak, b.dolu_yatak,
      b.toplam_yatak - b.dolu_yatak,
      `%${b.toplam_yatak ? Math.round(b.dolu_yatak / b.toplam_yatak * 100) : 0}`,
    ],
    dataKey: 'blocks',
  },
  {
    id: 'discipline',
    title: 'Aylik Disiplin Raporu',
    description: 'Son 30 gun — sari/kirmizi kart kayitlari',
    icon: '⚠',
    color: 'var(--accent)',
    endpoint: '/reports/discipline',
    dataEndpoint: '/reports/discipline/data',
    hasDate: false,
    summaryKeys: [
      { key: 'total', label: 'TOPLAM KART', color: 'var(--accent)' },
    ],
    tableColumns: ['Personel', 'Firma', 'Kart', 'Sebep', 'Yazan', 'Tarih'],
    tableRow: r => [
      r.full_name, r.company || '-',
      r.card_type === 'yellow' ? 'Sarı' : 'Kırmızı',
      (r.reason || '-').substring(0, 40),
      r.created_by_name || '-',
      r.created_at?.split('T')[0] || '-',
    ],
    dataKey: 'records',
  },
]

function getNestedValue(obj, key) {
  return key.split('.').reduce((o, k) => o?.[k], obj)
}

function ReportCard({ report, selectedDate }) {
  const token = useAuthStore(s => s.token)
  const [downloading, setDownloading] = useState(null)
  const [expanded, setExpanded] = useState(false)

  const queryKey = report.hasDate
    ? [report.id, 'data', selectedDate]
    : [report.id, 'data']

  const dataUrl = report.hasDate
    ? `${report.dataEndpoint}?date=${selectedDate}`
    : report.dataEndpoint

  const { data: reportData, isLoading } = useQuery({
    queryKey,
    queryFn: () => api.get(dataUrl).then(r => r.data),
    staleTime: 2 * 60 * 1000,
  })

  async function downloadPDF() {
    setDownloading(true)
    try {
      const url = report.hasDate
        ? `${API_BASE}${report.endpoint}?date=${selectedDate}`
        : `${API_BASE}${report.endpoint}`
      const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const blob = await res.blob()
      const link = document.createElement('a')
      link.href = URL.createObjectURL(blob)
      link.download = `${report.id}-rapor-${selectedDate}.pdf`
      link.click()
      URL.revokeObjectURL(link.href)
    } catch (e) {
      alert('Rapor indirilemedi: ' + e.message)
    } finally {
      setDownloading(false)
    }
  }

  const rows = reportData ? (reportData[report.dataKey] || []) : []

  return (
    <div className="panel" style={{ overflow: 'hidden' }}>
      <div style={{ height: '3px', background: report.color }} />
      <div style={{ padding: '20px' }}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '12px' }}>
          <div style={{
            width: '40px', height: '40px', borderRadius: '8px',
            background: `${report.color}22`, border: `1px solid ${report.color}44`,
            display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '18px',
          }}>
            {report.icon}
          </div>
          <div>
            <div style={{ fontFamily: 'var(--display)', fontSize: '14px', letterSpacing: '2px' }}>
              {report.title}
            </div>
            <div style={{ fontFamily: 'var(--mono)', fontSize: '10px', color: 'var(--text3)', marginTop: '2px' }}>
              {report.description}
            </div>
          </div>
        </div>

        {/* Summary numbers */}
        {isLoading ? (
          <div style={{ fontFamily: 'var(--mono)', fontSize: '10px', color: 'var(--text3)', marginBottom: '12px' }}>
            Yükleniyor...
          </div>
        ) : reportData ? (
          <div style={{ display: 'flex', gap: '8px', marginBottom: '12px', flexWrap: 'wrap' }}>
            {report.summaryKeys.map(sk => (
              <div key={sk.key} style={{
                flex: 1, minWidth: '60px',
                padding: '8px 10px', background: 'var(--surface2)',
                border: '1px solid var(--border)', borderRadius: '6px', textAlign: 'center',
              }}>
                <div style={{ fontFamily: 'var(--display)', fontSize: '22px', color: sk.color, lineHeight: 1 }}>
                  {getNestedValue(reportData, sk.key) ?? '—'}
                </div>
                <div style={{ fontFamily: 'var(--mono)', fontSize: '7px', color: 'var(--text3)', letterSpacing: '1px', marginTop: '3px' }}>
                  {sk.label}
                </div>
              </div>
            ))}
          </div>
        ) : null}

        {/* Action buttons */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', marginBottom: rows.length > 0 && expanded ? '12px' : '0' }}>
          <button
            onClick={() => setExpanded(v => !v)}
            style={{
              padding: '9px', background: 'var(--surface2)',
              border: '1px solid var(--border)', borderRadius: '6px',
              color: 'var(--text2)', fontFamily: 'var(--mono)', fontSize: '10px',
              letterSpacing: '1px', cursor: 'pointer', transition: 'all 0.15s',
            }}
          >
            {expanded ? '▲ GİZLE' : '▼ DETAYLAR'}
          </button>
          <button
            onClick={downloadPDF}
            disabled={!!downloading}
            style={{
              padding: '9px',
              background: downloading ? 'var(--surface3)' : report.color,
              border: 'none', borderRadius: '6px',
              color: '#000', fontFamily: 'var(--mono)', fontSize: '10px',
              letterSpacing: '1px', cursor: downloading ? 'wait' : 'pointer',
              opacity: downloading ? 0.7 : 1, transition: 'all 0.15s',
            }}
          >
            {downloading ? 'İNDİRİLİYOR...' : 'PDF İNDİR'}
          </button>
        </div>

        {/* Expandable table */}
        {expanded && rows.length > 0 && (
          <div style={{ marginTop: '12px', overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontFamily: 'var(--mono)', fontSize: '10px' }}>
              <thead>
                <tr>
                  {report.tableColumns.map(col => (
                    <th key={col} style={{
                      padding: '6px 8px', textAlign: 'left',
                      borderBottom: '1px solid var(--border)',
                      color: 'var(--text3)', letterSpacing: '1px', fontWeight: 'normal',
                    }}>
                      {col.toUpperCase()}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((row, i) => (
                  <tr key={i} style={{ borderBottom: '1px solid var(--border)', opacity: 0.9 }}>
                    {report.tableRow(row).map((cell, j) => (
                      <td key={j} style={{ padding: '6px 8px', color: 'var(--text2)' }}>
                        {cell}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {expanded && rows.length === 0 && !isLoading && (
          <div style={{ marginTop: '12px', padding: '12px', textAlign: 'center', fontFamily: 'var(--mono)', fontSize: '10px', color: 'var(--text3)' }}>
            Bu dönem için veri yok
          </div>
        )}
      </div>
    </div>
  )
}

export default function ReportsPage() {
  const [selectedDate, setSelectedDate] = useState(() => new Date().toISOString().split('T')[0])

  return (
    <div>
      <div className="fade-up" style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '24px', flexWrap: 'wrap', gap: '12px' }}>
        <div>
          <h2 style={{ fontSize: '28px', letterSpacing: '4px' }}>RAPORLAR</h2>
          <p style={{ fontFamily: 'var(--mono)', fontSize: '10px', color: 'var(--text3)', letterSpacing: '1px', marginTop: '4px' }}>
            İNTERAKTİF RAPOR MERKEZİ
          </p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <label style={{ fontFamily: 'var(--mono)', fontSize: '9px', color: 'var(--text3)', letterSpacing: '1px' }}>TARİH</label>
          <input
            type="date"
            value={selectedDate}
            onChange={e => setSelectedDate(e.target.value)}
            style={{
              background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: '6px',
              color: 'var(--text)', fontFamily: 'var(--mono)', fontSize: '12px', padding: '6px 10px',
            }}
          />
        </div>
      </div>

      <div className="fade-up-1" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: '16px' }}>
        {REPORTS.map(report => (
          <ReportCard key={report.id} report={report} selectedDate={selectedDate} />
        ))}
      </div>
    </div>
  )
}
