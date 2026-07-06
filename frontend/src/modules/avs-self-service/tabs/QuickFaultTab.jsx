import { useTranslation } from '../../../shared/i18n/index.js'

export default function QuickFaultTab({
  faultForm, setFaultForm, faultPhoto, setFaultPhoto,
  faultSuccess, setFaultSuccess, faultError, submitFault, myFaults,
}) {
  const { t } = useTranslation()
  return (
    <div className="bg-slate-900 rounded-2xl p-5 space-y-4">
      {faultSuccess ? (
        <div className="text-center py-6">
          <div className="text-4xl mb-3">✅</div>
          <div className="text-green-400 font-medium">{t('avs_kiosk.fault.success')}</div>
          <button onClick={() => setFaultSuccess(false)} className="mt-4 text-xs text-blue-400">{t('avs_kiosk.fault.submit')}</button>
        </div>
      ) : (
        <>
          <div>
            <label className="block text-sm text-slate-400 mb-2">{t('avs_kiosk.fault.location')}</label>
            <input value={faultForm.location} onChange={e => setFaultForm(p => ({ ...p, location: e.target.value }))}
              placeholder={t('avs_kiosk.fault.location')}
              className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 text-sm text-slate-100 focus:outline-none focus:border-blue-500" />
          </div>
          <div>
            <label className="block text-sm text-slate-400 mb-2">{t('avs_kiosk.fault.description')}</label>
            <textarea value={faultForm.description} onChange={e => setFaultForm(p => ({ ...p, description: e.target.value }))}
              rows={4} placeholder={t('avs_kiosk.fault.description')}
              className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 text-sm text-slate-100 focus:outline-none focus:border-blue-500" />
          </div>
          <div>
            <label className="block text-sm text-slate-400 mb-2">{t('avs_kiosk.fault.priority')}</label>
            <div className="flex gap-2">
              {[['high', t('avs_kiosk.fault.high')], ['medium', t('avs_kiosk.fault.medium')], ['low', t('avs_kiosk.fault.low')]].map(([val, lbl]) => (
                <button key={val} type="button" onClick={() => setFaultForm(p => ({ ...p, priority: val }))}
                  className={`flex-1 py-2 rounded-xl text-xs font-medium transition-colors ${faultForm.priority === val ? 'bg-blue-700 text-white' : 'bg-slate-800 text-slate-400'}`}>
                  {lbl}
                </button>
              ))}
            </div>
          </div>
          <div>
            {faultPhoto ? (
              <div className="flex items-center justify-between bg-slate-800 rounded-xl px-4 py-3">
                <div className="flex items-center gap-3">
                  <img src={URL.createObjectURL(faultPhoto)} alt="" className="w-12 h-12 rounded-lg object-cover" />
                  <span className="text-sm text-green-400">{t('avs_kiosk.fault.photo_added')}</span>
                </div>
                <button type="button" onClick={() => setFaultPhoto(null)} className="text-xs text-slate-400 hover:text-slate-200">{t('avs_kiosk.fault.remove_photo')}</button>
              </div>
            ) : (
              <label className="flex items-center justify-center gap-2 bg-slate-800 hover:bg-slate-700 rounded-xl py-3 text-sm text-slate-300 cursor-pointer">
                {t('avs_kiosk.fault.add_photo')}
                <input type="file" accept="image/*" capture="environment" className="hidden"
                  onChange={e => setFaultPhoto(e.target.files?.[0] || null)} />
              </label>
            )}
          </div>
          {faultError && <div className="text-red-400 text-sm text-center">{faultError}</div>}
          <button onClick={() => submitFault.mutate()}
            disabled={submitFault.isPending || faultForm.location.trim().length < 3 || faultForm.description.trim().length < 10}
            className="w-full bg-blue-600 hover:bg-blue-500 disabled:bg-slate-700 text-white rounded-xl py-3 text-sm font-medium">
            {submitFault.isPending ? t('avs_kiosk.loading') : t('avs_kiosk.fault.submit')}
          </button>
        </>
      )}
      {myFaults.length > 0 && (
        <div className="border-t border-slate-800 pt-4">
          <h3 className="text-sm font-medium text-slate-400 mb-2">{t('avs_kiosk.my_faults.title')}</h3>
          <div className="space-y-2">
            {myFaults.map(m => (
              <div key={m.id} className="bg-slate-800 rounded-xl px-3 py-2 flex justify-between items-center">
                <span className="text-sm text-slate-200 truncate">{m.location}</span>
                <span className={`text-xs font-medium ${m.status === 'closed' ? 'text-green-400' : m.status === 'open' ? 'text-amber-400' : 'text-blue-400'}`}>{m.status}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
