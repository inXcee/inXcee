import { useTranslation } from '../../../shared/i18n/index.js'
import TabState from '../components/TabState.jsx'

export default function TasksTab({ query, data, completeTask }) {
  const { t } = useTranslation()
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
            <div key={task.id} className="bg-slate-900 rounded-xl p-4 flex justify-between items-center">
              <div>
                <div className="text-sm text-slate-200">{task.area}{task.block ? ` · ${task.block}` : ''}{task.floor != null ? ` · Kat ${task.floor}` : ''}</div>
                <div className="text-xs text-slate-500">{task.task_type}</div>
              </div>
              {task.completed_at ? (
                <span className="text-xs text-green-400">✓ {t('avs_kiosk.tasks.done')}</span>
              ) : (
                <button onClick={() => completeTask.mutate(task.id)} disabled={completeTask.isPending}
                  className="text-xs bg-blue-600 hover:bg-blue-500 disabled:bg-slate-700 text-white rounded-lg px-3 py-1.5">
                  {completeTask.isPending ? t('avs_kiosk.tasks.completing') : t('avs_kiosk.tasks.complete')}
                </button>
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
