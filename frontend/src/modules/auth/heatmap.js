// Blok doluluk yüzdesini renge çevirir (yeşil→sarı→kırmızı). Saf — UI'dan bağımsız test edilebilir.
export function occupancyColor(pct) {
  if (pct == null || Number.isNaN(pct)) return '#41576b' // nötr gri
  if (pct >= 80) return '#d6453f'
  if (pct >= 60) return '#d6a020'
  return '#1fa971'
}
