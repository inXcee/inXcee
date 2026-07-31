// Parça künyesi (marka · model · beden · renk · desen) — saf yardımcılar.
// Ütü/teslim ekranları aynı özeti göstersin diye tek yerde tutulur.

export function garmentColors(garment) {
  if (Array.isArray(garment?.colors)) return garment.colors
  try {
    const parsed = JSON.parse(garment?.colors_json || '[]')
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

export function colorLabels(garment) {
  const fromJson = garmentColors(garment).map(color => color.label || color.key).filter(Boolean)
  if (fromJson.length) return fromJson
  return garment?.color ? [garment.color] : []
}

// "Düz" desen bilgi taşımıyor — özet satırında yer kaplamasın.
export function patternLabel(garment, patterns = []) {
  const key = garment?.pattern
  if (!key || key === 'solid') return null
  return patterns.find(pattern => pattern.key === key)?.label || key
}

// Ütü kartında tek satırda görünen künye. Hiçbir alan yoksa null döner ki
// çağıran "künye yok" durumunu ayırt edebilsin.
export function garmentTagSummary(garment, patterns = []) {
  const parts = [
    garment?.brand,
    garment?.model,
    garment?.size ? `Beden ${garment.size}` : null,
    colorLabels(garment).join('/') || null,
    patternLabel(garment, patterns),
  ].filter(Boolean)
  return parts.length ? parts.join(' · ') : null
}

// Künye ne kadar dolu? Ütü sırasında eksik künyeyi öne çıkarmak için.
export const TAG_FIELDS = ['brand', 'size', 'color', 'pattern']

export function tagCompleteness(garment) {
  const filled = [
    Boolean(garment?.brand),
    Boolean(garment?.size),
    colorLabels(garment).length > 0,
    Boolean(garment?.pattern && garment.pattern !== 'solid'),
  ].filter(Boolean).length
  return { filled, total: TAG_FIELDS.length, complete: filled === TAG_FIELDS.length }
}

// Sunucuya yalnızca değişen alanları gönder — dokunulmamış alan silinmesin.
export function tagPatch(draft, garment) {
  const patch = {}
  for (const field of ['brand', 'model', 'size', 'condition_notes', 'pattern']) {
    const next = draft?.[field] ?? ''
    const current = garment?.[field] ?? ''
    if (String(next) !== String(current)) patch[field] = next
  }
  const nextColors = Array.isArray(draft?.colors) ? draft.colors : []
  const currentColors = garmentColors(garment)
  const sameColors = nextColors.length === currentColors.length &&
    nextColors.every((color, index) => (color.key || color.label) === (currentColors[index]?.key || currentColors[index]?.label))
  if (!sameColors) patch.colors = nextColors
  return patch
}
