import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from '../../../shared/i18n/index.js'
import TabState from '../components/TabState.jsx'
import UndoToast, { useUndoToast } from '../components/UndoToast.jsx'
import { spotTime } from '../logic/board.js'

// Saha ekranı Çamaşır sekmesi (docs/saha-ekrani.md): oda bazında defter — Çamaşır al → Hazır → Teslim et.
// Her laundry_items satırı bir torba (Hermes /camasir ile aynı anlam). Oda seçici Odalar panosunun uçlarını kullanır.
const LEDGER = '/avs-self-service/laundry'
const BOARD = '/avs-self-service/board'
const LEDGER_KEY = ['avs-laundry-ledger']

// Çift gönderime karşı istemci anahtarı: form her açılışta yeni, ağ hatasından sonraki tekrar denemede aynı
function newRequestKey() {
  const uuid = globalThis.crypto?.randomUUID?.()
    || `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`
  return `saha-${uuid}`
}

const roomLabel = group => `${group.block}-${group.room_no}`
const bagCount = groups => groups.reduce((sum, group) => sum + group.bags, 0)

// initialRoom: sakin talebinden açılınca oda seçili gelir ({ room_id, block, room_no })
function IntakeSheet({ avsApi, isOnline, onClose, onSaved, initialRoom = null }) {
  const { t } = useTranslation()
  const [requestKey] = useState(newRequestKey)
  const [chosenBlock, setChosenBlock] = useState(initialRoom?.block || '')
  const [room, setRoom] = useState(initialRoom ? { id: initialRoom.room_id, room_no: initialRoom.room_no } : null)
  const [bags, setBags] = useState(1)
  const [ironing, setIroning] = useState(false)
  const [urgent, setUrgent] = useState(false)
  const [note, setNote] = useState('')

  const blocksQuery = useQuery({
    queryKey: ['avs-board-blocks'],
    queryFn: () => avsApi.get(`${BOARD}/blocks`).then(r => r.data),
  })
  const block = blocksQuery.data?.assigned_block || chosenBlock
  const roomsQuery = useQuery({
    queryKey: ['avs-board-rooms', block],
    queryFn: () => avsApi.get(`${BOARD}/rooms?block=${encodeURIComponent(block)}`).then(r => r.data),
    enabled: Boolean(block),
  })
  const save = useMutation({
    mutationFn: () => avsApi.post(LEDGER, {
      room_id: room.id, bags, ironing, urgent, ...(note.trim() ? { note: note.trim() } : {}), client_request_id: requestKey,
    }),
    onSuccess: response => onSaved(response.data, `${block}-${room.room_no}`, bags),
  })
  const toggle = (on, label, onClick) => (
    <button type="button" onClick={onClick} aria-pressed={on}
      className={`min-h-12 rounded-xl text-sm font-semibold ${on ? 'bg-blue-600 text-white' : 'bg-slate-800 text-slate-300'}`}>
      {on ? '✓ ' : ''}{label}
    </button>
  )

  return (
    <div className="fixed inset-0 z-[60] flex items-end justify-center bg-black/60" onClick={onClose}>
      <div role="dialog" aria-modal="true" aria-label={t('avs_kiosk.laundry.intake')} onClick={event => event.stopPropagation()}
        className="max-h-[90vh] w-full max-w-lg space-y-4 overflow-y-auto rounded-t-3xl border border-slate-700 bg-slate-900 p-5 pb-8">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-semibold text-white">🧺 {t('avs_kiosk.laundry.intake')}</h2>
          <button type="button" onClick={onClose} aria-label={t('avs_kiosk.board.close')}
            className="min-h-12 min-w-12 rounded-xl bg-slate-800 text-slate-300">✕</button>
        </div>

        {!blocksQuery.data?.assigned_block && (
          <div>
            <div className="mb-2 text-sm font-medium text-slate-300">{t('avs_kiosk.laundry.choose_block')}</div>
            <div className="flex gap-2 overflow-x-auto pb-1">
              {(blocksQuery.data?.blocks || []).map(item => (
                <button key={item.block} type="button" aria-pressed={block === item.block}
                  onClick={() => { setChosenBlock(item.block); setRoom(null) }}
                  className={`min-h-12 min-w-14 shrink-0 rounded-xl px-3 text-sm font-bold ${
                    block === item.block ? 'bg-blue-600 text-white' : 'bg-slate-800 text-slate-300'
                  }`}>
                  {item.block}
                </button>
              ))}
            </div>
          </div>
        )}

        {block && (
          <div>
            <div className="mb-2 text-sm font-medium text-slate-300">{t('avs_kiosk.laundry.choose_room')}</div>
            <TabState query={roomsQuery}>
              <div className="space-y-2">
                {(roomsQuery.data?.floors || []).map(floor => (
                  <div key={floor.floor}>
                    <div className="mb-1 text-xs text-slate-500">{t('avs_kiosk.board.floor')} {floor.floor}</div>
                    <div className="grid grid-cols-5 gap-2">
                      {floor.rooms.map(item => (
                        <button key={item.location} type="button" disabled={item.use_state === 'closed'}
                          aria-pressed={room?.id === item.id} onClick={() => setRoom(item)}
                          className={`min-h-12 rounded-xl text-sm font-bold disabled:opacity-40 ${
                            room?.id === item.id ? 'bg-blue-600 text-white' : 'bg-slate-800 text-slate-200'
                          }`}>
                          {item.room_no}
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </TabState>
          </div>
        )}

        {room && (
          <>
            <div>
              <div className="mb-2 text-sm font-medium text-slate-300">{t('avs_kiosk.laundry.bags')}</div>
              <div className="flex items-center gap-3">
                <button type="button" aria-label={t('avs_kiosk.laundry.remove_bag')} disabled={bags <= 1}
                  onClick={() => setBags(value => Math.max(1, value - 1))}
                  className="min-h-14 min-w-14 rounded-xl bg-slate-800 text-2xl text-white disabled:opacity-40">−</button>
                <output className="min-w-16 text-center text-3xl font-bold text-white" aria-live="polite">{bags}</output>
                <button type="button" aria-label={t('avs_kiosk.laundry.add_bag')} disabled={bags >= 20}
                  onClick={() => setBags(value => Math.min(20, value + 1))}
                  className="min-h-14 min-w-14 rounded-xl bg-slate-800 text-2xl text-white disabled:opacity-40">+</button>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              {toggle(ironing, t('avs_kiosk.laundry.ironing'), () => setIroning(value => !value))}
              {toggle(urgent, t('avs_kiosk.laundry.urgent'), () => setUrgent(value => !value))}
            </div>
            <input value={note} onChange={event => setNote(event.target.value)} maxLength={200}
              placeholder={t('avs_kiosk.laundry.note')}
              className="min-h-12 w-full rounded-xl border border-slate-700 bg-slate-800 px-3 text-sm text-white" />
            {save.isError && (
              <p role="alert" className="rounded-xl border border-red-500/40 bg-red-950/30 p-3 text-sm text-red-300">
                {save.error?.response?.data?.error || t('avs_kiosk.laundry.save_error')}
              </p>
            )}
            <button type="button" onClick={() => save.mutate()} disabled={!isOnline || save.isPending}
              className="min-h-14 w-full rounded-2xl bg-green-600 text-base font-semibold text-white disabled:bg-slate-700 disabled:text-slate-400">
              {!isOnline ? t('avs_kiosk.connection_waiting') : save.isPending ? t('avs_kiosk.laundry.saving') : t('avs_kiosk.laundry.save')}
            </button>
          </>
        )}
      </div>
    </div>
  )
}

export default function LaundryLedgerTab({ avsApi, isOnline = true }) {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const [intake, setIntake] = useState(null) // null: kapalı · {}: oda seçilmemiş · talep: oda seçili
  const [deliverFor, setDeliverFor] = useState(null)
  const [deliverName, setDeliverName] = useState('')
  const { toast, showToast, clearToast } = useUndoToast()

  const ledgerQuery = useQuery({
    queryKey: LEDGER_KEY,
    queryFn: () => avsApi.get(LEDGER).then(r => r.data),
    refetchInterval: 60000,
  })
  const ledger = ledgerQuery.data || { open: [], ready: [], delivered_today: [], requests: [] }
  const requests = ledger.requests || []
  const refresh = () => queryClient.invalidateQueries({ queryKey: LEDGER_KEY })
  const errorText = err => err?.response?.data?.error || t('avs_kiosk.laundry.save_error')

  const undo = useMutation({
    mutationFn: ({ action, ids }) => avsApi.post(`${LEDGER}/undo`, { action, ids }),
    onSuccess: () => { refresh(); showToast(t('avs_kiosk.laundry.undone')) },
    onError: err => showToast(errorText(err)),
  })
  const ready = useMutation({
    mutationFn: group => avsApi.post(`${LEDGER}/rooms/${group.room_id}/ready`).then(r => r.data),
    onSuccess: (data, group) => {
      refresh()
      showToast(`${roomLabel(group)} ${t('avs_kiosk.laundry.readied')}`, () => undo.mutate({ action: 'ready', ids: data.ids }))
    },
    onError: err => showToast(errorText(err)),
  })
  const deliver = useMutation({
    mutationFn: ({ group, name }) => avsApi.post(`${LEDGER}/rooms/${group.room_id}/deliver`, name ? { name } : {}).then(r => r.data),
    onSuccess: (data, { group }) => {
      setDeliverFor(null)
      setDeliverName('')
      refresh()
      showToast(`${roomLabel(group)} ${t('avs_kiosk.laundry.delivered')}`, () => undo.mutate({ action: 'deliver', ids: data.ids }))
    },
    onError: err => showToast(errorText(err)),
  })

  const busy = !isOnline || ready.isPending || deliver.isPending
  const lists = [
    ['open', ledger.open, 'empty_open'],
    ['ready', ledger.ready, 'empty_ready'],
    ['delivered_today', ledger.delivered_today, 'empty_delivered'],
  ]

  return (
    <TabState query={ledgerQuery}>
      <div className="space-y-4">
        <button type="button" onClick={() => setIntake({})}
          className="min-h-16 w-full rounded-2xl bg-blue-600 text-lg font-semibold text-white">
          🧺 {t('avs_kiosk.laundry.intake')}
        </button>

        {requests.length > 0 && (
          <section aria-label={t('avs_kiosk.laundry.requests')} className="space-y-2 rounded-2xl border border-amber-600/50 bg-amber-950/20 p-4">
            <h2 className="flex items-center justify-between text-sm font-semibold text-amber-200">
              <span>🧺 {t('avs_kiosk.laundry.requests')}</span>
              <span className="rounded-full bg-amber-900/60 px-2.5 py-0.5 text-xs">{requests.length}</span>
            </h2>
            <p className="text-xs text-amber-200/70">{t('avs_kiosk.laundry.requests_hint')}</p>
            {requests.map(request => (
              <article key={request.id} className="flex items-center justify-between gap-3 rounded-xl border border-slate-700 bg-slate-800 p-3">
                <div>
                  <div className="font-semibold text-white">{roomLabel(request)}</div>
                  <div className="text-xs text-slate-400">
                    {spotTime(request.created_at) || ''}
                    {request.request_count > 1 && ` · ${request.request_count}×`}
                    {request.note && ` · ${request.note}`}
                  </div>
                </div>
                <button type="button" disabled={!isOnline} onClick={() => setIntake(request)}
                  className="min-h-12 shrink-0 rounded-xl bg-blue-600 px-4 text-sm font-semibold text-white disabled:bg-slate-700">
                  {t('avs_kiosk.laundry.take_request')}
                </button>
              </article>
            ))}
          </section>
        )}

        {lists.map(([key, groups, emptyKey]) => (
          <section key={key} className="space-y-2 rounded-2xl bg-slate-900 p-4">
            <h2 className="flex items-center justify-between text-sm font-semibold text-slate-200">
              <span>{t(`avs_kiosk.laundry.${key}`)}</span>
              <span className="rounded-full bg-slate-800 px-2.5 py-0.5 text-xs text-slate-300">{bagCount(groups)}</span>
            </h2>
            {groups.length === 0 && <p className="text-sm text-slate-500">{t(`avs_kiosk.laundry.${emptyKey}`)}</p>}
            {groups.map(group => (
              <article key={`${key}-${group.room_id}`}
                className={`space-y-2 rounded-xl border p-3 ${group.urgent ? 'border-amber-600/60 bg-amber-950/20' : 'border-slate-700 bg-slate-800'}`}>
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <div className="font-semibold text-white">{roomLabel(group)}</div>
                    <div className="text-xs text-slate-400">
                      {group.bags} {t('avs_kiosk.laundry.bag_unit')}
                      {group.ironing > 0 && ` · ${t('avs_kiosk.laundry.ironing_lower')}`}
                      {group.urgent > 0 && ` · ${t('avs_kiosk.laundry.urgent_lower')}`}
                      {key === 'delivered_today'
                        ? ` · ${spotTime(group.updated_at) || ''}`
                        : ` · ${t('avs_kiosk.laundry.since')} ${spotTime(group.since) || ''}`}
                    </div>
                  </div>
                  {key === 'open' && (
                    <button type="button" disabled={busy} onClick={() => ready.mutate(group)}
                      className="min-h-12 shrink-0 rounded-xl bg-green-600 px-4 text-sm font-semibold text-white disabled:bg-slate-700">
                      {t('avs_kiosk.laundry.mark_ready')}
                    </button>
                  )}
                  {key === 'ready' && deliverFor !== group.room_id && (
                    <button type="button" disabled={busy} onClick={() => { setDeliverFor(group.room_id); setDeliverName('') }}
                      className="min-h-12 shrink-0 rounded-xl bg-blue-600 px-4 text-sm font-semibold text-white disabled:bg-slate-700">
                      {t('avs_kiosk.laundry.deliver')}
                    </button>
                  )}
                </div>
                {key === 'ready' && deliverFor === group.room_id && (
                  <div className="space-y-2">
                    <input value={deliverName} onChange={event => setDeliverName(event.target.value)} maxLength={100}
                      placeholder={t('avs_kiosk.laundry.deliver_to')}
                      className="min-h-12 w-full rounded-xl border border-slate-600 bg-slate-900 px-3 text-sm text-white" />
                    <div className="grid grid-cols-2 gap-2">
                      <button type="button" onClick={() => setDeliverFor(null)}
                        className="min-h-12 rounded-xl bg-slate-700 text-sm font-semibold text-slate-200">
                        {t('common.cancel')}
                      </button>
                      <button type="button" disabled={busy}
                        onClick={() => deliver.mutate({ group, name: deliverName.trim() })}
                        className="min-h-12 rounded-xl bg-blue-600 text-sm font-semibold text-white disabled:bg-slate-700">
                        {t('avs_kiosk.laundry.deliver_save')}
                      </button>
                    </div>
                  </div>
                )}
              </article>
            ))}
          </section>
        ))}
      </div>

      {intake && (
        <IntakeSheet avsApi={avsApi} isOnline={isOnline} onClose={() => setIntake(null)}
          initialRoom={intake.room_id ? intake : null}
          onSaved={(data, label, bags) => {
            setIntake(null)
            refresh()
            const closed = data.request_closed ? ` · ${t('avs_kiosk.laundry.request_closed')}` : ''
            showToast(`${label}: ${bags} ${t('avs_kiosk.laundry.taken')}${closed}`, () => undo.mutate({ action: 'intake', ids: data.ids }))
          }} />
      )}
      <UndoToast toast={toast} onDismiss={clearToast} />
    </TabState>
  )
}
