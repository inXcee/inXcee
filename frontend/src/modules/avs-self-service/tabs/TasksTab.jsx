import { useState, useMemo } from 'react'
import { useTranslation } from '../../../shared/i18n/index.js'
import TabState from '../components/TabState.jsx'
import { downscalePhoto, dataUrlToBlob } from '../../../shared/photo.js'

// Housekeeping: ana paneldeki gibi blok → kat → oda seçimli mini panel.
// Oda kutucukları: yeşil ✓ tamamlandı, amber ⊘ atlandı, gri bekliyor.
// Seçilen görev foto kanıtıyla (ya da fotosuz) tamamlanır.
export default function TasksTab({ query, data, completeTask }) {
  const { t } = useTranslation()
  const [photoMap, setPhotoMap] = useState({})
  const [selBlock, setSelBlock] = useState(null)
  const [selFloor, setSelFloor] = useState(null)
  const [selTaskId, setSelTaskId] = useState(null)

  const items = data?.items || []

  // Blok/kat türetimi — assigned_block varsa tek blok, yoksa görevlerden seçim
  const blocks = useMemo(() => [...new Set(items.map(i => i.block).filter(Boolean))], [items])
  const block = data?.assigned_block || selBlock || blocks[0] || null
  const floors = useMemo(
    () => [...new Set(items.filter(i => i.block === block).map(i => i.floor))].sort((a, b) => a - b),
    [items, block]
  )
  const floor = (selFloor != null && floors.includes(selFloor)) ? selFloor : floors[0]

  const floorItems = items.filter(i => i.block === block && i.floor === floor)
  const roomTasks = floorItems.filter(i => i.task_type === 'room')
    .map(i => ({ ...i, room_no: i.qr_location ? i.qr_location.split('-').slice(1).join('-') : i.area }))
  const commonTask = floorItems.find(i => i.task_type === 'common_area')
  const selTask = floorItems.find(i => i.id === selTaskId) || null

  const doneCount = floorItems.filter(i => i.completed_at).length
  const skipCount = floorItems.filter(i => i.skipped && !i.completed_at).length

  async function onTaskPhoto(taskId, e) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    try {
      const dataUrl = await downscalePhoto(file)
      setPhotoMap(prev => ({ ...prev, [taskId]: dataUrl }))
    } catch { /* okunamadı — sessiz */ }
  }

  function complete(taskId) {
    const dataUrl = photoMap[taskId]
    completeTask.mutate({ taskId, photoBlob: dataUrl ? dataUrlToBlob(dataUrl) : null })
    setPhotoMap(prev => { const n = { ...prev }; delete n[taskId]; return n })
    setSelTaskId(null)
  }

  // Seçili görevin tamamlama kartı (oda veya ortak alan için ortak)
  function TaskActionCard({ task }) {
    if (!task) return null
    const dataUrl = photoMap[task.id]
    return (
      <div className="bg-slate-800 rounded-xl p-4 space-y-3 border border-blue-700">
        <div className="flex justify-between items-center">
          <div>
            <div className="text-sm text-slate-100 font-medium">{task.area}</div>
            <div className="text-xs text-slate-500">
              {task.task_type === 'common_area' ? '🚻 Ortak alan / WC / banyo' : `Oda görevi`}
              {task.skipped ? ` · ⊘ atlanmış${task.skip_reason ? ` (${task.skip_reason})` : ''}` : ''}
            </div>
          </div>
          <button onClick={() => setSelTaskId(null)} className="text-xs text-slate-500">✕</button>
        </div>
        <div className="flex items-center gap-2">
          {dataUrl ? (
            <>
              <img src={dataUrl} alt="kanıt" className="w-14 h-14 rounded-lg object-cover border border-slate-600" />
              <span className="text-xs text-green-400 flex-1">Fotoğraf hazır</span>
              <button onClick={() => setPhotoMap(prev => { const n = { ...prev }; delete n[task.id]; return n })}
                className="text-xs text-slate-500">✕ Kaldır</button>
            </>
          ) : (
            <label className="flex-1 text-center text-xs text-slate-300 bg-slate-700 hover:bg-slate-600 rounded-lg px-3 py-2.5 cursor-pointer">
              📷 Kanıt fotoğrafı çek
              <input type="file" accept="image/*" capture="environment" className="hidden"
                onChange={e => onTaskPhoto(task.id, e)} />
            </label>
          )}
        </div>
        <div className="flex gap-2">
          <button onClick={() => complete(task.id)} disabled={completeTask.isPending}
            className="flex-1 bg-blue-600 hover:bg-blue-500 disabled:bg-slate-700 text-white rounded-xl py-2.5 text-sm font-medium">
            {completeTask.isPending ? t('avs_kiosk.tasks.completing') : dataUrl ? '📷✓ ' + t('avs_kiosk.tasks.complete') : t('avs_kiosk.tasks.complete')}
          </button>
        </div>
      </div>
    )
  }

  return (
    <TabState query={query}>
      <div className="space-y-3">
      {data?.type === 'laundry' ? (
        <div className="bg-slate-900 rounded-2xl p-6 text-center">
          <div className="text-4xl mb-3">🧺</div>
          <div className="text-slate-300 text-sm mb-4">{t('avs_kiosk.tasks.laundry_redirect')}</div>
          <a href="/laundry-kiosk" className="inline-block bg-blue-600 hover:bg-blue-500 text-white rounded-xl px-4 py-2 text-sm font-medium">
            {t('avs_kiosk.tasks.go_laundry')}
          </a>
        </div>
      ) : data?.type === 'housekeeping' ? (
        items.length === 0 ? (
          <div className="bg-slate-900 rounded-2xl p-5 text-slate-400 text-sm">{t('avs_kiosk.tasks.none')}</div>
        ) : (
        <>
          <h2 className="font-medium text-slate-300">{t('avs_kiosk.tasks.housekeeping_title')}</h2>

          {/* Blok seçimi — atanmış blok yoksa görevlerdeki bloklardan seç */}
          {!data?.assigned_block && blocks.length > 1 && (
            <div className="flex gap-2 flex-wrap">
              {blocks.map(b => (
                <button key={b} onClick={() => { setSelBlock(b); setSelFloor(null); setSelTaskId(null) }}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold ${block === b ? 'bg-blue-700 text-white' : 'bg-slate-800 text-slate-400'}`}>
                  {b}
                </button>
              ))}
            </div>
          )}

          {/* Kat seçimi + ilerleme */}
          <div className="bg-slate-900 rounded-2xl p-4 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex gap-2">
                {floors.map(f => (
                  <button key={f} onClick={() => { setSelFloor(f); setSelTaskId(null) }}
                    className={`px-3 py-1.5 rounded-lg text-xs font-bold ${floor === f ? 'bg-blue-700 text-white' : 'bg-slate-800 text-slate-400'}`}>
                    {block} · Kat {f}
                  </button>
                ))}
              </div>
              <span className="text-xs text-slate-500 font-mono">
                <b className="text-green-400">{doneCount}</b>/{floorItems.length}
                {skipCount > 0 ? <span className="text-amber-400"> · {skipCount}⊘</span> : ''}
              </span>
            </div>

            {/* Ortak alan / WC kartı */}
            {commonTask && (
              <button onClick={() => !commonTask.completed_at && setSelTaskId(commonTask.id)}
                className={`w-full text-left rounded-xl px-4 py-3 border ${
                  commonTask.completed_at ? 'bg-green-950/40 border-green-700/40' :
                  commonTask.skipped ? 'bg-amber-950/30 border-amber-700/40' :
                  selTaskId === commonTask.id ? 'bg-blue-950/50 border-blue-600' : 'bg-slate-800 border-slate-700'
                }`}>
                <span className="text-sm font-medium text-slate-200">
                  🚻 Ortak Alan — WC · Banyo · Koridor
                </span>
                <span className={`text-xs ml-2 ${commonTask.completed_at ? 'text-green-400' : commonTask.skipped ? 'text-amber-400' : 'text-slate-500'}`}>
                  {commonTask.completed_at ? '✓ tamamlandı' : commonTask.skipped ? '⊘ atlanmış — tekrar tamamlanabilir' : 'bekliyor — dokun'}
                </span>
              </button>
            )}

            {/* Oda kutucukları — ana paneldeki gibi */}
            <div className="grid grid-cols-5 gap-1.5">
              {roomTasks.map(rt => {
                const isDone = !!rt.completed_at
                const isSkip = rt.skipped && !isDone
                const isSel = selTaskId === rt.id
                return (
                  <button key={rt.id}
                    onClick={() => !isDone && setSelTaskId(isSel ? null : rt.id)}
                    title={rt.area}
                    className={`rounded-lg py-2.5 text-xs font-bold transition ${
                      isDone ? 'bg-green-900/50 text-green-400' :
                      isSkip ? 'bg-amber-900/40 text-amber-400' :
                      isSel ? 'bg-blue-600 text-white' : 'bg-slate-800 text-slate-300'
                    }`}>
                    {rt.room_no}{isDone ? ' ✓' : isSkip ? ' ⊘' : ''}
                  </button>
                )
              })}
            </div>

            {/* Seçili görev aksiyon kartı */}
            <TaskActionCard task={selTask} />
          </div>
        </>
        )
      ) : data?.type === 'maintenance' ? (
        <>
          <h2 className="font-medium text-slate-300">{t('avs_kiosk.tasks.maintenance_title')}</h2>
          {data.items.length === 0 ? (
            <div className="bg-slate-900 rounded-2xl p-5 text-slate-400 text-sm">{t('avs_kiosk.tasks.none')}</div>
          ) : data.items.map(m => (
            <div key={m.id} className="bg-slate-900 rounded-xl p-4">
              <div className="flex justify-between items-start mb-1">
                <span className="text-sm text-slate-200 font-medium">{m.location}</span>
                <span className={`text-xs font-medium ${m.priority === 'high' ? 'text-red-400' : m.priority === 'low' ? 'text-slate-400' : 'text-amber-400'}`}>{m.priority}</span>
              </div>
              <div className="text-xs text-slate-500 line-clamp-2">{m.description}</div>
            </div>
          ))}
        </>
      ) : (
        <div className="bg-slate-900 rounded-2xl p-5 text-slate-400 text-sm text-center py-6">{t('avs_kiosk.tasks.none')}</div>
      )}
      </div>
    </TabState>
  )
}
