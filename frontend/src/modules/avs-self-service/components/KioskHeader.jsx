import { useClock } from '../../../shared/hooks/useClock.js'
import { useTranslation } from '../../../shared/i18n/index.js'

// Üst bar: kullanıcı adı + canlı saat/tarih + çıkış. props: userName, onLogout
export default function KioskHeader({ userName, onLogout }) {
  const { t } = useTranslation()
  const { time, date } = useClock()
  return (
    <div className="flex items-center justify-between py-3 mb-4">
      <div className="min-w-0">
        <div className="font-semibold text-slate-100 truncate">{userName}</div>
        <div className="text-xs text-slate-500">{date}</div>
      </div>
      <div className="flex items-center gap-3">
        <div className="text-lg font-semibold text-slate-300 tabular-nums">{time}</div>
        <button onClick={onLogout}
          className="text-sm text-slate-400 hover:text-slate-200 px-3 py-2 bg-slate-800 rounded-xl">
          {t('avs_kiosk.logout')}
        </button>
      </div>
    </div>
  )
}
