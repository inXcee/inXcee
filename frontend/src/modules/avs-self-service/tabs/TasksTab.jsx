import { useState, useMemo } from 'react'
import { useTranslation } from '../../../shared/i18n/index.js'
import TabState from '../components/TabState.jsx'
import { downscalePhoto, dataUrlToBlob } from '../../../shared/photo.js'

const SKIP_REASONS = ['occupied', 'dnd', 'locked', 'fault', 'other']

export default function TasksTab({
  query, data, completeTask, skipTask, photoDrafts, setPhotoDrafts,
  uploadProgress, onReportFault, selectedBlock, onSelectBlock, isOnline = true,
}) {
  const { t } = useTranslation()
  const [selFloor, setSelFloor] = useState(null)
  const [selTaskId, setSelTaskId] = useState(null)
  const [skipForm, setSkipForm] = useState(null)
  const [taskFilter, setTaskFilter] = useState('pending')
  const [roomSearch, setRoomSearch] = useState('')

  const items = data?.items || []
  const blocks = data?.available_blocks || [...new Set(items.map(item => item.block).filter(Boolean))]
  const block = data?.assigned_block || selectedBlock || data?.selected_block || null
  const floors = useMemo(
    () => [...new Set(items.filter(item => item.block === block).map(item => item.floor))].sort((a, b) => a - b),
    [items, block]
  )
  const floor = selFloor != null && floors.includes(selFloor) ? selFloor : floors[0]
  const floorItems = items.filter(item => item.block === block && item.floor === floor)
  const roomTasks = floorItems.filter(item => item.task_type === 'room').map(item => ({
    ...item,
    room_no: item.qr_location
      ? item.qr_location.split('-').slice(1).join('-')
      : item.area,
  }))
  const commonTask = floorItems.find(item => item.task_type === 'common_area')
  const selectedTask = floorItems.find(item => item.id === selTaskId) || null
  const nextFloorTask = floorItems.find(item => !item.completed_at && !item.skipped)
  const blockItems = items.filter(item => item.block === block)
  const blockDoneCount = blockItems.filter(item => item.completed_at).length
  const blockSkipCount = blockItems.filter(item => item.skipped && !item.completed_at).length
  const blockPendingCount = blockItems.filter(item => !item.completed_at && !item.skipped).length
  const progressPercent = blockItems.length ? Math.round((blockDoneCount / blockItems.length) * 100) : 0
  const draftTaskCount = blockItems.filter(item => (photoDrafts[item.id] || []).length > 0).length
  const normalizedSearch = roomSearch.trim().toLocaleLowerCase()

  function matchesFilter(task) {
    if (taskFilter === 'completed') return !!task.completed_at
    if (taskFilter === 'skipped') return !!task.skipped && !task.completed_at
    if (taskFilter === 'pending') return !task.completed_at && !task.skipped
    return true
  }

  const visibleRoomTasks = roomTasks.filter(task => {
    const matchesSearch = !normalizedSearch
      || `${task.room_no} ${task.area}`.toLocaleLowerCase().includes(normalizedSearch)
    return matchesSearch && matchesFilter(task)
  })
  const visibleCommonTask = commonTask && matchesFilter(commonTask)
    && (!normalizedSearch || `${commonTask.area} ${t('avs_kiosk.tasks.common_area')}`
      .toLocaleLowerCase().includes(normalizedSearch))
    ? commonTask
    : null

  async function addTaskPhotos(taskId, event) {
    const existing = photoDrafts[taskId] || []
    const files = [...(event.target.files || [])].slice(0, 3 - existing.length)
    event.target.value = ''
    if (!files.length) return
    try {
      const next = await Promise.all(files.map(file => downscalePhoto(file)))
      setPhotoDrafts(previous => ({
        ...previous,
        [taskId]: [...(previous[taskId] || []), ...next].slice(0, 3),
      }))
    } catch {
      // Dosya okunamadığında mevcut oturum taslağını koru.
    }
  }

  function removeTaskPhoto(taskId, index) {
    setPhotoDrafts(previous => {
      const remaining = (previous[taskId] || []).filter((_, itemIndex) => itemIndex !== index)
      const next = { ...previous }
      if (remaining.length) next[taskId] = remaining
      else delete next[taskId]
      return next
    })
  }

  function submitComplete(taskId) {
    const photos = photoDrafts[taskId] || []
    if (!photos.length) return
    completeTask.mutate({
      taskId,
      photoBlobs: photos.map(dataUrlToBlob),
    }, {
      onSuccess: () => {
        setSelTaskId(current => current === taskId ? null : current)
        setSkipForm(null)
      },
    })
  }

  function submitSkip(taskId) {
    if (!skipForm?.reason) return
    skipTask.mutate({
      taskId,
      reason: skipForm.reason,
      note: skipForm.note?.trim() || undefined,
    }, {
      onSuccess: () => {
        setSelTaskId(current => current === taskId ? null : current)
        setSkipForm(null)
      },
    })
  }

  function TaskActionCard({ task }) {
    if (!task) return null
    const photos = photoDrafts[task.id] || []
    const completing = completeTask.isPending && completeTask.variables?.taskId === task.id
    const progress = uploadProgress?.[task.id] ?? 0
    const skipping = skipTask.isPending && skipTask.variables?.taskId === task.id
    const error = completeTask.isError && completeTask.variables?.taskId === task.id
      ? completeTask.error?.response?.data?.error || t('avs_kiosk.tasks.save_error')
      : ''

    return (
      <div className="space-y-4 rounded-2xl border border-blue-700 bg-slate-800 p-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="font-medium text-slate-100">{task.area}</div>
            <div className="mt-1 text-xs text-slate-500">
              {task.task_type === 'common_area'
                ? t('avs_kiosk.tasks.common_area')
                : t('avs_kiosk.tasks.room_task')}
              {task.skipped && task.skip_reason ? ` · ${task.skip_reason}` : ''}
            </div>
          </div>
          <button type="button" onClick={() => { setSelTaskId(null); setSkipForm(null) }}
            className="min-h-10 min-w-10 rounded-xl text-slate-400" aria-label={t('avs_kiosk.tasks.close')}>
            ✕
          </button>
        </div>

        <div>
          <div className="mb-2 flex items-center justify-between text-xs">
            <span className="font-medium text-slate-300">{t('avs_kiosk.tasks.proof_title')}</span>
            <span className={photos.length ? 'text-green-400' : 'text-amber-400'}>
              {photos.length}/3 · {t('avs_kiosk.tasks.photo_required')}
            </span>
          </div>
          {photos.length > 0 && (
            <div className="mb-3 grid grid-cols-3 gap-2">
              {photos.map((photo, index) => (
                <div key={`${task.id}-${index}`} className="relative aspect-square overflow-hidden rounded-xl border border-slate-600">
                  <img src={photo} alt={`${t('avs_kiosk.tasks.proof_title')} ${index + 1}`}
                    className="h-full w-full object-cover" />
                  <button type="button" onClick={() => removeTaskPhoto(task.id, index)}
                    aria-label={t('avs_kiosk.tasks.remove_photo')}
                    className="absolute right-1 top-1 h-8 w-8 rounded-full bg-black/70 text-sm text-white">
                    ✕
                  </button>
                </div>
              ))}
            </div>
          )}
          {photos.length < 3 && (
            <div className="grid grid-cols-2 gap-2">
              <label className="flex min-h-14 cursor-pointer items-center justify-center gap-2 rounded-xl border border-dashed border-blue-500/60 bg-blue-950/30 px-3 text-center text-sm font-medium text-blue-300">
                📷 {t('avs_kiosk.tasks.take_photo')}
                <input type="file" accept="image/*" capture="environment" className="hidden"
                  onChange={event => addTaskPhotos(task.id, event)} />
              </label>
              <label className="flex min-h-14 cursor-pointer items-center justify-center gap-2 rounded-xl border border-dashed border-slate-500/60 bg-slate-900 px-3 text-center text-sm font-medium text-slate-300">
                🖼 {photos.length ? t('avs_kiosk.tasks.add_photo') : t('avs_kiosk.tasks.choose_photo')}
                <input type="file" accept="image/*" multiple className="hidden"
                  onChange={event => addTaskPhotos(task.id, event)} />
              </label>
            </div>
          )}
        </div>

        {error && (
          <div role="alert" className="rounded-xl border border-red-500/40 bg-red-950/30 p-3 text-sm text-red-300">
            {error} · {t('avs_kiosk.tasks.retry_hint')}
          </div>
        )}

        <button type="button" onClick={() => submitComplete(task.id)}
          disabled={completing || photos.length === 0 || !isOnline}
          className="min-h-14 w-full rounded-xl bg-green-600 px-4 text-sm font-semibold text-white disabled:bg-slate-700 disabled:text-slate-400">
          {!isOnline
            ? t('avs_kiosk.connection_waiting')
            : completing
              ? t('avs_kiosk.tasks.completing')
              : error
                ? t('avs_kiosk.tasks.retry_send')
                : `✓ ${t('avs_kiosk.tasks.complete')}`}
        </button>
        {completing && (
          <div className="space-y-1" aria-label={`${t('avs_kiosk.tasks.upload_progress')} ${progress}%`}>
            <div className="h-2 overflow-hidden rounded-full bg-slate-700">
              <div className="h-full rounded-full bg-green-500 transition-all"
                style={{ width: `${progress}%` }} />
            </div>
            <div className="text-right text-xs text-slate-400">
              {t('avs_kiosk.tasks.upload_progress')} {progress}%
            </div>
          </div>
        )}

        <div className="grid grid-cols-2 gap-2">
          <button type="button" onClick={() => onReportFault(task)}
            className="min-h-12 rounded-xl bg-amber-600/20 px-3 text-sm font-medium text-amber-300">
            🔧 {t('avs_kiosk.tasks.report_fault')}
          </button>
          <button type="button" onClick={() => setSkipForm(current => (
            current?.taskId === task.id ? null : { taskId: task.id, reason: '', note: '' }
          ))}
            className="min-h-12 rounded-xl bg-slate-700 px-3 text-sm font-medium text-slate-200">
            ⊘ {t('avs_kiosk.tasks.cannot_clean')}
          </button>
        </div>

        {skipForm?.taskId === task.id && (
          <div className="space-y-3 rounded-xl border border-slate-600 bg-slate-900 p-3">
            <div className="text-xs font-medium text-slate-300">{t('avs_kiosk.tasks.choose_reason')}</div>
            <div className="grid grid-cols-2 gap-2">
              {SKIP_REASONS.map(reason => (
                <button key={reason} type="button"
                  onClick={() => setSkipForm(previous => ({ ...previous, reason }))}
                  className={`min-h-11 rounded-lg px-2 text-xs ${
                    skipForm.reason === reason ? 'bg-amber-600 text-white' : 'bg-slate-800 text-slate-300'
                  }`}>
                  {t(`avs_kiosk.tasks.skip_${reason}`)}
                </button>
              ))}
            </div>
            {skipForm.reason === 'other' && (
              <input value={skipForm.note}
                onChange={event => setSkipForm(previous => ({ ...previous, note: event.target.value }))}
                maxLength={300} placeholder={t('avs_kiosk.tasks.skip_note')}
                className="w-full rounded-xl border border-slate-700 bg-slate-800 px-3 py-3 text-sm text-white" />
            )}
            <button type="button" onClick={() => submitSkip(task.id)}
              disabled={!skipForm.reason || skipping || !isOnline}
              className="min-h-12 w-full rounded-xl bg-amber-600 text-sm font-semibold text-white disabled:bg-slate-700">
              {!isOnline
                ? t('avs_kiosk.connection_waiting')
                : skipping
                  ? t('avs_kiosk.tasks.completing')
                  : t('avs_kiosk.tasks.save_skip')}
            </button>
          </div>
        )}
      </div>
    )
  }

  return (
    <TabState query={query}>
      <div className="space-y-3">
        {data?.type === 'laundry' ? (
          <div className="rounded-2xl bg-slate-900 p-6 text-center">
            <div className="mb-3 text-4xl">🧺</div>
            <div className="mb-4 text-sm text-slate-300">{t('avs_kiosk.tasks.laundry_redirect')}</div>
            <a href="/laundry-kiosk" className="inline-block rounded-xl bg-blue-600 px-4 py-3 text-sm font-medium text-white">
              {t('avs_kiosk.tasks.go_laundry')}
            </a>
          </div>
        ) : data?.type === 'housekeeping' ? (
          <>
            <div className="flex items-center justify-between gap-3">
              <h2 className="font-medium text-slate-300">{t('avs_kiosk.tasks.housekeeping_title')}</h2>
              {draftTaskCount > 0 && (
                <span className="rounded-full bg-violet-950 px-3 py-1 text-xs font-medium text-violet-300">
                  📷 {draftTaskCount} {t('avs_kiosk.tasks.draft')}
                </span>
              )}
            </div>

            {!data.assigned_block && blocks.length > 0 && (
              <section className={`rounded-2xl border p-4 ${
                block ? 'border-slate-700 bg-slate-900' : 'border-blue-500/50 bg-blue-950/30'
              }`}>
                <div className="mb-3 text-sm font-semibold text-slate-100">
                  {block ? t('avs_kiosk.tasks.change_block') : t('avs_kiosk.tasks.choose_block')}
                </div>
                {!block && <p className="mb-3 text-xs text-slate-400">{t('avs_kiosk.tasks.choose_block_hint')}</p>}
                <div className="flex flex-wrap gap-2">
                  {blocks.map(item => (
                    <button key={item} type="button"
                      onClick={() => {
                        onSelectBlock(item)
                        setSelFloor(null)
                        setSelTaskId(null)
                        setRoomSearch('')
                        setTaskFilter('pending')
                      }}
                      className={`min-h-11 min-w-12 rounded-xl px-4 text-sm font-bold ${
                        block === item ? 'bg-blue-600 text-white' : 'bg-slate-800 text-slate-300'
                      }`}>
                      {item}
                    </button>
                  ))}
                </div>
              </section>
            )}

            {!block ? (
              <div className="rounded-2xl bg-slate-900 p-6 text-center">
                <div className="text-4xl">🏢</div>
                <div className="mt-3 font-medium text-slate-200">{t('avs_kiosk.tasks.block_required')}</div>
                <div className="mt-1 text-sm text-slate-500">{t('avs_kiosk.tasks.choose_block_hint')}</div>
              </div>
            ) : items.length === 0 ? (
              <div className="rounded-2xl bg-slate-900 p-5 text-sm text-slate-400">
                {t('avs_kiosk.tasks.none_in_block')}
              </div>
            ) : (
              <>
                <section className="rounded-2xl border border-slate-800 bg-slate-900 p-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="text-xs uppercase tracking-wider text-slate-500">{block}</div>
                      <div className="mt-1 text-lg font-semibold text-white">
                        {blockDoneCount}/{blockItems.length} {t('avs_kiosk.tasks.done').toLocaleLowerCase()}
                      </div>
                    </div>
                    <div className="text-2xl font-bold text-green-400">%{progressPercent}</div>
                  </div>
                  <div className="mt-3 h-2 overflow-hidden rounded-full bg-slate-800">
                    <div className="h-full rounded-full bg-green-500 transition-all"
                      style={{ width: `${progressPercent}%` }} />
                  </div>
                  <div className="mt-3 grid grid-cols-3 gap-2 text-center text-xs">
                    <span className="rounded-lg bg-amber-950/40 px-2 py-2 text-amber-300">
                      {blockPendingCount} {t('avs_kiosk.home.pending')}
                    </span>
                    <span className="rounded-lg bg-green-950/40 px-2 py-2 text-green-300">
                      {blockDoneCount} {t('avs_kiosk.home.completed')}
                    </span>
                    <span className="rounded-lg bg-slate-800 px-2 py-2 text-slate-300">
                      {blockSkipCount} {t('avs_kiosk.home.skipped')}
                    </span>
                  </div>
                </section>

                <div className="space-y-3 rounded-2xl bg-slate-900 p-4">
                  <div className="flex gap-2 overflow-x-auto pb-1">
                    {floors.map(item => (
                      <button key={item} type="button" onClick={() => { setSelFloor(item); setSelTaskId(null) }}
                        className={`min-h-11 shrink-0 rounded-xl px-4 text-xs font-bold ${
                          floor === item ? 'bg-blue-600 text-white' : 'bg-slate-800 text-slate-400'
                        }`}>
                        {block} · {t('avs_kiosk.home.floor')} {item}
                      </button>
                    ))}
                  </div>

                  <div className="relative">
                    <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-slate-500">⌕</span>
                    <input type="search" value={roomSearch}
                      onChange={event => setRoomSearch(event.target.value)}
                      placeholder={t('avs_kiosk.tasks.search_room')}
                      className="min-h-12 w-full rounded-xl border border-slate-700 bg-slate-950 pl-10 pr-4 text-sm text-white outline-none focus:border-blue-500" />
                  </div>

                  <div className="grid grid-cols-4 gap-2" role="group" aria-label={t('avs_kiosk.tasks.filter_label')}>
                    {['pending', 'completed', 'skipped', 'all'].map(filter => (
                      <button key={filter} type="button" onClick={() => setTaskFilter(filter)}
                        aria-pressed={taskFilter === filter}
                        className={`min-h-10 rounded-lg px-1 text-[11px] font-semibold ${
                          taskFilter === filter ? 'bg-blue-600 text-white' : 'bg-slate-800 text-slate-400'
                        }`}>
                        {t(`avs_kiosk.tasks.filter_${filter}`)}
                      </button>
                    ))}
                  </div>

                  {nextFloorTask && taskFilter !== 'completed' && (
                    <button type="button"
                      onClick={() => setSelTaskId(nextFloorTask.id)}
                      className="min-h-12 w-full rounded-xl border border-blue-500/40 bg-blue-950/30 px-4 text-sm font-semibold text-blue-300">
                      → {t('avs_kiosk.tasks.open_next')}
                    </button>
                  )}

                  {visibleCommonTask && (
                    <button type="button"
                      onClick={() => !visibleCommonTask.completed_at && setSelTaskId(visibleCommonTask.id)}
                      className={`min-h-14 w-full rounded-xl border px-4 text-left ${
                        visibleCommonTask.completed_at ? 'border-green-700/40 bg-green-950/40 text-green-300'
                          : visibleCommonTask.skipped ? 'border-amber-700/40 bg-amber-950/30 text-amber-300'
                            : selTaskId === visibleCommonTask.id ? 'border-blue-500 bg-blue-950/50 text-white'
                              : 'border-slate-700 bg-slate-800 text-slate-200'
                      }`}>
                      🚻 {t('avs_kiosk.tasks.common_area')}
                      {visibleCommonTask.completed_at ? ' ✓' : visibleCommonTask.skipped ? ' ⊘' : ''}
                    </button>
                  )}

                  <div className="grid grid-cols-4 gap-2 sm:grid-cols-5">
                    {visibleRoomTasks.map(task => {
                      const done = !!task.completed_at
                      const skipped = task.skipped && !done
                      const selected = selTaskId === task.id
                      const photoCount = (photoDrafts[task.id] || []).length
                      return (
                        <button key={task.id} type="button"
                          aria-label={`${task.room_no}${done ? ' ✓' : skipped ? ' ⊘' : ''}`}
                          onClick={() => !done && setSelTaskId(selected ? null : task.id)}
                          className={`relative min-h-14 rounded-xl text-xs font-bold ${
                            done ? 'bg-green-900/50 text-green-400'
                              : skipped ? 'bg-amber-900/40 text-amber-400'
                                : selected ? 'bg-blue-600 text-white' : 'bg-slate-800 text-slate-300'
                          }`}>
                          {task.room_no}{done ? ' ✓' : skipped ? ' ⊘' : ''}
                          {photoCount > 0 && (
                            <span className="absolute right-1 top-1 rounded-full bg-violet-600 px-1.5 py-0.5 text-[9px] text-white">
                              📷{photoCount}
                            </span>
                          )}
                        </button>
                      )
                    })}
                  </div>

                  {!visibleCommonTask && visibleRoomTasks.length === 0 && (
                    <div className="rounded-xl bg-slate-950 p-5 text-center text-sm text-slate-500">
                      {t('avs_kiosk.tasks.no_filter_results')}
                    </div>
                  )}
                  <TaskActionCard task={selectedTask} />
                </div>
              </>
            )}
          </>
        ) : data?.type === 'maintenance' ? (
          <>
            <h2 className="font-medium text-slate-300">{t('avs_kiosk.tasks.maintenance_title')}</h2>
            {(data.items || []).map(item => (
              <div key={item.id} className="rounded-xl bg-slate-900 p-4">
                <div className="flex items-start justify-between gap-2">
                  <span className="font-medium text-slate-200">{item.location}</span>
                  <span className={item.priority === 'high' ? 'text-red-400' : 'text-amber-400'}>
                    {t(`avs_kiosk.fault.${item.priority}`)}
                  </span>
                </div>
                <div className="mt-1 text-xs text-blue-400">{t(`avs_kiosk.fault.category_${item.category || 'genel'}`)}</div>
                <div className="mt-2 line-clamp-2 text-sm text-slate-500">{item.description}</div>
              </div>
            ))}
          </>
        ) : (
          <div className="rounded-2xl bg-slate-900 p-6 text-center text-sm text-slate-400">
            {t('avs_kiosk.tasks.none')}
          </div>
        )}
      </div>
    </TabState>
  )
}
