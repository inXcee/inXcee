import { useState } from 'react'
import { useAuthStore } from '../../shared/store/authStore.js'

const API_BASE = '/api'

const REPORTS = [
  {
    id: 'housekeeping',
    title: 'Gunluk Temizlik Raporu',
    description: 'Temizlik gorevleri, tamamlanan ve atlanan isler',
    icon: '\u25C8',
    color: 'var(--green)',
    endpoint: '/reports/housekeeping',
    hasDate: true,
  },
  {
    id: 'maintenance',
    title: 'Haftalik Bakim Ozeti',
    description: 'Son 7 gun — acik/kapanan talepler, SLA durumu',
    icon: '\u2699',
    color: 'var(--blue)',
    endpoint: '/reports/maintenance',
    hasDate: false,
  },
  {
    id: 'occupancy',
    title: 'Aylik Doluluk Raporu',
    description: 'Blok bazli doluluk, firma bazli personel dagilimi',
    icon: '\u229E',
    color: 'var(--purple)',
    endpoint: '/reports/occupancy',
    hasDate: false,
  },
  {
    id: 'discipline',
    title: 'Aylik Disiplin Raporu',
    description: 'Son 30 gun — sari/kirmizi kart kayitlari',
    icon: '\u26A0',
    color: 'var(--accent)',
    endpoint: '/reports/discipline',
    hasDate: false,
  },
]

export default function ReportsPage() {
  const token = useAuthStore(s => s.token)
  const [downloading, setDownloading] = useState(null)
  const [selectedDate, setSelectedDate] = useState(() => new Date().toISOString().split('T')[0])

  async function downloadReport(report) {
    setDownloading(report.id)
    try {
      const url = report.hasDate
        ? `${API_BASE}${report.endpoint}?date=${selectedDate}`
        : `${API_BASE}${report.endpoint}`

      const res = await fetch(url, {
        headers: { Authorization: `Bearer ${token}` },
      })

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
      setDownloading(null)
    }
  }

  return (
    <div>
      {/* Header */}
      <div className="fade-up" style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '24px', flexWrap: 'wrap', gap: '12px' }}>
        <div>
          <h2 style={{ fontSize: '28px', letterSpacing: '4px' }}>RAPORLAR</h2>
          <p style={{ fontFamily: 'var(--mono)', fontSize: '10px', color: 'var(--text3)', letterSpacing: '1px', marginTop: '4px' }}>
            PDF RAPOR INDIRME MERKEZI
          </p>
        </div>

        {/* Date picker for housekeeping */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <label style={{ fontFamily: 'var(--mono)', fontSize: '9px', color: 'var(--text3)', letterSpacing: '1px' }}>TARIH</label>
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

      {/* Report cards */}
      <div className="fade-up-1" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '16px' }}>
        {REPORTS.map(report => (
          <div key={report.id} className="panel" style={{ overflow: 'hidden' }}>
            <div style={{ height: '3px', background: report.color }} />
            <div style={{ padding: '20px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '12px' }}>
                <div style={{
                  width: '40px', height: '40px', borderRadius: '8px',
                  background: `${report.color}22`, border: `1px solid ${report.color}44`,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: '18px',
                }}>
                  {report.icon}
                </div>
                <div>
                  <div style={{ fontFamily: 'var(--display)', fontSize: '14px', letterSpacing: '2px', color: 'var(--text)' }}>
                    {report.title}
                  </div>
                  <div style={{ fontFamily: 'var(--mono)', fontSize: '10px', color: 'var(--text3)', marginTop: '2px' }}>
                    {report.description}
                  </div>
                </div>
              </div>

              {report.hasDate && (
                <div style={{
                  background: 'var(--surface2)', borderRadius: '6px', padding: '8px 10px',
                  border: '1px solid var(--border)', marginBottom: '12px',
                  fontFamily: 'var(--mono)', fontSize: '10px', color: 'var(--text2)',
                }}>
                  Secilen tarih: {selectedDate}
                </div>
              )}

              <button
                onClick={() => downloadReport(report)}
                disabled={downloading === report.id}
                className="btn"
                style={{
                  width: '100%', padding: '10px',
                  background: downloading === report.id ? 'var(--surface3)' : report.color,
                  color: '#000', fontFamily: 'var(--mono)', fontSize: '11px',
                  letterSpacing: '1.5px', border: 'none', borderRadius: '6px',
                  cursor: downloading === report.id ? 'wait' : 'pointer',
                  opacity: downloading === report.id ? 0.7 : 1,
                  transition: 'all 0.15s',
                }}
              >
                {downloading === report.id ? 'INDIRILIYOR...' : 'PDF INDIR'}
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
