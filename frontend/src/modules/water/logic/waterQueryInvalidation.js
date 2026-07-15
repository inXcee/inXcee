const WATER_QUERY_KEYS_BY_SCOPE = Object.freeze({
  distribution: Object.freeze([
    'water-daily-ledger',
    'water-summary',
    'water-pivot',
    'water-day',
    'water-zone-history',
    'water-intake',
    'water-pending',
    'water-alerts',
    'water-reconciliation',
    'water-review',
    'water-forecast',
    'water-trends',
  ]),
  intake: Object.freeze([
    'water-intake',
    'water-summary',
    'water-pending',
    'water-alerts',
    'water-reconciliation',
    'water-forecast',
    'water-trends',
    'water-daily-ledger',
    'water-zone-history',
  ]),
  returns: Object.freeze([
    'water-returns',
    'water-summary',
    'water-deposit',
    'water-reconciliation',
    'water-alerts',
    'water-trends',
  ]),
  adjustments: Object.freeze([
    'water-adjustments',
    'water-summary',
    'water-pivot',
    'water-pending',
    'water-alerts',
    'water-reconciliation',
    'water-forecast',
    'water-trends',
    'water-daily-ledger',
    'water-zone-history',
  ]),
  review: Object.freeze([
    'water-review',
    'water-alerts',
  ]),
  reconciliation: Object.freeze([
    'water-reconciliation',
    'water-alerts',
    'water-summary',
  ]),
  zones: Object.freeze([
    'water-zones',
    'water-pivot',
    'water-summary',
    'water-alerts',
    'water-daily-ledger',
    'water-zone-history',
  ]),
  templates: Object.freeze([
    'water-templates',
  ]),
  products: Object.freeze([
    'water-products-all',
    'water-products',
    'water-summary',
    'water-pivot',
    'water-deposit',
    'water-pending',
    'water-alerts',
    'water-reconciliation',
    'water-forecast',
    'water-trends',
    'water-intake',
    'water-returns',
    'water-daily-ledger',
    'water-zone-history',
  ]),
  brands: Object.freeze([
    'water-brands',
    'water-products-all',
    'water-products',
    'water-summary',
    'water-pivot',
    'water-deposit',
    'water-pending',
    'water-alerts',
    'water-reconciliation',
    'water-forecast',
    'water-trends',
    'water-intake',
    'water-returns',
    'water-daily-ledger',
    'water-zone-history',
  ]),
  trucks: Object.freeze([
    'water-truck-arrivals',
    'water-waybill-photos',
    'water-alerts',
  ]),
})

export function waterQueryKeysForScopes(...scopeArgs) {
  const scopes = scopeArgs.flat()
  const keys = new Set()

  scopes.forEach(scope => {
    const scopeKeys = WATER_QUERY_KEYS_BY_SCOPE[scope]
    if (!scopeKeys) throw new Error(`Bilinmeyen su sorgu kapsamı: ${scope}`)
    scopeKeys.forEach(key => keys.add(key))
  })

  return [...keys]
}

export function invalidateWaterQueries(queryClient, ...scopes) {
  if (!queryClient?.invalidateQueries) throw new Error('Geçerli bir QueryClient gerekli')
  const keys = new Set(waterQueryKeysForScopes(...scopes))
  return queryClient.invalidateQueries({
    predicate: query => keys.has(query.queryKey?.[0]),
  })
}
