import { useTranslation } from '../../../shared/i18n/index.js'

export default function MealsTab({ menuToday, mealSel, setMealSel }) {
  const { t } = useTranslation()
  return (
    <div className="space-y-4 pb-4">
      {/* Bugünün menüsü */}
      {menuToday.length > 0 && (
        <div className="space-y-3">
          <h2 className="font-medium text-slate-300">{t('avs_kiosk.meals.title')}</h2>
          {menuToday.map(m => (
            <div key={m.meal_type} className="bg-slate-900 rounded-2xl p-5">
              <div className="font-medium text-slate-200 mb-2">{t('avs_kiosk.meals.' + m.meal_type, m.meal_type)}</div>
              <div className="text-sm text-slate-400 whitespace-pre-line">{m.items}</div>
            </div>
          ))}
        </div>
      )}

      {/* Faz 8 — Yarın geleceğim seçimi */}
      <div className="bg-slate-900 rounded-2xl p-5 space-y-3">
        <div>
          <h2 className="font-medium text-slate-200">{t('avs_kiosk.meals.tomorrow_title')}</h2>
          <p className="text-xs text-slate-500 mt-1">{t('avs_kiosk.meals.tomorrow_hint')}</p>
        </div>
        {['breakfast', 'lunch', 'dinner', 'snack'].map(mt => {
          const attending = mealSel[mt] === 1
          return (
            <div key={mt} className="flex items-center justify-between">
              <span className="text-slate-300">{t('avs_kiosk.meals.' + mt, mt)}</span>
              <button
                onClick={() => setMealSel.mutate({ meal_type: mt, attending: !attending })}
                disabled={setMealSel.isPending}
                className={`px-4 py-2 rounded-xl text-sm font-medium transition ${attending ? 'bg-green-600 text-white' : 'bg-slate-700 text-slate-300'}`}>
                {attending ? `✓ ${t('avs_kiosk.meals.attending')}` : t('avs_kiosk.meals.not_attending')}
              </button>
            </div>
          )
        })}
      </div>
    </div>
  )
}
