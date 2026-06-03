// Harita üzerinde bir pin'in üzerine gelince çıkan SVG detay kartı (moda göre
// içerik değişir). viewBox koordinatlarında çizilir, ekran kenarına taşmaz.
import { VIEW_W, VIEW_H } from './shared.jsx'

export default function HoverCard({ block, cfg, s, pin, mode }) {
  if (!pin || !s || !cfg) return null
  const w = 210, h = 138
  let tx = pin.x + 24, ty = pin.y - h / 2
  if (tx + w > VIEW_W) tx = pin.x - 24 - w
  if (ty < 0) ty = 4
  if (ty + h > VIEW_H) ty = VIEW_H - h - 4

  // Mode-spesifik 2. satir
  const modeLines = {
    occupancy:  [['DOLU', `${s.occupied}/${s.total_beds}`, '#16a34a'],
                 ['BOS ODA', s.empty_rooms, '#facc15'],
                 ['DOLULUK', `%${s.occupancy_pct}`, '#fff']],
    faults:     [['ACIK ARIZA', s.open_faults, '#dc2626'],
                 ['TOPLAM ODA', s.total_rooms, '#fff'],
                 ['DOLULUK', `%${s.occupancy_pct}`, '#facc15']],
    cleaning:   [['TAMAMLANAN', `${s.cleaning_done}/${s.cleaning_total}`, '#16a34a'],
                 ['ATLANAN', s.cleaning_skipped, '#eab308'],
                 ['BUGUN %', `%${s.cleaning_pct}`, '#fff']],
    shifts:     [['GUNDUZ', s.day_count, '#f97316'],
                 ['GECE', s.night_count, '#8b5cf6'],
                 ['TOPLAM', s.day_count + s.night_count, '#fff']],
    quarantine: [['KARANTINA', s.quarantine, '#dc2626'],
                 ['BAKIM', s.maintenance, '#f59e0b'],
                 ['AKTIF ODA', s.total_rooms - s.quarantine - s.maintenance, '#16a34a']],
    company:    [
      ['1.SIRKET', s.top_companies?.[0] ? `${s.top_companies[0].company} (${s.top_companies[0].count})` : '—', '#a855f7'],
      ['2.SIRKET', s.top_companies?.[1] ? `${s.top_companies[1].company} (${s.top_companies[1].count})` : '—', '#06b6d4'],
      ['3.SIRKET', s.top_companies?.[2] ? `${s.top_companies[2].company} (${s.top_companies[2].count})` : '—', '#f59e0b'],
    ],
  }
  const lines = modeLines[mode] || modeLines.occupancy

  return (
    <g style={{ pointerEvents: 'none' }}>
      <rect x={tx} y={ty} width={w} height={h} rx={6}
        fill="rgba(10,10,10,0.96)" stroke="var(--accent)" strokeWidth="1.5" />
      <text x={tx + 12} y={ty + 20} fontFamily="var(--display)" fontSize="16" fontWeight="700"
        fill="#fff" letterSpacing="2">BLOK {block}</text>
      <text x={tx + w - 12} y={ty + 20} textAnchor="end"
        fontFamily="var(--mono)" fontSize="9" fill="var(--text3)" letterSpacing="1">
        TIP {cfg.type} • {cfg.floors}K
      </text>
      <line x1={tx + 10} x2={tx + w - 10} y1={ty + 28} y2={ty + 28} stroke="var(--border)" strokeWidth="0.5" />
      {lines.map((ln, i) => (
        <g key={i}>
          <text x={tx + 12} y={ty + 48 + i * 18} fontFamily="var(--mono)" fontSize="9"
            fill="var(--text3)" letterSpacing="1">{ln[0]}</text>
          <text x={tx + w - 12} y={ty + 48 + i * 18} textAnchor="end"
            fontFamily="var(--mono)" fontSize="11" fontWeight="700" fill={ln[2]}>
            {ln[1]}
          </text>
        </g>
      ))}
      <line x1={tx + 10} x2={tx + w - 10} y1={ty + h - 24} y2={ty + h - 24} stroke="var(--border)" strokeWidth="0.5" />
      <text x={tx + w / 2} y={ty + h - 10} textAnchor="middle"
        fontFamily="var(--mono)" fontSize="9" fill="var(--text3)" letterSpacing="1">
        TIKLA: DETAYLI GOR
      </text>
    </g>
  )
}
