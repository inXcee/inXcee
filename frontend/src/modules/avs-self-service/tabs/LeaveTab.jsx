import { useTranslation } from '../../../shared/i18n/index.js'

export default function LeaveTab({
  leaveData, leaveForm, setLeaveForm, leaveSuccess, setLeaveSuccess,
  leaveError, submitLeave, leaveReqDays, annualRemaining, overAnnualBalance,
}) {
  const { t } = useTranslation()
  return (
    <div className="space-y-4">
      <div className="bg-slate-900 rounded-2xl p-5">
        <div className="text-xs text-slate-500">{t('avs_kiosk.leave.balance_remaining')}</div>
        <div className="text-3xl font-bold text-green-400">
          {leaveData?.balance ? (leaveData.balance.annual_total - leaveData.balance.annual_used) : '—'} <span className="text-base text-slate-400">{t('avs_kiosk.leave.days')}</span>
        </div>
        {leaveData?.balance && (
          <div className="text-xs text-slate-500 mt-2">
            {t('avs_kiosk.leave.sick_used')}: {leaveData.balance.sick_used} · {t('avs_kiosk.leave.emergency_used')}: {leaveData.balance.emergency_used}
          </div>
        )}
      </div>

      <div className="bg-slate-900 rounded-2xl p-5 space-y-4">
        {leaveSuccess ? (
          <div className="text-center py-4">
            <div className="text-3xl mb-2">🌴</div>
            <div className="text-green-400 text-sm">{t('avs_kiosk.leave.success')}</div>
            <button onClick={() => setLeaveSuccess(false)} className="mt-3 text-xs text-blue-400">{t('avs_kiosk.leave.title')}</button>
          </div>
        ) : (
          <>
            <div>
              <label className="block text-sm text-slate-400 mb-2">{t('avs_kiosk.leave.type')}</label>
              <select value={leaveForm.leave_type} onChange={e => setLeaveForm(p => ({ ...p, leave_type: e.target.value }))}
                className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 text-sm text-slate-100">
                <option value="annual">{t('avs_kiosk.leave.type_annual')}</option>
                <option value="sick">{t('avs_kiosk.leave.type_sick')}</option>
                <option value="emergency">{t('avs_kiosk.leave.type_emergency')}</option>
                <option value="other">{t('avs_kiosk.leave.type_other')}</option>
              </select>
            </div>
            <div className="flex gap-2">
              <div className="flex-1">
                <label className="block text-sm text-slate-400 mb-2">{t('avs_kiosk.leave.start')}</label>
                <input type="date" value={leaveForm.start_date} onChange={e => setLeaveForm(p => ({ ...p, start_date: e.target.value }))}
                  className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-3 text-sm text-slate-100" />
              </div>
              <div className="flex-1">
                <label className="block text-sm text-slate-400 mb-2">{t('avs_kiosk.leave.end')}</label>
                <input type="date" value={leaveForm.end_date} onChange={e => setLeaveForm(p => ({ ...p, end_date: e.target.value }))}
                  className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-3 text-sm text-slate-100" />
              </div>
            </div>
            {leaveReqDays > 0 && (
              <div className="flex items-center justify-between bg-slate-800 rounded-xl px-4 py-2.5 text-sm">
                <span className="text-slate-400">{t('avs_kiosk.leave.requested')}</span>
                <span className={`font-semibold ${overAnnualBalance ? 'text-red-400' : 'text-slate-100'}`}>
                  {leaveReqDays} {t('avs_kiosk.leave.days')}
                </span>
              </div>
            )}
            <textarea value={leaveForm.reason} onChange={e => setLeaveForm(p => ({ ...p, reason: e.target.value }))}
              rows={2} placeholder={t('avs_kiosk.leave.reason')}
              className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 text-sm text-slate-100" />
            {overAnnualBalance && (
              <div className="text-amber-400 text-sm text-center">
                {t('avs_kiosk.leave.over_balance')} {annualRemaining} {t('avs_kiosk.leave.days')}.
              </div>
            )}
            {leaveError && <div className="text-red-400 text-sm text-center">{leaveError}</div>}
            <button onClick={() => submitLeave.mutate()} disabled={submitLeave.isPending || !leaveForm.start_date || !leaveForm.end_date || overAnnualBalance}
              className="w-full bg-blue-600 hover:bg-blue-500 disabled:bg-slate-700 text-white rounded-xl py-3 text-sm font-medium">
              {submitLeave.isPending ? t('avs_kiosk.loading') : t('avs_kiosk.leave.submit')}
            </button>
          </>
        )}
      </div>

      <div>
        <h3 className="text-sm font-medium text-slate-400 mb-2">{t('avs_kiosk.leave.my_requests')}</h3>
        {!leaveData?.requests?.length ? (
          <div className="bg-slate-900 rounded-2xl p-4 text-slate-500 text-sm">{t('avs_kiosk.leave.none')}</div>
        ) : (
          <div className="space-y-2">
            {leaveData.requests.map(r => {
              const color = r.status === 'approved' ? 'text-green-400' : r.status === 'rejected' ? 'text-red-400' : 'text-amber-400'
              return (
                <div key={r.id} className="bg-slate-900 rounded-xl px-4 py-3 flex justify-between items-center">
                  <div>
                    <div className="text-sm text-slate-200">{t('avs_kiosk.leave.type_' + r.leave_type, r.leave_type)}</div>
                    <div className="text-xs text-slate-500">{r.start_date} → {r.end_date} ({r.total_days} {t('avs_kiosk.leave.days')})</div>
                  </div>
                  <span className={`text-xs font-medium ${color}`}>{t('avs_kiosk.leave.status_' + r.status)}</span>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
