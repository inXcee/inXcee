import { useTranslation } from '../../../shared/i18n/index.js'
import TabState from '../components/TabState.jsx'

export default function ShiftsTab({ query, data }) {
  const { t } = useTranslation()
  return (
    <TabState query={query}
      isEmpty={(data?.shifts || []).length === 0} emptyText={t('avs_kiosk.shifts.none')}>
      <div className="space-y-2">
      {(data?.shifts || []).map(s => {
        const today = new Date().toISOString().slice(0, 10)
        const isToday = s.work_date === today
        const color = s.status === 'worked' ? 'text-green-400' : s.status === 'absent' ? 'text-red-400'
          : s.status === 'on_leave' ? 'text-amber-400' : s.status === 'overtime' ? 'text-purple-400' : 'text-slate-400'
        return (
          <div key={s.work_date} className={`flex justify-between items-center px-4 py-3 rounded-xl ${isToday ? 'bg-blue-900 border border-blue-700' : 'bg-slate-900'}`}>
            <div>
              <div className="text-sm text-slate-200">{new Date(s.work_date).toLocaleDateString('tr-TR', { weekday: 'short', day: 'numeric', month: 'short' })}</div>
              {s.shift_name && (
                <div className="text-xs text-slate-500">
                  {s.shift_name}{s.start_hour != null && ` · ${String(s.start_hour).padStart(2, '0')}:00–${String(s.end_hour).padStart(2, '0')}:00`}
                </div>
              )}
            </div>
            <div className={`text-xs font-medium px-2 py-1 rounded-lg bg-slate-800 ${color}`}>{t('avs_kiosk.shifts.status.' + s.status, s.status)}</div>
          </div>
        )
      })}
      </div>
    </TabState>
  )
}
