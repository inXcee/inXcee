import { classHex } from '../../modules/shifts/logic/shiftColors.js'

// Kadro rozeti. Renk kaynağı vardiya modülündeki classHex — proje için ayrı bir
// palet açılmıyor ki bir yerde değişen renk her yerde aynı değişsin.
//
// Kadrosu olmayan kişi SESSİZ GEÇİLMEZ: "kadrosuz" olarak görünür. Boş bırakmak,
// listeye bakan kişinin eksiği fark etmemesine yol açıyordu.
export default function ProjectBadge({ project, size = 'sm', showEmpty = true }) {
  const ad = project?.name || project?.project_name
  const kod = project?.code || project?.project_code
  const renkSinifi = project?.color_class || project?.project_color

  if (!ad) {
    if (!showEmpty) return null
    return (
      <span
        title="Bu personel bir proje kadrosuna bağlı değil"
        style={{
          display: 'inline-flex', alignItems: 'center', gap: 4,
          padding: size === 'sm' ? '1px 6px' : '3px 9px',
          borderRadius: 999, fontFamily: 'var(--mono)',
          fontSize: size === 'sm' ? 9 : 11, letterSpacing: 0.5,
          color: 'var(--text4)', border: '1px dashed var(--border)',
        }}
      >
        KADROSUZ
      </span>
    )
  }

  const hex = `#${classHex(renkSinifi)}`
  return (
    <span
      title={`Kadro: ${ad}`}
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 4,
        padding: size === 'sm' ? '1px 6px' : '3px 9px',
        borderRadius: 999, fontFamily: 'var(--mono)',
        fontSize: size === 'sm' ? 9 : 11, letterSpacing: 0.5,
        color: hex, background: `${hex}1f`, border: `1px solid ${hex}55`,
        whiteSpace: 'nowrap',
      }}
    >
      {kod || ad}
    </span>
  )
}
