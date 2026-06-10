import { useTranslation } from '../../../shared/i18n/index.js'
import TabState from '../components/TabState.jsx'

export default function QrTab({ query, myCards, cardImgs }) {
  const { t } = useTranslation()
  return (
    <TabState query={query} skeletonRows={2}
      isEmpty={!!query.data && myCards.length === 0} emptyText={t('avs_kiosk.cards.none')}>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {myCards.map(c => {
          const isAccess = c.card_type === 'access'
          return (
            <div key={c.id} className={`rounded-2xl p-5 text-center border ${isAccess ? 'border-blue-500/40 bg-blue-950/30' : 'border-orange-500/40 bg-orange-950/30'}`}>
              <div className={`text-xs font-bold tracking-wide ${isAccess ? 'text-blue-300' : 'text-orange-300'}`}>
                {isAccess ? `🪪 ${t('avs_kiosk.cards.access')}` : `🍽 ${t('avs_kiosk.cards.meal')}`}
              </div>
              {cardImgs[c.card_type] && <img src={cardImgs[c.card_type]} alt={c.card_type} className="mx-auto mt-3 w-44 h-44 bg-white p-2 rounded-xl" />}
              <div className="text-[11px] text-slate-500 mt-2 font-mono">#{c.code.slice(-6).toUpperCase()}</div>
            </div>
          )
        })}
      </div>
      <div className="text-xs text-slate-500 mt-3 text-center">{t('avs_kiosk.cards.hint')}</div>
    </TabState>
  )
}
