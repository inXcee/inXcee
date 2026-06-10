import { useTranslation } from '../../../shared/i18n/index.js'
import TabState from '../components/TabState.jsx'

export default function TransportTab({ query, data }) {
  const { t } = useTranslation()
  return (
    <TabState query={query}
      isEmpty={!data?.pickup} emptyText={t('avs_kiosk.transport.none')}>
      <div className="space-y-4">
        <div className="bg-slate-900 rounded-2xl p-5">
          {data.schedule?.time && (
            <div className="text-3xl font-bold text-blue-400 mb-1">🕐 {data.schedule.time}</div>
          )}
          <h2 className="font-medium text-slate-300 mb-1">📍 {t('avs_kiosk.transport.stop')}</h2>
          <div className="text-xl font-bold text-slate-100">{data.pickup.name}</div>
          {(data.pickup.district || data.pickup.neighborhood) && (
            <div className="text-sm text-slate-500 mt-1">
              {data.pickup.district}{data.pickup.neighborhood ? ` · ${data.pickup.neighborhood}` : ''}
            </div>
          )}
          {data.schedule?.driver_name && (
            <div className="text-sm text-slate-400 mt-2">
              {t('avs_kiosk.transport.driver')}: {data.schedule.driver_name}
              {data.schedule.plate ? ` · ${data.schedule.plate}` : ''}
              {data.schedule.driver_phone ? <a href={`tel:${data.schedule.driver_phone}`} className="text-blue-400 ml-2">{data.schedule.driver_phone}</a> : null}
            </div>
          )}
          {data.pickup.notes && (
            <div className="text-sm text-slate-400 mt-2 whitespace-pre-line">{data.pickup.notes}</div>
          )}
          {data.pickup.lat != null && data.pickup.lng != null && (
            <button onClick={() => window.open(`https://www.google.com/maps?q=${data.pickup.lat},${data.pickup.lng}`, '_blank')}
              className="mt-4 w-full bg-slate-800 hover:bg-slate-700 text-blue-400 rounded-xl py-3 text-sm font-medium">
              {t('avs_kiosk.transport.open_map')}
            </button>
          )}
        </div>
      </div>
    </TabState>
  )
}
