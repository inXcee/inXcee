import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useAuthStore } from '../../shared/store/authStore.js'
import HelpHint from '../../shared/components/HelpHint.jsx'
import { useUrlParamState } from '../../shared/hooks/useUrlParamState.js'
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
  // ── Yeni raporlar ──
  {
    id: 'executive',
    title: 'Yönetici Özet Raporu',
    description: 'Tüm modüllerden derlenmiş tek bakış — KPI özeti',
    icon: '◉',
    color: 'var(--accent)',
    endpoint: '/reports/executive',
    dataEndpoint: '/reports/executive/data',
    hasDate: false,
    summaryKeys: [
      { key: 'occupancy.rate', label: 'DOLULUK %', color: 'var(--accent)' },
      { key: 'maintenance_open', label: 'AÇIK ARIZA', color: 'var(--red)' },
      { key: 'active_visitors', label: 'ZİYARETÇİ', color: 'var(--blue)' },
    ],
    tableColumns: [],
    tableRow: () => [],
    dataKey: null,
    noDetail: true,
  },
  {
    id: 'companies',
    title: 'Firma & Sözleşme Raporu',
    description: 'Aktif firmalar, sözleşme bitişleri, yatak kotaları',
    icon: '⌂',
    color: 'var(--green)',
    endpoint: '/reports/companies',
    dataEndpoint: '/reports/companies/data',
    hasDate: false,
    summaryKeys: [
      { key: 'active', label: 'AKTİF', color: 'var(--green)' },
      { key: 'expiring_soon', label: 'YAKLAŞAN', color: 'var(--accent)' },
      { key: 'expired', label: 'GEÇMİŞ', color: 'var(--red)' },
    ],
    tableColumns: ['Firma', 'Yetkili', 'Yatak', 'Aktif', 'Sözleşme Bitiş', 'Kalan'],
    tableRow: c => [
      c.name, c.contact_name || '-',
      c.bed_quota ?? '-', c.active_personnel,
      c.contract_end || '-',
      c.days_left == null ? '-' : c.days_left < 0 ? `${Math.abs(c.days_left)}g geçti` : `${c.days_left}g`,
    ],
    dataKey: 'companies',
  },
  {
    id: 'surveys',
    title: 'Memnuniyet Raporu',
    description: 'Son 30 gün — sakin geribildirim ortalamaları',
    icon: '★',
    color: 'var(--green)',
    endpoint: '/reports/surveys',
    dataEndpoint: '/reports/surveys/data',
    hasDate: false,
    summaryKeys: [
      { key: 'summary.total', label: 'CEVAP', color: 'var(--text)' },
      { key: 'summary.avg_overall', label: 'GENEL', color: 'var(--accent)' },
      { key: 'summary.avg_cleaning', label: 'TEMİZLİK', color: 'var(--green)' },
    ],
    tableColumns: ['Tarih', 'Kişi', 'Genel', 'Oda', 'Temizlik', 'Yemek', 'Yorum'],
    tableRow: r => [
      r.created_at?.slice(0, 10) || '-',
      r.full_name || 'anonim',
      r.overall_score ?? '-', r.room_score ?? '-', r.cleaning_score ?? '-', r.food_score ?? '-',
      (r.comment || '').substring(0, 30),
    ],
    dataKey: 'recent',
  },
  {
    id: 'drills',
    title: 'Tatbikat Raporu',
    description: 'Son 365 gün — yangın/deprem/güvenlik tatbikatları',
    icon: '🔥',
    color: 'var(--red)',
    endpoint: '/reports/drills',
    dataEndpoint: '/reports/drills/data',
    hasDate: false,
    summaryKeys: [
      { key: 'total', label: 'TATBİKAT', color: 'var(--text)' },
      { key: 'avg_attendance_pct', label: 'KATILIM %', color: 'var(--green)' },
    ],
    tableColumns: ['Tarih', 'Tip', 'Beklenen', 'Fiili', 'Süre', 'Bulgular'],
    tableRow: r => [
      r.drill_date, r.drill_type,
      r.expected_count ?? '-', r.actual_count ?? '-',
      r.duration_minutes ? `${r.duration_minutes}dk` : '-',
      (r.findings || '').substring(0, 30),
    ],
    dataKey: 'records',
  },
  {
    id: 'visitors',
    title: 'Ziyaretçi Raporu',
    description: 'Son 30 gün — misafir giriş/çıkış kayıtları',
    icon: '👥',
    color: 'var(--blue)',
    endpoint: '/reports/visitors',
    dataEndpoint: '/reports/visitors/data',
    hasDate: false,
    summaryKeys: [
      { key: 'total', label: 'TOPLAM', color: 'var(--text)' },
      { key: 'active', label: 'İÇERİDE', color: 'var(--green)' },
      { key: 'avg_minutes', label: 'ORT. (dk)', color: 'var(--blue)' },
    ],
    tableColumns: ['Tarih', 'Ad Soyad', 'Telefon', 'Sebep', 'Blok', 'Durum'],
    tableRow: r => [
      r.check_in_at?.slice(0, 16) || '-',
      r.full_name,
      r.phone || '-',
      (r.purpose || '').substring(0, 20),
      r.visiting_block || '-',
      r.check_out_at ? 'Çıktı' : 'İçeride',
    ],
    dataKey: 'records',
  },
  {
    id: 'personnel',
    title: 'Personel Listesi',
    description: 'Tüm aktif personel — CSV indir (Excel uyumlu)',
    icon: '👤',
    color: 'var(--text)',
    endpoint: '/reports/personnel',
    dataEndpoint: '/reports/personnel/data',
    hasDate: false,
    format: 'csv',
    summaryKeys: [
      { key: 'total', label: 'TOPLAM', color: 'var(--text)' },
      { key: 'with_room', label: 'ODALI', color: 'var(--green)' },
      { key: 'with_zimmet', label: 'ZİMMETLİ', color: 'var(--red)' },
      { key: 'blacklisted', label: 'KARALİSTE', color: 'var(--accent)' },
    ],
    tableColumns: [],
    tableRow: () => [],
    dataKey: null,
    noDetail: true,
  },
  {
    id: 'inventory',
    title: 'Envanter Raporu',
    description: 'Zengin PDF + 2 ek CSV (kalemler / 30 gün hareketler)',
    icon: '📦',
    color: 'var(--blue)',
    endpoint: '/reports/inventory',
    dataEndpoint: '/reports/inventory/data',
    hasDate: false,
    summaryKeys: [
      { key: 'total', label: 'KALEM', color: 'var(--text)' },
      { key: 'out_of_stock', label: 'STOK YOK', color: 'var(--red)' },
      { key: 'below_threshold', label: 'YETERSİZ', color: 'var(--accent)' },
      { key: 'total_value', label: 'DEĞER (₺)', color: 'var(--green)' },
    ],
    extraDownloads: [
      { label: 'Tüm Kalemler CSV', endpoint: '/reports/inventory.csv', ext: 'csv' },
      { label: '30g Hareketler CSV', endpoint: '/reports/inventory/movements.csv', ext: 'csv' },
    ],
    tableColumns: [],
    tableRow: () => [],
    dataKey: null,
    noDetail: true,
  },
  {
    id: 'laundry',
    title: 'Çamaşırhane Raporu',
    description: 'Son 30 gün işlem geçmişi + makine durumu',
    icon: '◎',
    color: 'var(--purple)',
    endpoint: '/reports/laundry',
    dataEndpoint: '/reports/laundry/data',
    hasDate: false,
    summaryKeys: [
      { key: 'total', label: 'İŞLEM', color: 'var(--text)' },
      { key: 'delivered', label: 'TESLİM', color: 'var(--green)' },
      { key: 'lost', label: 'KAYIP', color: 'var(--red)' },
      { key: 'machine_count', label: 'MAKİNE', color: 'var(--blue)' },
    ],
    tableColumns: [],
    tableRow: () => [],
    dataKey: null,
    noDetail: true,
  },
  {
    id: 'shifts',
    title: 'Vardiya Raporu',
    description: 'Blok x vardiya dağılımı + gece personeli listesi',
    icon: '⧗',
    color: 'var(--blue)',
    endpoint: '/reports/shifts',
    dataEndpoint: '/reports/shifts/data',
    hasDate: false,
    summaryKeys: [
      { key: 'total', label: 'AKTİF', color: 'var(--text)' },
      { key: 'day', label: 'GÜNDÜZ', color: 'var(--accent)' },
      { key: 'night', label: 'GECE', color: 'var(--blue)' },
      { key: 'night_list_count', label: 'GECE PER.', color: 'var(--text2)' },
    ],
    tableColumns: [],
    tableRow: () => [],
    dataKey: null,
    noDetail: true,
  },
  {
    id: 'expenses',
    title: 'Bütçe / Gider Raporu',
    description: 'Son 3 ay — kategori dağılımı, aylık trend',
    icon: '₺',
    color: 'var(--accent)',
    endpoint: '/reports/expenses',
    dataEndpoint: '/reports/expenses/data',
    hasDate: false,
    summaryKeys: [
      { key: 'summary.total', label: 'BU AY (TL)', color: 'var(--accent)' },
      { key: 'summary.active_residents', label: 'AKTİF SAKİN', color: 'var(--text)' },
      { key: 'summary.per_resident', label: 'KİŞİ/AY (TL)', color: 'var(--green)' },
    ],
    tableColumns: ['Tarih', 'Kategori', 'Açıklama', 'Firma', 'Tutar'],
    tableRow: e => [
      e.expense_date, e.category,
      (e.description || '').substring(0, 25),
      e.company_name || '-',
      e.amount != null ? `${Math.round(e.amount).toLocaleString('tr-TR')} ₺` : '-',
    ],
    dataKey: 'recent',
  },
]

function getNestedValue(obj, key) {
  return key.split('.').reduce((o, k) => o?.[k], obj)
}

function ReportCard({ report, selectedDate }) {
  const token = useAuthStore(s => s.token)
  const [downloading, setDownloading] = useState(false)
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

  async function downloadFromUrl(endpoint, ext) {
    setDownloading(true)
    try {
      const url = report.hasDate ? `${API_BASE}${endpoint}?date=${selectedDate}` : `${API_BASE}${endpoint}`
      const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const blob = await res.blob()
      const link = document.createElement('a')
      link.href = URL.createObjectURL(blob)
      link.download = `${report.id}-rapor-${selectedDate}.${ext}`
      link.click()
      URL.revokeObjectURL(link.href)
    } catch (e) {
      alert('Rapor indirilemedi: ' + e.message)
    } finally {
      setDownloading(false)
    }
  }

  async function downloadPDF() {
    const ext = report.format === 'csv' ? 'csv' : 'pdf'
    await downloadFromUrl(report.endpoint, ext)
  }

  const rows = reportData && report.dataKey ? (reportData[report.dataKey] || []) : []

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
        <div style={{ display: 'grid', gridTemplateColumns: report.noDetail ? '1fr' : '1fr 1fr', gap: '8px', marginBottom: rows.length > 0 && expanded ? '12px' : '0' }}>
          {!report.noDetail && (
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
          )}
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
            {downloading ? 'İNDİRİLİYOR...' : report.format === 'csv' ? 'CSV İNDİR' : 'PDF İNDİR'}
          </button>
        </div>
        {report.extraDownloads?.length > 0 && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 8 }}>
            {report.extraDownloads.map(ed => (
              <button
                key={ed.endpoint}
                onClick={() => downloadFromUrl(ed.endpoint, ed.ext)}
                disabled={!!downloading}
                style={{
                  padding: '6px 10px', background: 'transparent',
                  border: '1px dashed var(--border)', borderRadius: 5,
                  color: 'var(--text2)', fontFamily: 'var(--mono)', fontSize: 9,
                  letterSpacing: 1, cursor: downloading ? 'wait' : 'pointer',
                }}
              >
                ↓ {ed.label.toUpperCase()}
              </button>
            ))}
          </div>
        )}

        {/* Expandable table */}
        {expanded && rows.length > 0 && (
          <div style={{ marginTop: '12px', overflowX: 'auto' }}>
            <table className="data-table responsive-stack" style={{ margin: 0, fontFamily: 'var(--mono)', fontSize: '10px' }}>
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
                      <td key={j} data-label={report.tableColumns[j]} style={{ padding: '6px 8px', color: 'var(--text2)' }}>
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
  const [selectedDate, setSelectedDate] = useUrlParamState('date', () => new Date().toISOString().split('T')[0])

  return (
    <div>
      <div className="fade-up" style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '24px', flexWrap: 'wrap', gap: '12px' }}>
        <div>
          <h2 style={{ fontSize: '28px', letterSpacing: '4px' }}>
            RAPORLAR<HelpHint topic="reports" title="RAPORLAR" />
          </h2>
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
