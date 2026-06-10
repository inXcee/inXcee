import { useState } from 'react'
import { useTranslation } from '../../../shared/i18n/index.js'
import TabState from '../components/TabState.jsx'
import { downscalePhoto, dataUrlToBlob } from '../../../shared/photo.js'

export default function TasksTab({ query, data, completeTask }) {
  const { t } = useTranslation()
  // Görev başına temizlik kanıt fotoğrafı (dataURL önizleme)
  const [photoMap, setPhotoMap] = useState({})

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
      ) : data.type === 'housekeeping' ? (
        <>
          <h2 className="font-medium text-slate-300">{t('avs_kiosk.tasks.housekeeping_title')}</h2>
          {data.items.length === 0 ? (
            <div className="bg-slate-900 rounded-2xl p-5 text-slate-400 text-sm">{t('avs_kiosk.tasks.none')}</div>
          ) : data.items.map(task => (
            <div key={task.id} className="bg-slate-900 rounded-xl p-4">
              <div className="flex justify-between items-center">
                <div>
                  <div className="text-sm text-slate-200">{task.area}{task.block ? ` · ${task.block}` : ''}{task.floor != null ? ` · Kat ${task.floor}` : ''}</div>
                  <div className="text-xs text-slate-500">
                    {task.task_type === 'common_area' ? '🚻 Ortak alan / WC' : task.task_type}
                    {task.skipped ? ' · ⊘ atlanmış' : ''}
                  </div>
                </div>
                {task.completed_at ? (
                  <span className="text-xs text-green-400">✓ {t('avs_kiosk.tasks.done')}</span>
                ) : (
                  <button onClick={() => complete(task.id)} disabled={completeTask.isPending}
                    className="text-xs bg-blue-600 hover:bg-blue-500 disabled:bg-slate-700 text-white rounded-lg px-3 py-1.5 whitespace-nowrap">
                    {completeTask.isPending
                      ? t('avs_kiosk.tasks.completing')
                      : photoMap[task.id] ? '📷✓ ' + t('avs_kiosk.tasks.complete') : t('avs_kiosk.tasks.complete')}
                  </button>
                )}
              </div>
              {/* Temizlik kanıt fotoğrafı — tamamlamadan önce çekilir */}
              {!task.completed_at && (
                <div className="mt-2 flex items-center gap-2">
                  {photoMap[task.id] ? (
                    <>
                      <img src={photoMap[task.id]} alt="kanıt" className="w-12 h-12 rounded-lg object-cover border border-slate-700" />
                      <span className="text-xs text-green-400">Fotoğraf hazır — Tamamla ile gönderilir</span>
                      <button onClick={() => setPhotoMap(prev => { const n = { ...prev }; delete n[task.id]; return n })}
                        className="text-xs text-slate-500 hover:text-slate-300 ml-auto">✕</button>
                    </>
                  ) : (
                    <label className="text-xs text-slate-400 bg-slate-800 hover:bg-slate-700 rounded-lg px-3 py-1.5 cursor-pointer">
                      📷 Kanıt fotoğrafı çek
                      <input type="file" accept="image/*" capture="environment" className="hidden"
                        onChange={e => onTaskPhoto(task.id, e)} />
                    </label>
                  )}
                </div>
              )}
            </div>
          ))}
        </>
      ) : data.type === 'maintenance' ? (
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
