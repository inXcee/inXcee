import { useState, useMemo, Suspense } from 'react'
import { lazyWithRetry as lazy } from '../../../shared/lazyWithRetry.js'
import { useQuery } from '@tanstack/react-query'
import api from '../../../shared/api/client.js'
import { pointsWithoutCoords } from '../logic/routeMap.js'

const RouteMap = lazy(() => import('../RouteMap.jsx'))
const FALLBACK_COLOR = '#3b82f6'

export default function MapTab() {
  const { data: routes = [] } = useQuery({
    queryKey: ['transport-routes-map'],
    queryFn: () => api.get('/transport/routes?active=1&with_stops=1').then(r => r.data),
  })
  const { data: points = [] } = useQuery({
    queryKey: ['transport-points-map'],
    queryFn: () => api.get('/transport/pickup-points?active=1').then(r => r.data),
  })

  const [hiddenIds, setHiddenIds] = useState(() => new Set())
  const [selectedRouteId, setSelectedRouteId] = useState(null)

  const visibleRouteIds = useMemo(
    () => new Set(routes.filter(r => !hiddenIds.has(r.id)).map(r => r.id)),
    [routes, hiddenIds]
  )

  const noCoordCount = useMemo(() => pointsWithoutCoords(points).length, [points])

  function toggleRoute(id) {
    setHiddenIds(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  return (
    <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
      {/* Legend */}
      <div style={{ width: 240, flexShrink: 0 }}>
        <div style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--text3)', letterSpacing: 1.5, marginBottom: 8 }}>
          ROTALAR ({routes.length})
        </div>
        {noCoordCount > 0 && (
          <div style={{ background: 'rgba(245,158,11,.12)', border: '1px solid #f59e0b', borderRadius: 8,
            padding: '6px 10px', marginBottom: 10, fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--text2)' }}>
            ⚠ {noCoordCount} durak konumsuz (haritada gösterilmiyor)
          </div>
        )}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          {routes.map(r => {
            const isSel = selectedRouteId === r.id
            return (
              <div key={r.id} style={{
                display: 'flex', alignItems: 'center', gap: 8, padding: '6px 8px', borderRadius: 8,
                background: isSel ? 'var(--surface2)' : 'transparent', cursor: 'pointer',
              }} onClick={() => setSelectedRouteId(isSel ? null : r.id)}>
                <input
                  type="checkbox"
                  aria-label={`${r.name} rotasını gizle/göster`}
                  checked={!hiddenIds.has(r.id)}
                  onChange={() => toggleRoute(r.id)}
                  onClick={e => e.stopPropagation()}
                />
                <span style={{ width: 12, height: 12, borderRadius: 3, background: r.color || FALLBACK_COLOR, flexShrink: 0 }} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 12, fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{r.name}</div>
                  <div style={{ fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--text3)' }}>
                    {r.vehicle_plate || '—'} · {r.stops?.length ?? 0} durak
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {/* Harita */}
      <div style={{ flex: 1, minWidth: 320 }}>
        {routes.length === 0 && points.length === 0 ? (
          <div style={{ height: 520, display: 'flex', alignItems: 'center', justifyContent: 'center',
            background: 'var(--surface2)', borderRadius: 12, fontFamily: 'var(--mono)', fontSize: 12, color: 'var(--text3)' }}>
            Gösterilecek rota veya durak yok
          </div>
        ) : (
          <Suspense fallback={
            <div style={{ height: 520, display: 'flex', alignItems: 'center', justifyContent: 'center',
              background: 'var(--surface2)', borderRadius: 12, fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--text3)' }}>
              Harita yükleniyor…
            </div>
          }>
            <RouteMap
              routes={routes}
              points={points}
              visibleRouteIds={visibleRouteIds}
              selectedRouteId={selectedRouteId}
              onSelectRoute={(id) => setSelectedRouteId(prev => prev === id ? null : id)}
            />
          </Suspense>
        )}
      </div>
    </div>
  )
}
