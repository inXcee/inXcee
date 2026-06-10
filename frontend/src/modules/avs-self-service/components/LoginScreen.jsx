// Kiosk giriş ekranı — isim arama + PIN pad. State orkestratörde (AvsSelfServicePage).
import { useTranslation } from '../../../shared/i18n/index.js'
import LanguageSwitcher from '../../../shared/components/LanguageSwitcher.jsx'
import PinPad from './PinPad.jsx'

export default function LoginScreen({
  nameQuery, onSearch, results, selected, onSelect, onClearSelected,
  pin, setPin, loginError, onLogin,
}) {
  const { t } = useTranslation()
  return (
    <div className="min-h-screen bg-slate-950 flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        <div className="flex justify-center mb-4"><LanguageSwitcher /></div>
        <div className="text-center mb-8">
          <div className="text-5xl mb-4">👷</div>
          <h1 className="text-2xl font-bold text-slate-100">{t('avs_kiosk.title')}</h1>
        </div>
        <form onSubmit={onLogin} className="bg-slate-900 rounded-2xl p-6 space-y-4">
          <div>
            <label className="block text-sm text-slate-400 mb-2">{t('avs_kiosk.name_search')}</label>
            <input type="text" value={nameQuery} onChange={e => onSearch(e.target.value)}
              placeholder={t('avs_kiosk.name_search')} autoFocus
              className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 text-slate-100 focus:outline-none focus:border-blue-500" />
          </div>

          {results.length > 0 && !selected && (
            <div className="bg-slate-800 rounded-xl overflow-hidden">
              {results.map(w => (
                <button key={w.id} type="button" disabled={!w.has_pin}
                  onClick={() => onSelect(w)}
                  className={`w-full text-left px-4 py-3 hover:bg-slate-700 transition-colors border-b border-slate-700 last:border-0 ${!w.has_pin ? 'opacity-50 cursor-not-allowed' : ''}`}>
                  <div className="text-sm text-slate-200 font-medium">{w.full_name}</div>
                  <div className="text-xs text-slate-500">{w.role_label || '—'} {!w.has_pin ? t('avs_kiosk.pin_not_set') : ''}</div>
                </button>
              ))}
            </div>
          )}

          {selected && (
            <div className="flex items-center justify-between bg-slate-800 rounded-xl px-4 py-3">
              <div>
                <div className="text-sm text-slate-200 font-medium">{selected.full_name}</div>
                <div className="text-xs text-slate-500">{selected.role_label || '—'}</div>
              </div>
              <button type="button" onClick={onClearSelected}
                className="text-xs text-slate-500 hover:text-slate-300">{t('avs_kiosk.change')}</button>
            </div>
          )}

          {selected && (
            <div>
              <label className="block text-sm text-slate-400 mb-3 text-center">{t('avs_kiosk.pin')}</label>
              <PinPad value={pin} onChange={setPin} length={4}
                onComplete={(completedPin) => onLogin(null, completedPin)} error={loginError} />
            </div>
          )}
          <button type="submit" disabled={!selected || pin.length !== 4}
            className="w-full bg-blue-600 hover:bg-blue-500 disabled:bg-slate-700 text-white rounded-xl py-3 text-base font-medium transition-colors">
            {t('avs_kiosk.login_button')}
          </button>
        </form>
      </div>
    </div>
  )
}
