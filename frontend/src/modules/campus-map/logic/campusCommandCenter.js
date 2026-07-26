const number = value => Number(value) || 0

export function buildBlockRisk(block) {
  const cleaningRemaining = Math.max(0, number(block?.cleaning_total) - number(block?.cleaning_done))
  const occupancy = number(block?.occupancy_pct)
  const openFaults = number(block?.open_faults)
  const quarantine = number(block?.quarantine)
  const maintenance = number(block?.maintenance)
  const pressure = occupancy >= 100 ? 20 : occupancy >= 95 ? 12 : occupancy >= 90 ? 6 : 0
  const score = Math.min(100,
    openFaults * 18
    + quarantine * 14
    + maintenance * 10
    + Math.min(cleaningRemaining, 10) * 2
    + pressure
  )

  const reasons = []
  if (openFaults > 0) reasons.push(`${openFaults} arıza`)
  if (quarantine > 0) reasons.push(`${quarantine} karantina`)
  if (maintenance > 0) reasons.push(`${maintenance} bakım`)
  if (cleaningRemaining > 0) reasons.push(`${cleaningRemaining} temizlik`)
  if (occupancy >= 95) reasons.push(`%${occupancy} dolu`)

  return {
    block: block?.block,
    score,
    reasons,
    openFaults,
    quarantine,
    maintenance,
    cleaningRemaining,
    occupancy,
  }
}

export function buildCampusCommandSummary(summary, operations) {
  const source = operations?.blocks || summary
  const blocks = Object.values(source || {})
  const risks = blocks
    .map(buildBlockRisk)
    .filter(item => item.block)
    .sort((left, right) => right.score - left.score || String(left.block).localeCompare(String(right.block), 'tr'))

  const sum = key => blocks.reduce((total, block) => total + number(block?.[key]), 0)
  const cleaningBacklog = blocks.reduce(
    (total, block) => total + Math.max(0, number(block?.cleaning_total) - number(block?.cleaning_done)),
    0,
  )
  const averageRisk = risks.length
    ? risks.reduce((total, item) => total + item.score, 0) / risks.length
    : 0
  const calculatedHealth = Math.max(0, Math.round(100 - averageRisk))
  const healthScore = Number.isFinite(Number(operations?.campus?.health_score))
    ? Number(operations.campus.health_score)
    : calculatedHealth
  const serverStatus = operations?.campus?.status
  const status = serverStatus === 'data_issue'
    ? { label: 'Veri sorunu', color: '#a855f7' }
    : healthScore >= 85
      ? { label: 'Dengeli', color: '#16a34a' }
      : healthScore >= 65
        ? { label: 'Takip gerekli', color: '#f59e0b' }
        : { label: 'Müdahale gerekli', color: '#dc2626' }

  return {
    healthScore,
    status,
    criticalBlocks: risks.filter(item => item.score >= 20),
    risks,
    openFaults: sum('open_faults'),
    quarantineRooms: sum('quarantine'),
    maintenanceRooms: sum('maintenance'),
    cleaningBacklog,
    availableBeds: Math.max(0, sum('total_beds') - sum('occupied')),
    dataIssueCount: number(operations?.data_quality?.unmapped_fault_count),
    freshnessStatus: operations?.freshness?.status || null,
  }
}
