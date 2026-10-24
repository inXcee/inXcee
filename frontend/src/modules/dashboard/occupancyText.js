// Panel "Doluluk" KPI alt satırı (docs/saha-ekrani.md): saha doluluğu varsa kapsamı söyler — yüzde yalnız
// durumu bilinen odalardan hesaplanır, kaç odanın bilinmediği görünür kalmalı.
export function occupancySubtitle(kpi) {
  if (kpi.occupancy_source !== 'field') return `${kpi.occupied}/${kpi.total_beds} yatak`
  const rooms = kpi.rooms_occupied + kpi.rooms_empty + kpi.rooms_unknown
  const unknown = kpi.rooms_unknown ? ` · ${kpi.rooms_unknown} bilinmiyor` : ''
  return `${kpi.rooms_occupied} dolu / ${rooms} oda${unknown}`
}
