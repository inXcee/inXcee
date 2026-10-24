import { useCallback, useEffect, useRef, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from '../../../shared/i18n/index.js'
import { dataUrlToBlob } from '../../../shared/photo.js'
import QrScannerModal from '../../../shared/components/QrScannerModal.jsx'
import TabState from '../components/TabState.jsx'
import SpotSheet from '../components/SpotSheet.jsx'
import UndoToast, { useUndoToast } from '../components/UndoToast.jsx'
import { floorProgress, scanFresh, spotTone } from '../logic/board.js'

// Saha ekranı Odalar sekmesi (docs/saha-ekrani.md): blok → kat → oda kutucuğu. Dokun → alt sayfa:
// temizlendi / temizlenemedi / dolu-boş; her işlemden sonra 6 sn "Geri al". Kendi sorgularını taşır.
const BOARD = '/avs-self-service/board'
const SCAN = '/avs-self-service/qr-scan' // kapıdaki QR (docs/superpowers/specs/2026-10-24-oda-qr-saha-design.md)
const BLOCK_KEY = 'saha-board-block' // cihazda son seçilen blok (kolaylık; kayıt sunucuda)
const EXCLUDED_ORDER = ['closed', 'locked', 'no_clean', 'night', 'empty', 'qr_required', 'marked']
const TONE_CLASS = {
  cleaned: 'border-green-700/60 bg-green-900/50 text-green-300',
  skipped: 'border-amber-700/60 bg-amber-900/40 text-amber-300',
  closed: 'border-slate-800 bg-slate-900 text-slate-600',
  idle: 'border-slate-700 bg-slate-800 text-slate-200',
  complaint: 'border-red-600/70 bg-red-950/40 text-red-200',
}
const TONE_MARK = { cleaned: '✓', skipped: '⊘', closed: '⛔', idle: '', complaint: '⚠' }

function readBlock() {
  try { return window.localStorage.getItem(BLOCK_KEY) || '' } catch { return '' }
}

function writeBlock(value) {
  try { window.localStorage.setItem(BLOCK_KEY, value) } catch { /* özel pencere: yalnız bu oturum */ }
}

// Okutulan etiketin sakin sayfası: kampta kalan görevli kendi odası için sakin hizmetlerini kullanabilsin
// (?sakin=1 portalın görevliyi sahaya yönlendirmesini atlar)
function residentHref(qr) {
  try {
    const url = /^https?:\/\//i.test(qr) ? new URL(qr) : new URL(`/r/${qr}`, window.location.origin)
    url.searchParams.set('sakin', '1')
    return url.toString()
  } catch { return null }
}

export default function RoomsBoardTab({ avsApi, onReportFault, isOnline = true, pendingScan = null, onPendingScanDone }) {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const [chosen, setChosen] = useState(readBlock)
  const [openLocation, setOpenLocation] = useState(null)
  const [floorPlan, setFloorPlan] = useState(null)
  const { toast, showToast, clearToast } = useUndoToast()
  const [scan, setScan] = useState(null) // son okutma: { location, scan_id, at, qr } — 60 dk işareti doğrular
  const [scannerFor, setScannerFor] = useState(null) // 'open' (yeri aç) | 'verify' (etiketi doğrula)
  const handledScan = useRef(null)

  const blocksQuery = useQuery({
    queryKey: ['avs-board-blocks'],
    queryFn: () => avsApi.get(`${BOARD}/blocks`).then(r => r.data),
  })
  const blocks = blocksQuery.data?.blocks || []
  const assigned = blocksQuery.data?.assigned_block || null
  const block = assigned || (blocks.some(item => item.block === chosen) ? chosen : '')
  const roomsQuery = useQuery({
    queryKey: ['avs-board-rooms', block],
    queryFn: () => avsApi.get(`${BOARD}/rooms?block=${encodeURIComponent(block)}`).then(r => r.data),
    enabled: Boolean(block),
  })
  const floors = roomsQuery.data?.floors || []
  const spots = floors.flatMap(floor => [...floor.common_areas, ...floor.rooms])
  const openSpot = spots.find(item => item.location === openLocation) || null

  const errorText = err => err?.response?.data?.error || t('avs_kiosk.board.save_error')
  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ['avs-board-rooms', block] })
    queryClient.invalidateQueries({ queryKey: ['avs-board-blocks'] })
  }

  const undo = useMutation({
    mutationFn: ({ location }) => avsApi.post(`${BOARD}/undo`, { location }),
    onSuccess: () => { setOpenLocation(null); refresh(); showToast(t('avs_kiosk.board.undone')) },
    onError: err => showToast(errorText(err)),
  })

  const mark = useMutation({
    mutationFn: ({ location, action, reason, note, photos = [], scanId = null }) => {
      if (!photos.length) {
        return avsApi.post(`${BOARD}/mark`, {
          location, action, ...(reason ? { reason } : {}), ...(note ? { note } : {}), ...(scanId ? { scan_id: scanId } : {}),
        })
      }
      const form = new FormData()
      form.append('location', location)
      form.append('action', action)
      if (reason) form.append('reason', reason)
      if (note) form.append('note', note)
      if (scanId) form.append('scan_id', String(scanId))
      photos.forEach((photo, index) => form.append('photos', dataUrlToBlob(photo), `saha-${index + 1}.jpg`))
      return avsApi.post(`${BOARD}/mark`, form)
    },
    onSuccess: (response, variables) => {
      setOpenLocation(null)
      refresh()
      if (response.data?.already) return showToast(`${variables.location} ${t('avs_kiosk.board.already')}`)
      const word = variables.action === 'clean' ? t('avs_kiosk.board.cleaned') : t('avs_kiosk.board.not_cleaned_lower')
      showToast(`${variables.location} ${word}`, () => undo.mutate({ location: variables.location }))
    },
  })

  const occupancy = useMutation({
    mutationFn: ({ roomId, value }) => avsApi.patch(`${BOARD}/rooms/${roomId}/occupancy`, { occupancy: value }),
    onSuccess: (_response, variables) => {
      refresh()
      const back = variables.revert ? null : () => occupancy.mutate({ ...variables, value: variables.previous, revert: true })
      showToast(`${variables.location} · ${t(`avs_kiosk.board.occupancy_${variables.value ?? 'unknown'}`)}`, back)
    },
    onError: err => showToast(errorText(err)),
  })

  // Kapıdaki QR: okutma sunucuya yazılır; yerin bloğu seçilir, alt sayfası "QR ile doğrulandı" açılır
  const scanQr = useMutation({
    mutationFn: ({ qr, via }) => avsApi.post(SCAN, { qr, via }).then(r => ({ ...r.data, qr })),
    onSuccess: result => {
      setChosen(result.block)
      writeBlock(result.block)
      setFloorPlan(null)
      setScan({ location: result.location, scan_id: result.scan_id, at: result.at, qr: result.qr })
      setOpenLocation(result.location)
    },
    onError: err => showToast(errorText(err)),
  })

  // Etiket kurulumu: açık yerin kapısındaki etiket okutulur; yanlış kapı / eski etiket mesajla söylenir
  const verifyLabel = useMutation({
    mutationFn: ({ location, qr }) => avsApi.post(`${BOARD}/label-verify`, { location, qr }).then(r => r.data),
    onSuccess: result => { refresh(); showToast(result.message) },
    onError: err => showToast(errorText(err)),
  })

  // Telefon kamerasıyla okutulan etiket (/saha?qr=) sayfadan bir kez gelir
  useEffect(() => {
    if (!pendingScan || handledScan.current === pendingScan) return
    handledScan.current = pendingScan
    scanQr.mutate(pendingScan)
    onPendingScanDone?.()
  }, [pendingScan]) // eslint-disable-line react-hooks/exhaustive-deps

  // Tarayıcı geri çağrıları sabit kalsın (kamera her çizimde yeniden başlamasın); güncel değerler ref'te
  const scanner = useRef({})
  scanner.current = { purpose: scannerFor, location: openLocation, scan: scanQr.mutate, verify: verifyLabel.mutate }
  const onScanned = useCallback(text => {
    const { purpose, location, scan: runScan, verify } = scanner.current
    setScannerFor(null)
    if (purpose === 'verify' && location) verify({ location, qr: text })
    else runScan({ qr: text, via: 'in_app' })
  }, [])
  const closeScanner = useCallback(() => setScannerFor(null), [])

  const floorUndo = useMutation({
    mutationFn: ({ locations }) => avsApi.post(`${BOARD}/floor-undo`, { locations }),
    onSuccess: () => { refresh(); showToast(t('avs_kiosk.board.undone')) },
    onError: err => showToast(errorText(err)),
  })

  const floorRun = useMutation({
    mutationFn: ({ floor, dryRun }) => avsApi.post(`${BOARD}/floor`, { block, floor, dry_run: dryRun })
      .then(r => ({ ...r.data, floor, dryRun })),
    onSuccess: result => {
      if (result.dryRun) return setFloorPlan(result)
      setFloorPlan(null)
      refresh()
      showToast(`${result.locations.length} ${t('avs_kiosk.board.floor_done')}`,
        () => floorUndo.mutate({ locations: result.locations }))
    },
    onError: err => showToast(errorText(err)),
  })

  function chooseBlock(value) {
    setChosen(value)
    writeBlock(value)
    setOpenLocation(null)
    setFloorPlan(null)
  }

  const pending = mark.isPending || undo.isPending || occupancy.isPending || scanQr.isPending || verifyLabel.isPending
  const spotLabel = room => [
    room.room_no,
    room.status === 'cleaned' && t('avs_kiosk.board.cleaned'),
    room.status === 'skipped' && t('avs_kiosk.board.not_cleaned_lower'),
    room.status && room.verified_by_qr && t('avs_kiosk.board.qr_verified'),
    room.occupancy && t(`avs_kiosk.board.${room.occupancy}_lower`),
    room.use_state === 'locked' && t('avs_kiosk.board.locked'),
    room.occupant_shift === 'night' && t('avs_kiosk.board.night'),
    room.pickup_request && t('avs_kiosk.board.pickup_lower'),
    room.complaint?.open && t('avs_kiosk.board.complaint_lower'),
  ].filter(Boolean).join(', ')

  return (
    <TabState query={blocksQuery}>
      <div className="space-y-3">
        <button type="button" onClick={() => setScannerFor('open')} disabled={!isOnline || scanQr.isPending}
          className="min-h-12 w-full rounded-2xl bg-blue-600 text-base font-semibold text-white disabled:bg-slate-700 disabled:text-slate-400">
          📷 {t('avs_kiosk.board.scan')}
        </button>
        {!assigned && blocks.length > 0 && (
          <section className="rounded-2xl bg-slate-900 p-3">
            <h2 className="mb-2 text-sm font-semibold text-slate-100">
              {block ? t('avs_kiosk.board.change_block') : t('avs_kiosk.board.choose_block')}
            </h2>
            <div className="flex gap-2 overflow-x-auto pb-1">
              {blocks.map(item => (
                <button key={item.block} type="button" onClick={() => chooseBlock(item.block)} aria-pressed={block === item.block}
                  className={`min-h-12 min-w-14 shrink-0 rounded-xl px-3 text-left ${
                    block === item.block ? 'bg-blue-600 text-white' : 'bg-slate-800 text-slate-300'
                  }`}>
                  <span className="block text-sm font-bold">{item.block}</span>
                  <span className="block text-[11px] opacity-80">{item.cleaned}/{item.rooms - item.closed}</span>
                </button>
              ))}
            </div>
          </section>
        )}

        {!block ? (
          <div className="rounded-2xl bg-slate-900 p-6 text-center">
            <div className="text-4xl">🏢</div>
            <p className="mt-3 text-sm text-slate-400">{t('avs_kiosk.board.choose_block_hint')}</p>
          </div>
        ) : (
          <TabState query={roomsQuery} isEmpty={Boolean(roomsQuery.data) && floors.length === 0}
            emptyText={t('avs_kiosk.board.no_rooms')}>
            <div className="space-y-3">
              {floors.map(floor => {
                const progress = floorProgress(floor)
                const percent = progress.total ? Math.round((progress.cleaned * 100) / progress.total) : 0
                const plan = floorPlan?.floor === floor.floor ? floorPlan : null
                const excluded = plan ? EXCLUDED_ORDER.filter(key => plan.excluded[key] > 0) : []
                return (
                  <section key={floor.floor} className="space-y-3 rounded-2xl bg-slate-900 p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <h3 className="font-semibold text-white">{block} · {t('avs_kiosk.board.floor')} {floor.floor}</h3>
                        <p className="mt-0.5 text-xs text-slate-400">
                          {progress.cleaned}/{progress.total} {t('avs_kiosk.board.cleaned_lower')}
                          {' · '}{progress.occupied} {t('avs_kiosk.board.occupied_lower')}
                          {' · '}{progress.empty} {t('avs_kiosk.board.empty_lower')}
                          {progress.qr > 0 && ` · ${progress.qr} QR`}
                        </p>
                      </div>
                      <span className="text-lg font-bold text-green-400">%{percent}</span>
                    </div>
                    <div className="h-1.5 overflow-hidden rounded-full bg-slate-800">
                      <div className="h-full rounded-full bg-green-500 transition-all" style={{ width: `${percent}%` }} />
                    </div>

                    {floor.common_areas.length > 0 && (
                      <div className="grid grid-cols-4 gap-2" role="group" aria-label={t('avs_kiosk.board.common_areas')}>
                        {floor.common_areas.map(area => {
                          const tone = spotTone(area)
                          return (
                            <button key={area.location} type="button" onClick={() => setOpenLocation(area.location)}
                              className={`min-h-12 rounded-xl border px-1 text-xs font-semibold ${TONE_CLASS[tone]}`}>
                              {t(`avs_kiosk.board.area_${area.code}`, area.label)} {TONE_MARK[tone]}
                              {area.status === 'cleaned' && area.verified_by_qr ? ' 📍' : ''}
                            </button>
                          )
                        })}
                      </div>
                    )}

                    <div className="grid grid-cols-5 gap-2 sm:grid-cols-6">
                      {floor.rooms.map(room => {
                        const tone = spotTone(room)
                        return (
                          <button key={room.location} type="button" onClick={() => setOpenLocation(room.location)}
                            aria-label={spotLabel(room)}
                            className={`relative min-h-14 rounded-xl border text-sm font-bold ${TONE_CLASS[tone]} ${
                              room.mine ? 'ring-1 ring-green-400/70' : ''
                            }`}>
                            {room.room_no}{TONE_MARK[tone] && <span className="ml-0.5">{TONE_MARK[tone]}</span>}
                            {room.occupancy && (
                              <span aria-hidden="true" className="absolute right-1 top-0.5 text-[10px]">
                                {room.occupancy === 'occupied' ? '👤' : '○'}
                              </span>
                            )}
                            {room.pickup_request && (
                              <span aria-hidden="true" className="absolute left-1 top-0.5 text-[10px]">🧺</span>
                            )}
                            {room.status === 'cleaned' && room.verified_by_qr && (
                              <span aria-hidden="true" className="absolute bottom-0.5 right-1 text-[10px]">📍</span>
                            )}
                            {(room.use_state === 'locked' || room.occupant_shift === 'night') && (
                              <span aria-hidden="true" className="absolute bottom-0.5 left-1 text-[10px]">
                                {room.use_state === 'locked' ? '🔒' : '☾'}
                              </span>
                            )}
                          </button>
                        )
                      })}
                    </div>

                    {plan ? (
                      <div className="space-y-3 rounded-2xl border border-green-700/50 bg-green-950/30 p-3">
                        <p className="text-sm font-semibold text-green-200">
                          {plan.locations.length
                            ? `${plan.locations.length} ${t('avs_kiosk.board.floor_preview')}`
                            : t('avs_kiosk.board.floor_nothing')}
                        </p>
                        {excluded.length > 0 && (
                          <p className="text-xs text-slate-300">
                            {t('avs_kiosk.board.floor_excluded')}:{' '}
                            {excluded.map(key => `${plan.excluded[key]} ${t(`avs_kiosk.board.excluded_${key}`)}`).join(', ')}
                          </p>
                        )}
                        <div className="grid grid-cols-2 gap-2">
                          <button type="button" onClick={() => setFloorPlan(null)}
                            className="min-h-12 rounded-xl bg-slate-800 text-sm font-semibold text-slate-200">
                            {t('common.cancel')}
                          </button>
                          <button type="button" disabled={!plan.locations.length || !isOnline || floorRun.isPending}
                            onClick={() => floorRun.mutate({ floor: floor.floor, dryRun: false })}
                            className="min-h-12 rounded-xl bg-green-600 text-sm font-semibold text-white disabled:bg-slate-700 disabled:text-slate-400">
                            {t('avs_kiosk.board.confirm')}
                          </button>
                        </div>
                      </div>
                    ) : (
                      <button type="button" disabled={!isOnline || floorRun.isPending}
                        onClick={() => floorRun.mutate({ floor: floor.floor, dryRun: true })}
                        className="min-h-12 w-full rounded-xl border border-green-700/50 bg-green-950/20 text-sm font-semibold text-green-300 disabled:opacity-50">
                        ✓ {t('avs_kiosk.board.clean_floor')}
                      </button>
                    )}
                  </section>
                )
              })}
            </div>
          </TabState>
        )}
      </div>

      {openSpot && (
        <SpotSheet key={openSpot.location} spot={openSpot} isOnline={isOnline} pending={pending}
          error={mark.isError && mark.variables?.location === openSpot.location ? errorText(mark.error) : ''}
          scan={scanFresh(scan, openSpot.location) ? { at: scan.at } : null}
          portalHref={scan?.location === openSpot.location ? residentHref(scan.qr) : null}
          onScanRequest={() => setScannerFor('open')}
          onVerifyLabel={() => setScannerFor('verify')}
          onClose={() => setOpenLocation(null)}
          onMark={({ action, reason, note, photos }) => mark.mutate({
            location: openSpot.location, action, reason, note, photos,
            scanId: scanFresh(scan, openSpot.location) ? scan.scan_id : null,
          })}
          onUndo={() => undo.mutate({ location: openSpot.location })}
          onOccupancy={value => occupancy.mutate({
            roomId: openSpot.id, location: openSpot.location, value, previous: openSpot.occupancy ?? null,
          })}
          onReportFault={() => {
            setOpenLocation(null)
            onReportFault?.({ area: `${block} Oda ${openSpot.room_no}`, block, floor: floors.find(f => f.rooms.includes(openSpot))?.floor, room_id: openSpot.id, id: '' })
          }}
        />
      )}

      <UndoToast toast={toast} onDismiss={clearToast} />
      <QrScannerModal open={Boolean(scannerFor)} onClose={closeScanner} onScan={onScanned} title={t('avs_kiosk.board.scanner_title')} />
    </TabState>
  )
}
