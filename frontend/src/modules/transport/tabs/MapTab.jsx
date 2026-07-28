import { useState, useMemo, Suspense } from 'react'
import { lazyWithRetry as lazy } from '../../../shared/lazyWithRetry.js'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import api from '../../../shared/api/client.js'
import { useAuthStore } from '../../../shared/store/authStore.js'
import { pointsWithoutCoords, moveStopInOrder, nextAutoStopName } from '../logic/routeMap.js'
import { useWorkSite, WORK_SITE_QUERY_KEY } from '../useWorkSite.js'
import { ModalShell, Label, ModalActions, toast, toastErr } from '../shared.jsx'

const RouteMap = lazy(() => import('../RouteMap.jsx'))
const FALLBACK_COLOR = '#3b82f6'
const EDIT_ROLES = ['campus_manager', 'shift_supervisor']

export default function MapTab() {
  const qc = useQueryClient()
  const user = useAuthStore(s => s.user)
  const canEdit = !!user && EDIT_ROLES.includes(user.role)

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
  const [editingRouteId, setEditingRouteId] = useState(null)
  const [pendingStop, setPendingStop] = useState(null)

  const workSite = useWorkSite()

  const invalidateMap = () => {
    qc.invalidateQueries({ queryKey: ['transport-routes-map'] })
    qc.invalidateQueries({ queryKey: ['transport-points-map'] })
  }

  const moveWorkSiteMut = useMutation({
    mutationFn: ({ lat, lng }) => api.put('/transport/work-site', { lat, lng }),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: WORK_SITE_QUERY_KEY })
      invalidateMap()
      toast(`İş yeri taşındı · ${res.data.requeued} rota yeniden hesaplanıyor`)
    },
    onError: toastErr,
  })

  // Is yeri tasima TUM rotalari etkiler — kazara surukleme kalici olmasin diye onay istenir.
  // false donerse RouteMap pini eski konumuna geri koyar.
  async function handleMoveWorkSite(lat, lng) {
    const ok = window.confirm(
      'İş yeri (varış noktası) buraya taşınsın mı?\n\nTüm rotaların yolu yeniden hesaplanacak.'
    )
    if (!ok) return false
    try {
      await moveWorkSiteMut.mutateAsync({ lat, lng })
      return true
    } catch {
      return false
    }
  }

  const moveStopMut = useMutation({
    mutationFn: ({ pickupPointId, lat, lng }) => api.put(`/transport/pickup-points/${pickupPointId}`, { lat, lng }),
    onSuccess: invalidateMap,
    onError: toastErr,
  })
  const reorderMut = useMutation({
    mutationFn: ({ routeId, stopIds }) => api.post(`/transport/routes/${routeId}/reorder-stops`, { stop_ids: stopIds }),
    onSuccess: invalidateMap,
    onError: toastErr,
  })
  const viaPointsMut = useMutation({
    mutationFn: ({ routeId, viaPoints }) =>
      api.put(`/transport/routes/${routeId}/via-points`, { via_points: viaPoints }),
    onSuccess: invalidateMap,
    onError: toastErr,
  })
  const recomputeMut = useMutation({
    mutationFn: (routeId) => api.post(`/transport/routes/${routeId}/recompute-path`),
    onSuccess: () => { invalidateMap(); toast('Yol yeniden hesaplandı') },
    onError: toastErr,
  })
  const deleteStopMut = useMutation({
    mutationFn: (stopId) => api.delete(`/transport/stops/${stopId}`),
    onSuccess: () => { invalidateMap(); toast('Durak rotadan çıkarıldı') },
    onError: toastErr,
  })
  const addStopAtPointMut = useMutation({
    mutationFn: async ({ routeId, lat, lng, name }) => {
      const point = await api.post('/transport/pickup-points', { name, lat, lng })
      return api.post(`/transport/routes/${routeId}/stops`, { pickup_point_id: point.data.id })
    },
    onSuccess: () => { invalidateMap(); setPendingStop(null); toast('Yeni durak eklendi') },
    onError: toastErr,
  })

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

  function toggleEdit(id) {
    setEditingRouteId(prev => prev === id ? null : id)
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
            const isEditing = editingRouteId === r.id
            const orderedStops = [...(r.stops || [])].sort((a, b) => a.sequence_order - b.sequence_order)
            return (
              <div key={r.id}>
                <div style={{
                  display: 'flex', alignItems: 'center', gap: 8, padding: '6px 8px', borderRadius: 8,
                  background: isSel || isEditing ? 'var(--surface2)' : 'transparent', cursor: 'pointer',
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
                      {r.vehicle_plate || '—'} · {orderedStops.length} durak
                    </div>
                  </div>
                  {canEdit && (
                    <button
                      type="button"
                      aria-label={`${r.name} rotasını haritadan düzenle`}
                      onClick={(e) => { e.stopPropagation(); toggleEdit(r.id) }}
                      className="btn btn-ghost btn-xs"
                      style={{ borderRadius: 6, color: isEditing ? 'var(--accent)' : undefined }}
                    >✎</button>
                  )}
                </div>

                {isEditing && orderedStops.length > 0 && (
                  <div style={{ padding: '4px 8px 8px 28px', display: 'flex', flexDirection: 'column', gap: 2 }}
                    onClick={e => e.stopPropagation()}>
                    {orderedStops.map((s, i) => {
                      const stopIds = orderedStops.map(x => x.id)
                      return (
                        <div key={s.id} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                          <span style={{
                            flex: 1, minWidth: 0, fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--text3)',
                            whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                          }}>
                            {i + 1}. {s.point_name}
                          </span>
                          <button type="button" className="btn btn-ghost btn-xs" style={{ borderRadius: 4, padding: '0 4px' }}
                            aria-label={`${s.point_name} yukarı taşı`} disabled={i === 0}
                            onClick={() => reorderMut.mutate({ routeId: r.id, stopIds: moveStopInOrder(stopIds, s.id, 'up') })}
                          >↑</button>
                          <button type="button" className="btn btn-ghost btn-xs" style={{ borderRadius: 4, padding: '0 4px' }}
                            aria-label={`${s.point_name} aşağı taşı`} disabled={i === orderedStops.length - 1}
                            onClick={() => reorderMut.mutate({ routeId: r.id, stopIds: moveStopInOrder(stopIds, s.id, 'down') })}
                          >↓</button>
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            )
          })}
        </div>
        {editingRouteId != null && (
          <button
            type="button"
            onClick={() => recomputeMut.mutate(editingRouteId)}
            disabled={recomputeMut.isPending}
            className="btn btn-ghost btn-xs"
            style={{ borderRadius: 8, width: '100%', marginTop: 8 }}
          >↻ Otomatik yeniden hesapla</button>
        )}
        {editingRouteId != null && (
          <button
            type="button"
            onClick={() => viaPointsMut.mutate({ routeId: editingRouteId, viaPoints: [] })}
            disabled={viaPointsMut.isPending}
            className="btn btn-ghost btn-xs"
            style={{ borderRadius: 8, width: '100%', marginTop: 4 }}
          >⌫ Uğrakları temizle</button>
        )}
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
              editingRouteId={editingRouteId}
              onMoveStop={(pickupPointId, lat, lng) => moveStopMut.mutate({ pickupPointId, lat, lng })}
              onChangeViaPoints={(routeId, viaPoints) => viaPointsMut.mutate({ routeId, viaPoints })}
              isBusy={viaPointsMut.isPending}
              onDeleteStop={(stopId) => deleteStopMut.mutate(stopId)}
              onAddStop={(routeId, lat, lng) => setPendingStop({ routeId, lat, lng })}
              workSite={workSite}
              onMoveWorkSite={canEdit ? handleMoveWorkSite : undefined}
            />
          </Suspense>
        )}
      </div>

      {pendingStop && (
        <NewStopNameModal
          existingNames={points.map(p => p.name)}
          pending={addStopAtPointMut.isPending}
          onCancel={() => setPendingStop(null)}
          onSave={(name) => addStopAtPointMut.mutate({ ...pendingStop, name })}
        />
      )}
    </div>
  )
}

// Haritada bos yere tiklayinca acilir. Isim bos birakilirsa artan numarali ad uretilir —
// eskiden hepsi sabit "Yeni Durak" oluyordu ve ayirt edilemez kayitlar birikiyordu.
function NewStopNameModal({ existingNames, pending, onCancel, onSave }) {
  const [name, setName] = useState('')
  const autoName = nextAutoStopName(existingNames)

  return (
    <ModalShell onClose={onCancel} title="YENİ DURAK">
      <div style={{ marginBottom: 10 }}>
        <Label>Durak Adı</Label>
        <input
          className="form-input"
          value={name}
          onChange={e => setName(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') onSave(name.trim() || autoName) }}
          placeholder={autoName}
          autoFocus
          style={{ borderRadius: 10 }}
        />
        <div style={{ fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--text3)', marginTop: 4 }}>
          Boş bırakırsan “{autoName}” adıyla oluşturulur.
        </div>
      </div>
      <ModalActions onClose={onCancel} onSave={() => onSave(name.trim() || autoName)} disabled={pending} loading={pending} />
    </ModalShell>
  )
}
