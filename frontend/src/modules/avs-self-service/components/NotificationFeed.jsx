import { useEffect, useState } from 'react'
import { useTranslation } from '../../../shared/i18n/index.js'
import { getPushPermission } from '../../../shared/utils/pushSubscribe.js'
import { subscribeAvsPush, unsubscribeAvsPush, isPushSupported, getCurrentSubscription } from '../avsPush.js'

// SQLite 'YYYY-MM-DD HH:MM:SS' (UTC) → yerel tarih/saat
function fmtTs(ts, locale) {
  if (!ts) return ''
  const d = new Date(ts.replace(' ', 'T') + 'Z')
  if (Number.isNaN(d.getTime())) return ''
  return d.toLocaleString(locale === 'ar' ? 'ar' : locale === 'en' ? 'en-GB' : 'tr-TR',
    { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
}

const ICON = { leave: '🌴', maintenance: '🔧', announcement: '📢' }

function itemTitle(item, t) {
  if (item.kind === 'leave')
    return item.status === 'approved' ? t('avs_kiosk.notifications.leave_approved') : t('avs_kiosk.notifications.leave_rejected')
  if (item.kind === 'maintenance') return t('avs_kiosk.notifications.maintenance_done')
  return item.title || t('avs_kiosk.notifications.announcement')
}

function itemBody(item, t) {
  if (item.kind === 'leave') {
    const type = t('avs_kiosk.leave.type_' + item.leave_type, item.leave_type)
    return `${type} · ${item.start_date} – ${item.end_date} (${item.total_days} ${t('avs_kiosk.leave.days')})`
  }
  if (item.kind === 'maintenance') return item.location
  return item.body || ''
}

// Bildirim akışı paneli — header zilinden açılır, alt sheet olarak çıkar.
// props: open, onClose, items, avsApi (push opt-in için)
export default function NotificationFeed({ open, onClose, items, avsApi }) {
  const { t, locale } = useTranslation()
  // 'unknown' | 'unsupported' | 'denied' | 'off' | 'on'
  const [pushState, setPushState] = useState('unknown')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!open) return
    const onKey = e => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  // Panel açılınca push durumunu belirle (telefonda anlamlı, terminalde sadece "kapalı")
  useEffect(() => {
    if (!open) return
    if (!isPushSupported()) { setPushState('unsupported'); return }
    if (getPushPermission() === 'denied') { setPushState('denied'); return }
    let alive = true
    getCurrentSubscription().then(s => { if (alive) setPushState(s ? 'on' : 'off') })
    return () => { alive = false }
  }, [open])

  const enablePush = async () => {
    setBusy(true)
    const sub = await subscribeAvsPush(avsApi)
    setBusy(false)
    setPushState(sub ? 'on' : (getPushPermission() === 'denied' ? 'denied' : 'off'))
  }
  const disablePush = async () => {
    setBusy(true)
    await unsubscribeAvsPush(avsApi)
    setBusy(false)
    setPushState('off')
  }

  if (!open) return null

  return (
    <>
      <div className="fixed inset-0 z-40 bg-black/50" onClick={onClose} aria-hidden="true" />
      <div role="dialog" aria-label={t('avs_kiosk.notifications.title')}
        className="fixed inset-x-0 top-0 max-w-lg mx-auto z-50 bg-slate-900 border-b border-slate-800 rounded-b-2xl shadow-2xl max-h-[85vh] flex flex-col"
        style={{ paddingTop: 'env(safe-area-inset-top)' }}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-800">
          <h2 className="font-semibold text-slate-100">🔔 {t('avs_kiosk.notifications.title')}</h2>
          <button type="button" onClick={onClose}
            className="text-slate-400 hover:text-slate-200 text-sm px-3 py-1.5 bg-slate-800 rounded-xl">
            {t('common.close')}
          </button>
        </div>

        <div className="overflow-y-auto p-3 space-y-2">
          {items.length === 0 ? (
            <div className="text-slate-500 text-sm text-center py-10">{t('avs_kiosk.notifications.none')}</div>
          ) : items.map((item, i) => (
            <div key={`${item.kind}-${item.id}-${i}`} className="bg-slate-800 rounded-xl px-4 py-3 flex gap-3">
              <span className="text-xl leading-none mt-0.5">{ICON[item.kind] || '•'}</span>
              <div className="min-w-0 flex-1">
                <div className="text-sm font-medium text-slate-100">{itemTitle(item, t)}</div>
                <div className="text-xs text-slate-400 mt-0.5 break-words">{itemBody(item, t)}</div>
                <div className="text-[11px] text-slate-600 mt-1">{fmtTs(item.ts, locale)}</div>
              </div>
            </div>
          ))}
        </div>

        {/* Push opt-in — kişisel telefonda anlamlı; desteklenmiyorsa gizli */}
        {avsApi && pushState !== 'unsupported' && pushState !== 'unknown' && (
          <div className="border-t border-slate-800 px-5 py-4">
            {pushState === 'on' ? (
              <div className="flex items-center justify-between">
                <span className="text-sm text-green-400">🔔 {t('avs_kiosk.notifications.push_on')}</span>
                <button type="button" onClick={disablePush} disabled={busy}
                  className="text-xs text-slate-400 hover:text-slate-200 px-3 py-1.5 bg-slate-800 rounded-xl disabled:opacity-50">
                  {t('avs_kiosk.notifications.push_off')}
                </button>
              </div>
            ) : pushState === 'denied' ? (
              <div className="text-xs text-slate-500 text-center">{t('avs_kiosk.notifications.push_denied')}</div>
            ) : (
              <button type="button" onClick={enablePush} disabled={busy}
                className="w-full bg-slate-800 hover:bg-slate-700 text-blue-400 rounded-xl py-2.5 text-sm font-medium disabled:opacity-50">
                {busy ? '…' : `🔔 ${t('avs_kiosk.notifications.push_enable')}`}
              </button>
            )}
          </div>
        )}
      </div>
    </>
  )
}
