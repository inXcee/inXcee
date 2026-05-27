import { useClock } from '../../../shared/hooks/useClock.js'
import { useTranslation } from '../../../shared/i18n/index.js'

// Üst bar: kullanıcı adı + canlı saat/tarih + yenile + çıkış.
// props:
//   userName, onLogout
//   onRefresh  — aktif sekmenin verisini yeniden çeker (opsiyonel)
//   refreshing — yenileme sürüyor mu (↻ döner)
export default function KioskHeader({ userName, onLogout, onRefresh, refreshing }) {
  const { t } = useTranslation()
  const { time, date } = useClock()
  return (
    <div className="flex items-center justify-between py-3 mb-4">
      <div className="min-w-0">
        <div className="font-semibold text-slate-100 truncate">{userName}</div>
        <div className="text-xs text-slate-500">{date}</div>
      </div>
      <div className="flex items-center gap-2">
        <div className="text-lg font-semibold text-slate-300 tabular-nums mr-1">{time}</div>
        {onRefresh && (
          <button onClick={onRefresh} disabled={refreshing} aria-label={t('avs_kiosk.refresh')}
            title={t('avs_kiosk.refresh')}
            className="text-slate-400 hover:text-slate-200 w-9 h-9 flex items-center justify-center bg-slate-800 rounded-xl disabled:opacity-50">
            <span className={refreshing ? 'inline-block animate-spin' : 'inline-block'}>↻</span>
          </button>
        )}
        <button onClick={onLogout}
          className="text-sm text-slate-400 hover:text-slate-200 px-3 py-2 bg-slate-800 rounded-xl">
          {t('avs_kiosk.logout')}
        </button>
      </div>
    </div>
  )
}
