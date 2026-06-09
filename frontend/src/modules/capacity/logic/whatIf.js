// What-if senaryo — "X kişi gelirse hangi bloklar dolar?" saf yerleştirme mantığı.
// Girdi: /dashboard/bed-occupancy blok satırları ({ block, total_beds, occupied, empty }).
// Strateji:
//   'fewest'   — en boş bloktan başla (en az blok kullanılır, taşınma/karışıklık azalır)
//   'balanced' — en düşük doluluk oranlı bloktan başla (yük dengelenir)
// Çıktı: { allocations: [{ block, take, emptyBefore, emptyAfter }], placed, shortfall, blocksUsed }

export function allocateScenario(blocks, count, strategy = 'fewest') {
  const n = Math.floor(Number(count))
  if (!Array.isArray(blocks) || !Number.isFinite(n) || n <= 0) {
    return { allocations: [], placed: 0, shortfall: Math.max(0, n || 0), blocksUsed: 0 }
  }

  const usable = blocks
    .filter(b => (b.empty || 0) > 0)
    .map(b => ({ ...b }))

  if (strategy === 'balanced') {
    const pct = b => (b.total_beds > 0 ? b.occupied / b.total_beds : 1)
    usable.sort((a, b) => pct(a) - pct(b) || (b.empty - a.empty))
  } else {
    usable.sort((a, b) => b.empty - a.empty)
  }

  const allocations = []
  let remaining = n
  for (const b of usable) {
    if (remaining <= 0) break
    const take = Math.min(remaining, b.empty)
    allocations.push({ block: b.block, take, emptyBefore: b.empty, emptyAfter: b.empty - take })
    remaining -= take
  }

  return {
    allocations,
    placed: n - remaining,
    shortfall: remaining,
    blocksUsed: allocations.length,
  }
}
