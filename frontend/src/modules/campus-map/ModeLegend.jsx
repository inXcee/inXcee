// Harita üzerinde sol-alt köşede aktif moda göre renk açıklaması overlay'i.
import { MODES } from './shared.jsx'

export default function ModeLegend({ mode }) {
  const sets = {
    occupancy:  [['< %60', '#16a34a'], ['%60-85', '#f59e0b'], ['> %85', '#dc2626'], ['BOS', '#6b7280']],
    faults:     [['0', '#6b7280'], ['1', '#eab308'], ['2-4', '#f59e0b'], ['5+', '#dc2626']],
    cleaning:   [['> %80', '#16a34a'], ['%40-80', '#eab308'], ['< %40', '#dc2626'], ['YOK', '#6b7280']],
    shifts:     [['GUNDUZ', '#f97316'], ['KARMA', '#3b82f6'], ['GECE', '#8b5cf6'], ['BOS', '#6b7280']],
    quarantine: [['KARANTINA', '#dc2626'], ['BAKIM', '#f59e0b'], ['NORMAL', '#6b7280']],
    company:    [['HER SIRKET FARKLI RENK', '#a855f7'], ['BOS', '#6b7280']],
  }
  const items = sets[mode] || sets.occupancy
  return (
    <div style={{
      position: 'absolute', left: 12, bottom: 12,
      background: 'rgba(10,10,10,0.85)', borderRadius: 6,
      padding: '8px 10px', display: 'flex', flexDirection: 'column', gap: 4,
      fontFamily: 'var(--mono)', fontSize: 9, color: '#fff', letterSpacing: 1,
      border: '1px solid var(--border)',
    }}>
      <div style={{ color: 'var(--text3)', marginBottom: 2 }}>{MODES.find(m => m.id === mode)?.label}</div>
      {items.map(([label, color]) => (
        <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ width: 9, height: 9, background: color, borderRadius: '50%', display: 'inline-block', border: '1px solid #fff' }} />
          <span>{label}</span>
        </div>
      ))}
    </div>
  )
}
