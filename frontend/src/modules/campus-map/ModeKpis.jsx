// Aktif moda göre kampüs-geneli KPI şeridi.
import { Kpi } from './shared.jsx'

export default function ModeKpis({ mode, totalStats: t }) {
  const sets = {
    occupancy: [
      ['TOPLAM YATAK', t.total_beds, 'var(--text)'],
      ['DOLU', t.occupied, '#16a34a'],
      ['BOS ODA', t.empty, 'var(--accent)'],
      ['KARANTINA', t.quarantine, '#dc2626'],
      ['BAKIM', t.maintenance, '#f59e0b'],
      ['ACIK ARIZA', t.fault, t.fault > 0 ? '#dc2626' : 'var(--text3)'],
    ],
    faults: [
      ['ACIK ARIZA', t.fault, t.fault > 0 ? '#dc2626' : 'var(--text3)'],
      ['KARANTINA', t.quarantine, '#dc2626'],
      ['BAKIM ODASI', t.maintenance, '#f59e0b'],
      ['BOS ODA', t.empty, 'var(--accent)'],
    ],
    cleaning: [
      ['BUGUN TOPLAM', t.clean_total, 'var(--text)'],
      ['TAMAMLANAN', t.clean_done, '#16a34a'],
      ['KALAN', t.clean_total - t.clean_done, '#eab308'],
      ['DOLU YATAK', t.occupied, 'var(--text3)'],
    ],
    shifts: [
      ['GUNDUZ VARDIYA', t.day, '#f97316'],
      ['GECE VARDIYA', t.night, '#8b5cf6'],
      // Vardiya kaydi olmayanlar — eskiden gunduze sayiliyordu, artik gorunur.
      ['BILINMIYOR', t.unknown || 0, (t.unknown || 0) > 0 ? '#94a3b8' : 'var(--text3)'],
      ['TOPLAM PERSONEL', t.day + t.night + (t.unknown || 0), 'var(--text)'],
    ],
    quarantine: [
      ['KARANTINA ODASI', t.quarantine, '#dc2626'],
      ['BAKIM ODASI', t.maintenance, '#f59e0b'],
      ['AKTIF ARIZA', t.fault, t.fault > 0 ? '#dc2626' : 'var(--text3)'],
    ],
    company: [
      ['TOPLAM PERSONEL', t.occupied, 'var(--text)'],
      ['DOLU YATAK', t.occupied, '#16a34a'],
      ['BOS', t.empty, 'var(--accent)'],
    ],
  }
  const items = sets[mode] || sets.occupancy
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(110px, 1fr))', gap: 8, marginBottom: 10 }}>
      {items.map(([label, value, color]) => <Kpi key={label} label={label} value={value} color={color} />)}
    </div>
  )
}
