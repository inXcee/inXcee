import { useTranslation } from '../../../shared/i18n/index.js'
import TabState from '../components/TabState.jsx'

function Metric({ value, label, tone = 'blue' }) {
  const colors = {
    blue: 'border-blue-500/40 bg-blue-950/30 text-blue-300',
    green: 'border-green-500/40 bg-green-950/30 text-green-300',
    amber: 'border-amber-500/40 bg-amber-950/30 text-amber-300',
    red: 'border-red-500/40 bg-red-950/30 text-red-300',
  }
  return (
    <div className={`rounded-2xl border p-4 ${colors[tone] || colors.blue}`}>
      <div className="text-3xl font-bold">{value ?? 0}</div>
      <div className="mt-1 text-xs text-slate-400">{label}</div>
    </div>
  )
}

export default function HomeTab({ query, data, onNavigate, selectedBlock, onSelectBlock }) {
  const { t } = useTranslation()
  const role = data?.role_group || 'general'
  const worker = data?.worker || {}
  const tasks = data?.tasks || {}
  const faults = data?.faults || {}
  const activeBlock = worker.assigned_block || selectedBlock || data?.selected_block || null
  const availableBlocks = data?.available_blocks || []
  const taskProgress = tasks.total ? Math.round(((tasks.completed || 0) / tasks.total) * 100) : 0

  return (
    <TabState query={query}>
      <div className="space-y-4">
        <section className="overflow-hidden rounded-3xl border border-blue-500/30 bg-gradient-to-br from-blue-950 via-slate-900 to-slate-950 p-5">
          <div className="text-xs font-semibold uppercase tracking-[0.22em] text-blue-400">
            {t('avs_kiosk.home.today')}
          </div>
          <h1 className="mt-2 text-2xl font-semibold text-white">
            {t('avs_kiosk.home.hello')}, {worker.full_name}
          </h1>
          <p className="mt-1 text-sm text-slate-400">
            {worker.department_name || worker.role_label}
            {worker.assigned_block ? ` · ${worker.assigned_block}` : ''}
          </p>
        </section>

        {role === 'housekeeping' && (
          <>
            {!worker.assigned_block && availableBlocks.length > 0 && (
              <section className={`rounded-2xl border p-4 ${
                activeBlock ? 'border-slate-700 bg-slate-900' : 'border-blue-500/50 bg-blue-950/30'
              }`}>
                <div className="font-semibold text-slate-100">
                  {activeBlock ? t('avs_kiosk.tasks.change_block') : t('avs_kiosk.tasks.choose_block')}
                </div>
                <p className="mt-1 text-xs text-slate-400">{t('avs_kiosk.tasks.choose_block_hint')}</p>
                <div className="mt-3 flex flex-wrap gap-2">
                  {availableBlocks.map(block => (
                    <button key={block} type="button" onClick={() => onSelectBlock(block)}
                      aria-pressed={activeBlock === block}
                      className={`min-h-11 min-w-12 rounded-xl px-4 text-sm font-bold ${
                        activeBlock === block ? 'bg-blue-600 text-white' : 'bg-slate-800 text-slate-300'
                      }`}>
                      {block}
                    </button>
                  ))}
                </div>
              </section>
            )}

            {activeBlock ? (
              <>
                <div className="grid grid-cols-3 gap-2">
                  <Metric value={tasks.pending} label={t('avs_kiosk.home.pending')} tone="amber" />
                  <Metric value={tasks.completed} label={t('avs_kiosk.home.completed')} tone="green" />
                  <Metric value={tasks.skipped} label={t('avs_kiosk.home.skipped')} tone="red" />
                </div>
                <section className="rounded-2xl border border-slate-800 bg-slate-900 p-4">
                  <div className="flex items-center justify-between text-sm">
                    <span className="font-medium text-slate-200">{activeBlock} · {t('avs_kiosk.home.daily_progress')}</span>
                    <span className="font-bold text-green-400">%{taskProgress}</span>
                  </div>
                  <div className="mt-3 h-2 overflow-hidden rounded-full bg-slate-800">
                    <div className="h-full rounded-full bg-green-500 transition-all"
                      style={{ width: `${taskProgress}%` }} />
                  </div>
                </section>
                {tasks.next && (
                  <button type="button" onClick={() => onNavigate('tasks')}
                    className="w-full rounded-2xl border border-slate-700 bg-slate-900 p-5 text-left active:scale-[0.99]">
                    <div className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                      {t('avs_kiosk.home.next_task')}
                    </div>
                    <div className="mt-2 text-lg font-semibold text-slate-100">{tasks.next.area}</div>
                    <div className="mt-1 text-sm text-slate-400">
                      {tasks.next.block} · {t('avs_kiosk.home.floor')} {tasks.next.floor}
                    </div>
                  </button>
                )}
              </>
            ) : (
              <div className="rounded-2xl bg-slate-900 p-5 text-center text-sm text-slate-400">
                {t('avs_kiosk.home.select_block_first')}
              </div>
            )}
          </>
        )}

        {role === 'technical' && (
          <>
            <div className="grid grid-cols-3 gap-2">
              <Metric value={faults.mine} label={t('avs_kiosk.home.my_active_jobs')} />
              <Metric value={faults.available} label={t('avs_kiosk.home.available_jobs')} tone="amber" />
              <Metric value={faults.urgent} label={t('avs_kiosk.home.urgent')} tone="red" />
            </div>
            <button type="button" onClick={() => onNavigate('tasks')}
              className="flex min-h-16 w-full items-center justify-between rounded-2xl border border-blue-500/40 bg-blue-950/30 px-4 text-left">
              <span>
                <span className="block text-sm font-semibold text-blue-200">{t('avs_kiosk.home.technical_pool')}</span>
                <span className="mt-1 block text-xs text-slate-400">
                  {faults.in_progress || 0} {t('avs_kiosk.home.in_progress').toLocaleLowerCase()}
                </span>
              </span>
              <span className="text-xl text-blue-300">→</span>
            </button>
          </>
        )}

        {role !== 'housekeeping' && role !== 'technical' && (
          <>
            <div className="grid grid-cols-2 gap-2">
              <Metric value={data?.next_shift ? 1 : 0} label={t('avs_kiosk.home.next_shift')} />
              <Metric value={faults.open} label={t('avs_kiosk.home.my_open_faults')} tone="amber" />
            </div>

            <div className="space-y-3">
              {data?.next_shift && (
                <button type="button" onClick={() => onNavigate('shifts')}
                  className="min-h-20 w-full rounded-2xl border border-slate-700 bg-slate-900 p-4 text-left active:bg-slate-800">
                  <div className="text-xs font-semibold uppercase tracking-wider text-blue-400">
                    {t('avs_kiosk.home.next_shift')}
                  </div>
                  <div className="mt-1 font-semibold text-slate-100">
                    {data.next_shift.shift_name || data.next_shift.status}
                  </div>
                  <div className="mt-1 text-sm text-slate-400">
                    {data.next_shift.work_date}
                    {data.next_shift.start_hour ? ` · ${data.next_shift.start_hour}–${data.next_shift.end_hour}` : ''}
                  </div>
                </button>
              )}

              {(data?.transport?.pickup_name || data?.transport?.schedule) && (
                <button type="button" onClick={() => onNavigate('transport')}
                  className="min-h-20 w-full rounded-2xl border border-slate-700 bg-slate-900 p-4 text-left active:bg-slate-800">
                  <div className="text-xs font-semibold uppercase tracking-wider text-cyan-400">
                    {t('avs_kiosk.home.service_summary')}
                  </div>
                  <div className="mt-1 font-semibold text-slate-100">
                    {data.transport.schedule?.route_name || data.transport.pickup_name}
                  </div>
                  <div className="mt-1 text-sm text-slate-400">
                    {[data.transport.pickup_name, data.transport.schedule?.time, data.transport.schedule?.plate]
                      .filter(Boolean).join(' · ')}
                  </div>
                </button>
              )}

              {data?.announcements?.length > 0 && (
                <button type="button" onClick={() => onNavigate('announcements')}
                  className="min-h-20 w-full rounded-2xl border border-slate-700 bg-slate-900 p-4 text-left active:bg-slate-800">
                  <div className="text-xs font-semibold uppercase tracking-wider text-amber-400">
                    {t('avs_kiosk.home.announcements_summary')}
                  </div>
                  <div className="mt-1 font-semibold text-slate-100">{data.announcements[0].title}</div>
                  <div className="mt-1 line-clamp-2 text-sm text-slate-400">{data.announcements[0].body}</div>
                </button>
              )}
            </div>
          </>
        )}

        <div className="grid grid-cols-2 gap-3">
          {(role === 'housekeeping' || role === 'technical') && (
            <button type="button" onClick={() => onNavigate('tasks')}
              className="min-h-24 rounded-2xl bg-blue-600 p-4 text-left text-white active:bg-blue-500">
              <div className="text-2xl">✅</div>
              <div className="mt-2 text-sm font-semibold">{t('avs_kiosk.home.go_tasks')}</div>
            </button>
          )}
          <button type="button" onClick={() => onNavigate('quick_fault')}
            className="min-h-24 rounded-2xl bg-amber-600 p-4 text-left text-white active:bg-amber-500">
            <div className="text-2xl">🔧</div>
            <div className="mt-2 text-sm font-semibold">{t('avs_kiosk.home.report_fault')}</div>
          </button>
          <button type="button" onClick={() => onNavigate('shifts')}
            className="min-h-24 rounded-2xl bg-slate-800 p-4 text-left text-slate-100 active:bg-slate-700">
            <div className="text-2xl">⏱</div>
            <div className="mt-2 text-sm font-semibold">{t('avs_kiosk.nav.shifts')}</div>
          </button>
        </div>
      </div>
    </TabState>
  )
}
