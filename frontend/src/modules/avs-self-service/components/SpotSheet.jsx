import { useState } from 'react'
import { useTranslation } from '../../../shared/i18n/index.js'
import { downscalePhoto } from '../../../shared/photo.js'
import { spotTime } from '../logic/board.js'

const SKIP_REASONS = ['occupied', 'dnd', 'locked', 'fault', 'other']
const OCCUPANCY = [['occupied', '👤'], ['empty', '○'], [null, '?']]

// Odalar sekmesinde kutucuğa dokununca açılan alt sayfa: temizlendi / temizlenemedi (sebep) / doluluk /
// arıza bildir. Kapalı odada düğmeler pasif; çevrimdışıyken hiçbir işlem gönderilmez.
export default function SpotSheet({
  spot, isOnline = true, pending = false, error = '',
  onClose, onMark, onUndo, onOccupancy, onReportFault,
  scan = null, onScanRequest, onVerifyLabel, portalHref = null,
}) {
  const { t } = useTranslation()
  const [skipOpen, setSkipOpen] = useState(false)
  const [reason, setReason] = useState('')
  const [note, setNote] = useState('')
  const [photos, setPhotos] = useState([])

  const isRoom = Boolean(spot.room_no)
  const closed = spot.use_state === 'closed'
  const cleaned = spot.status === 'cleaned'
  const blocked = !isOnline || pending || closed
  // Etiketi doğrulanmış kapıda (zorunluluk açık) işaret ancak kapıdaki QR okutulunca yapılır
  const needsScan = Boolean(spot.qr_required) && !scan
  const markBlocked = blocked || needsScan
  const scanTime = scan ? spotTime(scan.at) : null
  const qrLabel = spot.qr_label || 'none'
  const title = isRoom ? `${t('avs_kiosk.board.room')} ${spot.room_no}` : t(`avs_kiosk.board.area_${spot.code}`, spot.label)
  const time = spotTime(spot.at)
  const lastCleaned = spotTime(spot.last_cleaned_at)

  async function addPhotos(event) {
    const files = [...(event.target.files || [])].slice(0, 3 - photos.length)
    event.target.value = ''
    if (!files.length) return
    try {
      const next = await Promise.all(files.map(file => downscalePhoto(file)))
      setPhotos(previous => [...previous, ...next].slice(0, 3))
    } catch {
      // Okunamayan fotoğraf işareti engellemez; fotoğraf isteğe bağlı.
    }
  }

  const mark = (action, extra = {}) => onMark({ action, photos, ...extra })

  return (
    <div className="fixed inset-0 z-[60] flex items-end justify-center bg-black/60" onClick={onClose}>
      <div role="dialog" aria-modal="true" aria-label={spot.location} onClick={event => event.stopPropagation()}
        className="max-h-[90vh] w-full max-w-lg space-y-4 overflow-y-auto rounded-t-3xl border border-slate-700 bg-slate-900 p-5 pb-8">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-xl font-semibold text-white">{title}</h2>
            <p className="mt-1 text-sm text-slate-400">
              {cleaned && `✓ ${t('avs_kiosk.board.today_cleaned')}${time ? ` ${time}` : ''}${spot.by ? ` · ${spot.mine ? t('avs_kiosk.board.mine') : spot.by}` : ''}`}
              {spot.status === 'skipped' && `⊘ ${t('avs_kiosk.board.today_skipped')}${spot.skip_reason ? `: ${spot.skip_reason}` : ''}`}
              {!spot.status && (lastCleaned
                ? `${t('avs_kiosk.board.last_cleaned')}: ${lastCleaned}`
                : t('avs_kiosk.board.never_cleaned'))}
            </p>
            {scan && (
              <p className="mt-1 text-sm font-semibold text-green-300">
                📍 {t('avs_kiosk.board.qr_verified')}{scanTime ? ` · ${scanTime}` : ''}
              </p>
            )}
          </div>
          <button type="button" onClick={onClose} aria-label={t('avs_kiosk.board.close')}
            className="min-h-12 min-w-12 rounded-xl bg-slate-800 text-slate-300">✕</button>
        </div>

        {closed && <p className="rounded-xl bg-slate-800 p-3 text-sm text-slate-300">⛔ {t('avs_kiosk.board.closed_info')}</p>}
        {!isOnline && (
          <p role="status" className="rounded-xl border border-amber-500/40 bg-amber-950/40 p-3 text-sm text-amber-200">
            {t('avs_kiosk.connection_waiting')}
          </p>
        )}
        {error && <p role="alert" className="rounded-xl border border-red-500/40 bg-red-950/30 p-3 text-sm text-red-300">{error}</p>}
        {spot.complaint?.open && (
          <div className="rounded-xl border border-red-500/50 bg-red-950/40 p-3 text-sm text-red-200">
            <b>⚠ {t('avs_kiosk.board.complaint')}</b>
            {spot.complaint.comment && <p className="mt-1">“{spot.complaint.comment}”</p>}
          </div>
        )}
        {spot.complaint && !spot.complaint.open && (
          <p className="text-xs text-slate-400">{t('avs_kiosk.board.complaint_done')}</p>
        )}
        {spot.pickup_request && (
          <div className="rounded-xl border border-amber-500/40 bg-amber-950/30 p-3 text-sm text-amber-200">
            🧺 {t('avs_kiosk.board.pickup_request')}
            {spotTime(spot.pickup_request.created_at) ? ` · ${spotTime(spot.pickup_request.created_at)}` : ''}
            {spot.pickup_request.note && <p className="mt-1 text-amber-100/80">{spot.pickup_request.note}</p>}
          </div>
        )}
        {needsScan && !closed && (
          <div className="rounded-xl border border-blue-500/40 bg-blue-950/40 p-3 text-sm text-blue-200">
            <p>{t('avs_kiosk.board.scan_required')}</p>
            <button type="button" onClick={onScanRequest} disabled={!isOnline || pending}
              className="mt-2 min-h-12 w-full rounded-xl bg-blue-600 font-semibold text-white disabled:opacity-50">
              📷 {t('avs_kiosk.board.scan')}
            </button>
          </div>
        )}

        {cleaned ? (
          spot.mine && (
            <button type="button" onClick={onUndo} disabled={blocked}
              className="min-h-14 w-full rounded-2xl bg-slate-800 text-base font-semibold text-blue-300 disabled:opacity-50">
              ↩ {t('avs_kiosk.board.undo')}
            </button>
          )
        ) : (
          <>
            <button type="button" onClick={() => mark('clean')} disabled={markBlocked}
              className="min-h-16 w-full rounded-2xl bg-green-600 text-lg font-semibold text-white disabled:bg-slate-700 disabled:text-slate-400">
              ✓ {t('avs_kiosk.board.clean')}
            </button>
            <button type="button" onClick={() => setSkipOpen(open => !open)} disabled={markBlocked} aria-expanded={skipOpen}
              className="min-h-12 w-full rounded-2xl bg-slate-800 text-sm font-semibold text-amber-300 disabled:opacity-50">
              ⊘ {t('avs_kiosk.board.not_cleaned')}
            </button>
            {skipOpen && (
              <div className="space-y-3 rounded-2xl border border-slate-700 bg-slate-950 p-3">
                <div className="grid grid-cols-2 gap-2">
                  {SKIP_REASONS.map(item => (
                    <button key={item} type="button" onClick={() => setReason(item)} aria-pressed={reason === item}
                      className={`min-h-12 rounded-xl px-2 text-sm ${reason === item ? 'bg-amber-600 text-white' : 'bg-slate-800 text-slate-300'}`}>
                      {t(`avs_kiosk.tasks.skip_${item}`)}
                    </button>
                  ))}
                </div>
                {reason === 'other' && (
                  <input value={note} onChange={event => setNote(event.target.value)} maxLength={300}
                    placeholder={t('avs_kiosk.tasks.skip_note')}
                    className="min-h-12 w-full rounded-xl border border-slate-700 bg-slate-800 px-3 text-sm text-white" />
                )}
                <button type="button" disabled={!reason || markBlocked}
                  onClick={() => mark('skip', { reason, ...(note.trim() ? { note: note.trim() } : {}) })}
                  className="min-h-12 w-full rounded-xl bg-amber-600 text-sm font-semibold text-white disabled:bg-slate-700">
                  {t('avs_kiosk.board.save_skip')}
                </button>
              </div>
            )}
            {spot.status === 'skipped' && spot.mine && (
              <button type="button" onClick={onUndo} disabled={blocked}
                className="min-h-12 w-full rounded-2xl bg-slate-800 text-sm font-semibold text-blue-300 disabled:opacity-50">
                ↩ {t('avs_kiosk.board.undo')}
              </button>
            )}
            {!closed && (
              <div>
                {photos.length > 0 && (
                  <div className="mb-2 grid grid-cols-3 gap-2">
                    {photos.map((photo, index) => (
                      <div key={index} className="relative aspect-square overflow-hidden rounded-xl border border-slate-700">
                        <img src={photo} alt="" className="h-full w-full object-cover" />
                        <button type="button" aria-label={t('avs_kiosk.board.remove_photo')}
                          onClick={() => setPhotos(previous => previous.filter((_, i) => i !== index))}
                          className="absolute right-1 top-1 h-8 w-8 rounded-full bg-black/70 text-sm text-white">✕</button>
                      </div>
                    ))}
                  </div>
                )}
                {photos.length < 3 && (
                  <label className="flex min-h-12 cursor-pointer items-center justify-center rounded-xl border border-dashed border-slate-600 text-sm text-slate-300">
                    📷 {t('avs_kiosk.board.photo_optional')}
                    <input type="file" accept="image/*" capture="environment" multiple className="hidden" onChange={addPhotos} />
                  </label>
                )}
              </div>
            )}
          </>
        )}

        {isRoom && !closed && (
          <div>
            <div className="mb-2 text-sm font-medium text-slate-300">{t('avs_kiosk.board.occupancy')}</div>
            <div className="grid grid-cols-3 gap-2">
              {OCCUPANCY.map(([value, icon]) => (
                <button key={value ?? 'unknown'} type="button" onClick={() => onOccupancy(value)}
                  disabled={!isOnline || pending || spot.occupancy === value} aria-pressed={spot.occupancy === value}
                  className={`min-h-12 rounded-xl text-sm font-semibold ${
                    spot.occupancy === value ? 'bg-blue-600 text-white' : 'bg-slate-800 text-slate-300'
                  } disabled:cursor-default`}>
                  {icon} {t(`avs_kiosk.board.occupancy_${value ?? 'unknown'}`)}
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="flex min-h-12 items-center justify-between gap-3 rounded-xl bg-slate-800/60 px-3 py-2 text-xs text-slate-300">
          <span><span aria-hidden="true">🏷 </span>{t(`avs_kiosk.board.label_${qrLabel}`, qrLabel)}</span>
          {qrLabel !== 'verified' && !closed && (
            <button type="button" onClick={onVerifyLabel} disabled={!isOnline || pending}
              className="min-h-10 shrink-0 rounded-lg bg-slate-700 px-3 font-semibold text-slate-100 disabled:opacity-50">
              {t('avs_kiosk.board.verify_label')}
            </button>
          )}
        </div>

        {isRoom && (
          <button type="button" onClick={onReportFault}
            className="min-h-12 w-full rounded-2xl bg-amber-600/20 text-sm font-medium text-amber-300">
            🔧 {t('avs_kiosk.board.report_fault')}
          </button>
        )}
        {portalHref && (
          <a href={portalHref} className="block text-center text-xs text-slate-400 underline">
            {t('avs_kiosk.board.resident_page')}
          </a>
        )}
      </div>
    </div>
  )
}
