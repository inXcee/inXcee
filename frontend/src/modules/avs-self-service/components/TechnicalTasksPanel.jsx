import { useMemo, useState } from 'react'
import { useTranslation } from '../../../shared/i18n/index.js'
import { downscalePhoto } from '../../../shared/photo.js'

const PRIORITIES = ['all', 'high', 'medium', 'low']
const SCOPES = ['mine', 'available', 'all']

function formatDate(value) {
  if (!value) return null
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleString('tr-TR', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export default function TechnicalTasksPanel({
  data,
  claimMaintenance,
  updateMaintenanceStatus,
  maintenanceDrafts = {},
  setMaintenanceDrafts = () => {},
  isOnline = true,
}) {
  const { t } = useTranslation()
  const [scope, setScope] = useState('mine')
  const [priority, setPriority] = useState('all')
  const [search, setSearch] = useState('')
  const [expandedId, setExpandedId] = useState(null)
  const [viewerPhoto, setViewerPhoto] = useState(null)
  const [photoErrors, setPhotoErrors] = useState({})

  const items = data?.items || []
  const counts = useMemo(() => ({
    mine: items.filter(item => item.is_mine).length,
    available: items.filter(item => !item.avs_assigned_worker_id && !item.assigned_to).length,
    all: items.length,
  }), [items])
  const normalizedSearch = search.trim().toLocaleLowerCase('tr-TR')
  const visibleItems = items.filter(item => {
    const scopeMatch = scope === 'mine'
      ? Boolean(item.is_mine)
      : scope === 'available'
        ? !item.avs_assigned_worker_id && !item.assigned_to
        : true
    const priorityMatch = priority === 'all' || item.priority === priority
    const searchMatch = !normalizedSearch
      || `${item.location} ${item.description} ${item.category || ''}`
        .toLocaleLowerCase('tr-TR').includes(normalizedSearch)
    return scopeMatch && priorityMatch && searchMatch
  })

  function updateDraft(id, patch) {
    setMaintenanceDrafts(previous => ({
      ...previous,
      [id]: { ...(previous[id] || {}), ...patch },
    }))
  }

  async function selectResolutionPhoto(id, event) {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    try {
      const photoDataUrl = await downscalePhoto(file)
      updateDraft(id, { photoDataUrl })
      setPhotoErrors(previous => ({ ...previous, [id]: '' }))
    } catch {
      setPhotoErrors(previous => ({
        ...previous,
        [id]: t('avs_kiosk.tasks.tech_photo_error'),
      }))
    }
  }

  return (
    <div className="space-y-4">
      <div>
        <h2 className="font-medium text-slate-200">{t('avs_kiosk.tasks.maintenance_title')}</h2>
        <p className="mt-1 text-xs text-slate-500">{t('avs_kiosk.tasks.tech_pool_hint')}</p>
      </div>

      <div className="grid grid-cols-3 gap-2" aria-label={t('avs_kiosk.tasks.tech_scope')}>
        {SCOPES.map(itemScope => (
          <button key={itemScope} type="button" onClick={() => setScope(itemScope)}
            aria-pressed={scope === itemScope}
            className={`min-h-14 rounded-xl px-2 text-xs font-semibold ${
              scope === itemScope
                ? 'bg-blue-600 text-white'
                : 'border border-slate-700 bg-slate-900 text-slate-300'
            }`}>
            <span className="block text-lg font-bold">{counts[itemScope]}</span>
            {t(`avs_kiosk.tasks.tech_scope_${itemScope}`)}
          </button>
        ))}
      </div>

      <input value={search} onChange={event => setSearch(event.target.value)}
        placeholder={t('avs_kiosk.tasks.tech_search')}
        className="min-h-12 w-full rounded-xl border border-slate-700 bg-slate-900 px-4 text-sm text-slate-100 outline-none focus:border-blue-500" />

      <div className="flex gap-2 overflow-x-auto pb-1" aria-label={t('avs_kiosk.fault.priority')}>
        {PRIORITIES.map(itemPriority => (
          <button key={itemPriority} type="button" onClick={() => setPriority(itemPriority)}
            aria-pressed={priority === itemPriority}
            className={`min-h-11 shrink-0 rounded-xl px-4 text-sm font-medium ${
              priority === itemPriority ? 'bg-slate-200 text-slate-950' : 'bg-slate-900 text-slate-400'
            }`}>
            {itemPriority === 'all'
              ? t('avs_kiosk.tasks.filter_all')
              : t(`avs_kiosk.fault.${itemPriority}`)}
          </button>
        ))}
      </div>

      {!isOnline && (
        <div className="rounded-xl border border-amber-500/40 bg-amber-950/30 p-3 text-sm text-amber-200">
          {t('avs_kiosk.tasks.tech_offline')}
        </div>
      )}

      {visibleItems.length === 0 && (
        <div className="rounded-2xl bg-slate-900 p-6 text-center text-sm text-slate-400">
          {t('avs_kiosk.tasks.tech_none')}
        </div>
      )}

      <div className="space-y-3">
        {visibleItems.map(item => {
          const expanded = expandedId === item.id
          const available = !item.avs_assigned_worker_id && !item.assigned_to
          const ownerName = item.avs_worker_name || item.technician_name
          const draft = maintenanceDrafts[item.id] || {}
          const overdue = item.sla_deadline && item.status !== 'done'
            && new Date(item.sla_deadline).getTime() < Date.now()
          const claiming = claimMaintenance?.isPending && claimMaintenance.variables === item.id
          const updating = updateMaintenanceStatus?.isPending
            && updateMaintenanceStatus.variables?.id === item.id
          const mutationError = claimMaintenance?.isError && claimMaintenance.variables === item.id
            ? claimMaintenance.error
            : updateMaintenanceStatus?.isError && updateMaintenanceStatus.variables?.id === item.id
              ? updateMaintenanceStatus.error
              : null

          return (
            <article key={item.id}
              className={`overflow-hidden rounded-2xl border ${
                item.is_mine ? 'border-blue-500/50 bg-blue-950/20' : 'border-slate-800 bg-slate-900'
              }`}>
              <button type="button" onClick={() => setExpandedId(expanded ? null : item.id)}
                aria-expanded={expanded}
                className="w-full p-4 text-left">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-xs font-semibold text-blue-400">
                        ARZ-{String(item.id).padStart(6, '0')}
                      </span>
                      {Boolean(item.is_mine) && (
                        <span className="rounded-full bg-blue-600/20 px-2 py-1 text-[10px] font-semibold text-blue-300">
                          {t('avs_kiosk.tasks.tech_owned_by_me')}
                        </span>
                      )}
                    </div>
                    <div className="mt-2 font-semibold text-slate-100">{item.location}</div>
                  </div>
                  <span className={`shrink-0 rounded-full px-2.5 py-1 text-[11px] font-semibold ${
                    item.priority === 'high'
                      ? 'bg-red-500/15 text-red-300'
                      : item.priority === 'medium'
                        ? 'bg-amber-500/15 text-amber-300'
                        : 'bg-slate-700 text-slate-300'
                  }`}>
                    {t(`avs_kiosk.fault.${item.priority}`)}
                  </span>
                </div>
                <div className="mt-2 flex flex-wrap gap-2 text-[11px]">
                  <span className="rounded-full bg-slate-800 px-2 py-1 text-slate-300">
                    {t(`avs_kiosk.fault.category_${item.category || 'genel'}`)}
                  </span>
                  <span className="rounded-full bg-slate-800 px-2 py-1 text-slate-300">
                    {t(`avs_kiosk.fault.status_${item.status}`)}
                  </span>
                  {overdue && (
                    <span className="rounded-full bg-red-500/15 px-2 py-1 font-semibold text-red-300">
                      {t('avs_kiosk.tasks.tech_sla_overdue')}
                    </span>
                  )}
                </div>
                <p className={`mt-3 text-sm leading-5 text-slate-400 ${expanded ? '' : 'line-clamp-2'}`}>
                  {item.description}
                </p>
              </button>

              {expanded && (
                <div className="space-y-4 border-t border-slate-800 p-4">
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <div className="rounded-xl bg-slate-950 p-3">
                      <div className="text-slate-500">{t('avs_kiosk.tasks.tech_opened')}</div>
                      <div className="mt-1 text-slate-300">{formatDate(item.opened_at)}</div>
                    </div>
                    <div className="rounded-xl bg-slate-950 p-3">
                      <div className="text-slate-500">{t('avs_kiosk.tasks.tech_sla')}</div>
                      <div className={`mt-1 ${overdue ? 'font-semibold text-red-300' : 'text-slate-300'}`}>
                        {formatDate(item.sla_deadline) || '—'}
                      </div>
                    </div>
                  </div>

                  {(item.photo_before || item.photo_url) && (
                    <div className="grid grid-cols-2 gap-2">
                      {item.photo_before && (
                        <button type="button"
                          onClick={() => setViewerPhoto({
                            url: item.photo_before,
                            label: t('avs_kiosk.tasks.tech_report_photo'),
                          })}
                          className="overflow-hidden rounded-xl border border-red-500/30 bg-slate-950 text-left">
                          <img loading="lazy" src={item.photo_before}
                            alt={t('avs_kiosk.tasks.tech_report_photo')}
                            className="aspect-[4/3] w-full object-cover" />
                          <span className="block px-3 py-2 text-xs font-semibold text-red-300">
                            {t('avs_kiosk.tasks.tech_report_photo')}
                          </span>
                        </button>
                      )}
                      {item.photo_url && (
                        <button type="button"
                          onClick={() => setViewerPhoto({
                            url: item.photo_url,
                            label: t('avs_kiosk.tasks.tech_resolution_photo'),
                          })}
                          className="overflow-hidden rounded-xl border border-green-500/30 bg-slate-950 text-left">
                          <img loading="lazy" src={item.photo_url}
                            alt={t('avs_kiosk.tasks.tech_resolution_photo')}
                            className="aspect-[4/3] w-full object-cover" />
                          <span className="block px-3 py-2 text-xs font-semibold text-green-300">
                            {t('avs_kiosk.tasks.tech_resolution_photo')}
                          </span>
                        </button>
                      )}
                    </div>
                  )}

                  {(ownerName || item.assigned_at || item.started_at) && (
                    <div className="rounded-xl border border-slate-800 bg-slate-950 p-3 text-xs">
                      <div className="font-semibold text-slate-300">{t('avs_kiosk.tasks.tech_history')}</div>
                      <div className="mt-2 space-y-2 text-slate-500">
                        {ownerName && (
                          <div>✓ {t('avs_kiosk.tasks.tech_owner')}: <span className="text-slate-300">{ownerName}</span></div>
                        )}
                        {item.assigned_at && <div>✓ {t('avs_kiosk.tasks.tech_claimed_at')}: {formatDate(item.assigned_at)}</div>}
                        {item.started_at && <div>✓ {t('avs_kiosk.tasks.tech_started_at')}: {formatDate(item.started_at)}</div>}
                        {item.last_action_note && (
                          <div className="rounded-lg bg-slate-900 p-2 text-slate-300">{item.last_action_note}</div>
                        )}
                      </div>
                    </div>
                  )}

                  {mutationError && (
                    <div role="alert" className="rounded-xl bg-red-950/50 p-3 text-sm text-red-300">
                      {mutationError.response?.data?.error || t('avs_kiosk.tasks.tech_action_error')}
                    </div>
                  )}

                  {available && (
                    <button type="button" disabled={!isOnline || claiming}
                      onClick={() => claimMaintenance.mutate(item.id)}
                      className="min-h-14 w-full rounded-xl bg-blue-600 px-4 font-semibold text-white disabled:opacity-50">
                      {claiming ? t('avs_kiosk.tasks.tech_claiming') : t('avs_kiosk.tasks.tech_claim')}
                    </button>
                  )}

                  {!available && !item.is_mine && (
                    <div className="rounded-xl bg-slate-800 p-3 text-center text-sm text-slate-400">
                      {ownerName
                        ? `${t('avs_kiosk.tasks.tech_owner')}: ${ownerName}`
                        : t('avs_kiosk.tasks.tech_managed_assignment')}
                    </div>
                  )}

                  {Boolean(item.is_mine) && ['open', 'assigned'].includes(item.status) && (
                    <button type="button" disabled={!isOnline || updating}
                      onClick={() => updateMaintenanceStatus.mutate({ id: item.id, status: 'in_progress' })}
                      className="min-h-14 w-full rounded-xl bg-amber-500 px-4 font-semibold text-slate-950 disabled:opacity-50">
                      {updating ? t('avs_kiosk.tasks.tech_saving') : t('avs_kiosk.tasks.tech_start')}
                    </button>
                  )}

                  {Boolean(item.is_mine) && item.status === 'in_progress' && (
                    <div className="space-y-3">
                      <textarea value={draft.note || ''}
                        onChange={event => updateDraft(item.id, { note: event.target.value })}
                        maxLength={500}
                        placeholder={t('avs_kiosk.tasks.tech_note')}
                        className="min-h-24 w-full resize-none rounded-xl border border-slate-700 bg-slate-950 p-3 text-sm text-slate-100 outline-none focus:border-green-500" />
                      {draft.photoDataUrl ? (
                        <div className="overflow-hidden rounded-xl border border-green-500/40 bg-green-950/20">
                          <button type="button"
                            onClick={() => setViewerPhoto({
                              url: draft.photoDataUrl,
                              label: t('avs_kiosk.tasks.tech_resolution_photo'),
                            })}
                            className="block w-full">
                            <img src={draft.photoDataUrl} alt={t('avs_kiosk.tasks.tech_resolution_photo')}
                              className="max-h-64 w-full object-cover" />
                          </button>
                          <div className="flex items-center justify-between gap-3 p-3">
                            <span className="text-xs font-semibold text-green-300">
                              {t('avs_kiosk.tasks.tech_resolution_photo_ready')}
                            </span>
                            <button type="button" onClick={() => updateDraft(item.id, { photoDataUrl: '' })}
                              className="min-h-10 rounded-lg bg-slate-800 px-3 text-xs text-slate-300">
                              {t('avs_kiosk.fault.remove_photo')}
                            </button>
                          </div>
                        </div>
                      ) : (
                        <div>
                          <div className="grid grid-cols-2 gap-2">
                            <label className="flex min-h-14 cursor-pointer items-center justify-center gap-2 rounded-xl border border-dashed border-green-500/50 bg-green-950/20 px-2 text-center text-xs font-semibold text-green-300">
                              📷 {t('avs_kiosk.tasks.tech_take_resolution_photo')}
                              <input type="file" accept="image/*" capture="environment" className="hidden"
                                onChange={event => selectResolutionPhoto(item.id, event)} />
                            </label>
                            <label className="flex min-h-14 cursor-pointer items-center justify-center gap-2 rounded-xl border border-dashed border-slate-600 bg-slate-950 px-2 text-center text-xs font-semibold text-slate-300">
                              🖼 {t('avs_kiosk.tasks.tech_choose_resolution_photo')}
                              <input type="file" accept="image/*" className="hidden"
                                onChange={event => selectResolutionPhoto(item.id, event)} />
                            </label>
                          </div>
                          <p className="mt-2 text-xs text-slate-500">
                            {t('avs_kiosk.tasks.tech_resolution_photo_optional')}
                          </p>
                        </div>
                      )}
                      {photoErrors[item.id] && (
                        <div role="alert" className="rounded-xl bg-red-950/40 p-3 text-xs text-red-300">
                          {photoErrors[item.id]}
                        </div>
                      )}
                      <button type="button" disabled={!isOnline || updating}
                        onClick={() => updateMaintenanceStatus.mutate({
                          id: item.id,
                          status: 'done',
                          note: draft.note?.trim() || undefined,
                          photoDataUrl: draft.photoDataUrl || undefined,
                        })}
                        className="min-h-14 w-full rounded-xl bg-green-600 px-4 font-semibold text-white disabled:opacity-50">
                        {updating ? t('avs_kiosk.tasks.tech_saving') : t('avs_kiosk.tasks.tech_complete')}
                      </button>
                    </div>
                  )}
                </div>
              )}
            </article>
          )
        })}
      </div>

      {viewerPhoto && (
        <div role="dialog" aria-modal="true" aria-label={viewerPhoto.label}
          className="fixed inset-0 z-[80] flex items-center justify-center bg-black/90 p-4"
          onClick={() => setViewerPhoto(null)}>
          <div className="w-full max-w-2xl" onClick={event => event.stopPropagation()}>
            <div className="mb-3 flex items-center justify-between gap-3">
              <div className="font-semibold text-white">{viewerPhoto.label}</div>
              <button type="button" onClick={() => setViewerPhoto(null)}
                aria-label={t('avs_kiosk.tasks.close')}
                className="min-h-11 min-w-11 rounded-xl bg-slate-800 text-white">✕</button>
            </div>
            <img src={viewerPhoto.url} alt={viewerPhoto.label}
              className="max-h-[80vh] w-full rounded-2xl object-contain" />
          </div>
        </div>
      )}
    </div>
  )
}
