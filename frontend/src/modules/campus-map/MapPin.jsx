// Harita üzerinde tek bir blok pin'i (SVG <g>): doluluk donut'u, mod rengi, blok
// etiketi, metrik, yan etiket, badge, karantina halkası, alt durum noktaları ve
// hover/seçim/çoklu-seçim/arama-vurgu/canlı-pulse efektleri. Saf presentational —
// tüm durum prop, tüm etkileşim callback olarak gelir.
import { computeMetric, StatusDot } from './shared.jsx'

export default function MapPin({
  b, p, s, idx, mode, pinScale, showLabels, animateIn, editMode,
  isHover, isSel, isMulti, isHighlighted, pulse,
  onHoverEnter, onHoverLeave, onContextMenu, onClick, onPinMouseDown,
}) {
  if (!p) return null
  if (p.hidden && !editMode) return null

  const cfg = b
  const metric = computeMetric(mode, s, cfg)
  const customColor = p.color || metric.color
  const customLabel = p.label || b.block
  const baseR = 17 * pinScale * (p.size || 1)
  const r = isSel ? baseR + 3 : (isHover ? baseR + 2 : baseR)
  const pinOpacity = p.hidden ? 0.3 : 1

  // Donut: dis halka = doluluk yuzdesi (her zaman), ic = aktif mod rengi
  const occPct = s?.occupancy_pct || 0
  const occColor = !s?.total_beds ? '#6b7280' : occPct >= 85 ? '#dc2626' : occPct >= 60 ? '#f59e0b' : occPct > 0 ? '#16a34a' : '#6b7280'
  const ringR = r + 4
  const circumference = 2 * Math.PI * ringR
  const dash = (occPct / 100) * circumference

  const animDelay = animateIn ? `${idx * 40}ms` : '0ms'
  return (
    <g opacity={pinOpacity}
      style={{
        cursor: editMode ? 'grab' : 'pointer',
        ...(animateIn ? {
          transformOrigin: `${p.x}px ${p.y}px`,
          animation: `pin-pop 0.5s cubic-bezier(0.34, 1.56, 0.64, 1) ${animDelay} backwards`,
        } : {}),
      }}
      onMouseEnter={() => onHoverEnter(b.block)}
      onMouseLeave={onHoverLeave}
      onContextMenu={(e) => onContextMenu(e, b.block)}
      onClick={(e) => onClick(e, b.block)}
    >
      {/* Halo */}
      {(isHover || isSel) && (
        <circle cx={p.x} cy={p.y} r={r + 12} fill={customColor} opacity="0.18" />
      )}
      {/* Hidden uyarisi (sadece edit modunda) */}
      {p.hidden && (
        <circle cx={p.x} cy={p.y} r={r + 6} fill="none"
          stroke="#6b7280" strokeWidth="1.5" strokeDasharray="2 2" />
      )}
      {/* Custom flag (kullanici ozellestirme yapti) */}
      {(p.color || p.size || p.label) && (
        <circle cx={p.x - r + 4} cy={p.y - r + 4} r="3.5"
          fill="var(--accent)" stroke="#000" strokeWidth="0.5"
          style={{ pointerEvents: 'none' }} />
      )}
      {/* Multi-select halka */}
      {isMulti && (
        <>
          <circle cx={p.x} cy={p.y} r={r + 9} fill="none"
            stroke="var(--accent)" strokeWidth="2.5" strokeDasharray="4 3" />
          <circle cx={p.x + r - 3} cy={p.y - r + 3} r="6" fill="var(--accent)" stroke="#fff" strokeWidth="1.5" />
          <text x={p.x + r - 3} y={p.y - r + 3} textAnchor="middle" dominantBaseline="central"
            fontFamily="var(--mono)" fontSize="9" fontWeight="700" fill="#000"
            style={{ pointerEvents: 'none' }}>✓</text>
        </>
      )}
      {/* Arama vurgu — sari pulsing halka */}
      {isHighlighted && (
        <>
          <circle cx={p.x} cy={p.y} r={r + 18} fill="none" stroke="#facc15" strokeWidth="2.5">
            <animate attributeName="r" values={`${r + 6};${r + 26}`} dur="1s" repeatCount="3" />
            <animate attributeName="opacity" values="1;0" dur="1s" repeatCount="3" />
          </circle>
          <circle cx={p.x} cy={p.y} r={r + 8} fill="#facc15" opacity="0.25" />
        </>
      )}
      {/* Canli olay pulse */}
      {pulse && (
        <>
          <circle cx={p.x} cy={p.y} r={r + 6} fill="none"
            stroke={pulse.color} strokeWidth="3">
            <animate attributeName="r" values={`${r + 6};${r + 30}`} dur="1.5s" repeatCount="indefinite" />
            <animate attributeName="opacity" values="0.9;0" dur="1.5s" repeatCount="indefinite" />
          </circle>
          <circle cx={p.x} cy={p.y} r={r + 6} fill="none"
            stroke={pulse.color} strokeWidth="2">
            <animate attributeName="r" values={`${r + 6};${r + 22}`} dur="1.5s" begin="0.5s" repeatCount="indefinite" />
            <animate attributeName="opacity" values="0.7;0" dur="1.5s" begin="0.5s" repeatCount="indefinite" />
          </circle>
        </>
      )}
      {/* Doluluk donut halkasi */}
      <circle cx={p.x} cy={p.y} r={ringR} fill="none"
        stroke="rgba(255,255,255,0.15)" strokeWidth="3" />
      <circle cx={p.x} cy={p.y} r={ringR} fill="none"
        stroke={occColor} strokeWidth="3"
        strokeDasharray={`${dash} ${circumference}`}
        strokeDashoffset={circumference / 4}
        transform={`rotate(-90 ${p.x} ${p.y})`}
        style={{ transition: 'stroke-dasharray .4s' }}
      />
      {/* Gölge */}
      <circle cx={p.x + 1} cy={p.y + 2} r={r} fill="rgba(0,0,0,0.5)" />
      {/* Ana pin — mode rengi veya custom */}
      <circle cx={p.x} cy={p.y} r={r}
        fill={customColor} stroke="#fff" strokeWidth="2"
        onMouseDown={(e) => onPinMouseDown(e, b.block)}
      />
      {/* Blok ismi (veya custom label) */}
      <text x={p.x} y={p.y - 2} textAnchor="middle" dominantBaseline="central"
        fontFamily="var(--display)" fontSize={customLabel.length > 3 ? 8 : customLabel.length > 2 ? 9 : 11}
        fontWeight="700" fill="#fff" style={{ pointerEvents: 'none' }}>
        {customLabel.length > 6 ? customLabel.slice(0, 6) : customLabel}
      </text>
      {/* Metrik */}
      <text x={p.x} y={p.y + 8} textAnchor="middle" dominantBaseline="central"
        fontFamily="var(--mono)" fontSize="8" fontWeight="600"
        fill="#fff" opacity="0.95" style={{ pointerEvents: 'none' }}>
        {metric.centerLabel}
      </text>

      {/* Yan etiket */}
      {showLabels && (
        <g style={{ pointerEvents: 'none' }}>
          <rect x={p.x + r + 5} y={p.y - 9} width={48} height={18} rx={4}
            fill="rgba(0,0,0,0.85)" stroke={customColor} strokeWidth="1" />
          <text x={p.x + r + 29} y={p.y + 1}
            textAnchor="middle" dominantBaseline="central"
            fontFamily="var(--mono)" fontSize="9" fontWeight="600" fill="#fff">
            {metric.subLabel}
          </text>
        </g>
      )}

      {/* Badge (sag-ust) */}
      {metric.badge && (
        <g style={{ pointerEvents: 'none' }}>
          <circle cx={p.x + r - 2} cy={p.y - r + 2} r="7"
            fill={metric.badge.color} stroke="#fff" strokeWidth="1.5" />
          <text x={p.x + r - 2} y={p.y - r + 2}
            textAnchor="middle" dominantBaseline="central"
            fontFamily="var(--mono)" fontSize="9" fontWeight="700" fill="#fff">
            {metric.badge.text}
          </text>
        </g>
      )}

      {/* Karantina kesik halka — daima goster */}
      {s?.quarantine > 0 && (
        <circle cx={p.x} cy={p.y} r={ringR + 4} fill="none"
          stroke="#dc2626" strokeWidth="1.5" strokeDasharray="3 3"
          style={{ pointerEvents: 'none' }} />
      )}

      {/* Alt durum noktalari — 3 mini gosterge (vardiya/temizlik/ariza) */}
      {!editMode && s && (
        <g style={{ pointerEvents: 'none' }}>
          <StatusDot cx={p.x - 8} cy={p.y + r + 6}
            active={(s.day_count + s.night_count) > 0}
            color={s.night_count > s.day_count ? '#8b5cf6' : '#f97316'} />
          <StatusDot cx={p.x} cy={p.y + r + 6}
            active={s.cleaning_total > 0}
            color={s.cleaning_pct >= 80 ? '#16a34a' : s.cleaning_pct >= 40 ? '#eab308' : '#dc2626'} />
          <StatusDot cx={p.x + 8} cy={p.y + r + 6}
            active={s.open_faults > 0}
            color="#dc2626" />
        </g>
      )}
    </g>
  )
}
