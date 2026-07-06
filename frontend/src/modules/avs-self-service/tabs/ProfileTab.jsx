import { useTranslation } from '../../../shared/i18n/index.js'

export default function ProfileTab({
  myInfo, pinForm, setPinForm, pinMsg, handlePinSubmit, submitPin,
  fbForm, setFbForm, fbSuccess, setFbSuccess, submitFeedback,
}) {
  const { t } = useTranslation()
  return (
    <div className="space-y-4">
      <div className="bg-slate-900 rounded-2xl p-5 space-y-3">
        <h2 className="font-medium text-slate-300">{t('avs_kiosk.profile.info')}</h2>
        {myInfo?.department_name && (
          <div className="flex justify-between text-sm"><span className="text-slate-500">{t('avs_kiosk.profile.department')}</span><span className="text-slate-200 font-medium">{myInfo.department_name}</span></div>
        )}
        {myInfo?.role_label && (
          <div className="flex justify-between text-sm"><span className="text-slate-500">{t('avs_kiosk.profile.role')}</span><span className="text-slate-200 font-medium">{myInfo.role_label}</span></div>
        )}
        {myInfo?.phone && (
          <div className="flex justify-between text-sm"><span className="text-slate-500">{t('avs_kiosk.profile.phone')}</span><span className="text-slate-200 font-medium">{myInfo.phone}</span></div>
        )}
        {myInfo?.pickup_name && (
          <div className="flex justify-between text-sm"><span className="text-slate-500">{t('avs_kiosk.profile.pickup')}</span><span className="text-slate-200 font-medium">{myInfo.pickup_name}</span></div>
        )}
        <div className="text-xs text-slate-600 pt-2">{t('avs_kiosk.profile.readonly_note')}</div>
      </div>

      <div className="bg-slate-900 rounded-2xl p-5 space-y-4">
        <h2 className="font-medium text-slate-300">{t('avs_kiosk.profile.change_pin')}</h2>
        {[['current_pin', t('avs_kiosk.profile.current_pin')], ['new_pin', t('avs_kiosk.profile.new_pin')], ['new_pin2', t('avs_kiosk.profile.new_pin2')]].map(([field, lbl]) => (
          <div key={field}>
            <label className="block text-sm text-slate-400 mb-2">{lbl}</label>
            <input type="password" inputMode="numeric" maxLength={4} value={pinForm[field]}
              onChange={e => setPinForm(p => ({ ...p, [field]: e.target.value.replace(/\D/g, '').slice(0, 4) }))}
              className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 text-slate-100 text-center text-xl tracking-widest focus:outline-none focus:border-amber-500"
              placeholder="····" />
          </div>
        ))}
        {pinMsg.text && <div className={`text-sm text-center ${pinMsg.type === 'ok' ? 'text-green-400' : 'text-red-400'}`}>{pinMsg.text}</div>}
        <button onClick={handlePinSubmit}
          disabled={submitPin.isPending || pinForm.current_pin.length !== 4 || pinForm.new_pin.length !== 4 || pinForm.new_pin2.length !== 4}
          className="w-full bg-blue-600 hover:bg-blue-500 disabled:bg-slate-700 text-white rounded-xl py-3 text-sm font-medium">
          {submitPin.isPending ? t('avs_kiosk.loading') : t('avs_kiosk.profile.change_pin')}
        </button>
      </div>

      <div className="bg-slate-900 rounded-2xl p-5 space-y-4">
        <h2 className="font-medium text-slate-300">{t('avs_kiosk.feedback.title')}</h2>
        {fbSuccess ? (
          <div className="text-center py-4">
            <div className="text-3xl mb-2">🙏</div>
            <div className="text-green-400 text-sm">{t('avs_kiosk.feedback.success')}</div>
            <button onClick={() => setFbSuccess(false)} className="mt-3 text-xs text-blue-400">{t('avs_kiosk.feedback.title')}</button>
          </div>
        ) : (
          <>
            <div className="flex gap-2">
              {[['complaint', t('avs_kiosk.feedback.complaint')], ['suggestion', t('avs_kiosk.feedback.suggestion')], ['other', t('avs_kiosk.feedback.other')]].map(([val, lbl]) => (
                <button key={val} type="button" onClick={() => setFbForm(p => ({ ...p, type: val }))}
                  className={`flex-1 py-2 rounded-xl text-xs font-medium ${fbForm.type === val ? 'bg-blue-700 text-white' : 'bg-slate-800 text-slate-400'}`}>{lbl}</button>
              ))}
            </div>
            <textarea value={fbForm.message} onChange={e => setFbForm(p => ({ ...p, message: e.target.value }))}
              rows={3} placeholder={t('avs_kiosk.feedback.placeholder')}
              className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 text-sm text-slate-100 focus:outline-none focus:border-blue-500" />
            <button onClick={() => submitFeedback.mutate()} disabled={submitFeedback.isPending || fbForm.message.trim().length < 20}
              className="w-full bg-blue-600 hover:bg-blue-500 disabled:bg-slate-700 text-white rounded-xl py-3 text-sm font-medium">
              {submitFeedback.isPending ? t('avs_kiosk.loading') : t('avs_kiosk.feedback.submit')}
            </button>
          </>
        )}
      </div>
    </div>
  )
}
