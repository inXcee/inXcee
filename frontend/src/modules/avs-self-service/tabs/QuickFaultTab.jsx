import { useEffect, useState } from 'react'
import { BLOCK_BY_NAME, BLOCKS_BY_TYPE } from '../../../shared/blocks.js'
import { useTranslation } from '../../../shared/i18n/index.js'

const CATEGORIES = [
  ['elektrik', '⚡'],
  ['tesisat', '🚰'],
  ['klima', '❄️'],
  ['boya', '🎨'],
  ['genel', '🔧'],
]

const STATUS_TONES = {
  done: 'bg-green-950/50 text-green-300',
  closed: 'bg-green-950/50 text-green-300',
  in_progress: 'bg-blue-950/50 text-blue-300',
  assigned: 'bg-blue-950/50 text-blue-300',
  review: 'bg-purple-950/50 text-purple-300',
  open: 'bg-amber-950/50 text-amber-300',
}

function PhotoPreview({ file, onRemove, removeLabel }) {
  const [url, setUrl] = useState('')
  useEffect(() => {
    if (!file) return undefined
    const nextUrl = URL.createObjectURL(file)
    setUrl(nextUrl)
    return () => URL.revokeObjectURL(nextUrl)
  }, [file])
  if (!file) return null
  return (
    <div className="flex items-center gap-3 rounded-xl bg-slate-800 p-3">
      <img src={url} alt="" className="h-16 w-16 rounded-xl object-cover" />
      <div className="min-w-0 flex-1 truncate text-sm text-green-400">{file.name}</div>
      <button type="button" onClick={onRemove} className="min-h-11 rounded-lg px-3 text-xs text-slate-300">
        {removeLabel}
      </button>
    </div>
  )
}

export default function QuickFaultTab({
  faultForm, setFaultForm, faultPhoto, setFaultPhoto,
  faultSuccess, setFaultSuccess, faultError, submitFault, myFaults, locationRooms = [],
}) {
  const { t } = useTranslation()
  const [viewPhoto, setViewPhoto] = useState(null)
  const [blockType, setBlockType] = useState(BLOCK_BY_NAME[faultForm.block]?.type || 'M')
  const floorMatch = faultForm.location.match(/Kat\s+(\d+)/i)
  const [floor, setFloor] = useState(floorMatch ? Number(floorMatch[1]) : null)
  const blockConfig = BLOCK_BY_NAME[faultForm.block]
  const floors = blockConfig ? Array.from({ length: blockConfig.floors }, (_, index) => index + 1) : []
  const rooms = faultForm.block && floor
    ? locationRooms.filter(room => Number(room.floor) === Number(floor))
    : []
  const selectedRoomId = faultForm.room_id ? Number(faultForm.room_id) : null

  function selectBlock(block) {
    setFloor(null)
    setFaultForm(previous => ({
      ...previous,
      block,
      room_id: '',
      cleaning_task_id: '',
      location: block,
    }))
  }

  function selectFloor(nextFloor) {
    setFloor(nextFloor)
    setFaultForm(previous => ({
      ...previous,
      room_id: '',
      cleaning_task_id: '',
      location: `${previous.block} Kat ${nextFloor}`,
    }))
  }

  function selectRoom(room) {
    setFaultForm(previous => ({
      ...previous,
      room_id: room.id,
      cleaning_task_id: '',
      location: `${previous.block} Kat ${floor} Oda ${room.room_no}`,
    }))
  }

  return (
    <div className="space-y-4 rounded-2xl bg-slate-900 p-5">
      {faultSuccess ? (
        <div className="py-7 text-center">
          <div className="mb-3 text-5xl">✅</div>
          <div className="font-medium text-green-400">{t('avs_kiosk.fault.success')}</div>
          {faultSuccess.tracking_no && (
            <div className="mx-auto mt-3 w-fit rounded-xl bg-slate-800 px-4 py-2 font-mono text-lg text-white">
              {faultSuccess.tracking_no}
            </div>
          )}
          <button type="button" onClick={() => setFaultSuccess(false)}
            className="mt-5 min-h-12 rounded-xl bg-blue-600 px-5 text-sm font-medium text-white">
            {t('avs_kiosk.fault.new_report')}
          </button>
        </div>
      ) : (
        <>
          {faultForm.cleaning_task_id && (
            <div className="rounded-xl border border-blue-500/40 bg-blue-950/30 p-3 text-sm text-blue-300">
              {t('avs_kiosk.fault.linked_task')} · {faultForm.location}
            </div>
          )}

          <div>
            <label className="mb-2 block text-sm text-slate-400">{t('avs_kiosk.fault.category')}</label>
            <div className="grid grid-cols-3 gap-2">
              {CATEGORIES.map(([category, icon]) => (
                <button key={category} type="button"
                  onClick={() => setFaultForm(previous => ({ ...previous, category }))}
                  className={`min-h-14 rounded-xl px-2 text-xs font-medium ${
                    faultForm.category === category ? 'bg-blue-600 text-white' : 'bg-slate-800 text-slate-300'
                  }`}>
                  <span className="mr-1 text-lg">{icon}</span>
                  {t(`avs_kiosk.fault.category_${category}`)}
                </button>
              ))}
            </div>
          </div>

          {!faultForm.cleaning_task_id && (
            <div className="space-y-3">
              <label className="block text-sm text-slate-400">{t('avs_kiosk.fault.choose_location')}</label>
              <div className="grid grid-cols-3 gap-2">
                {Object.keys(BLOCKS_BY_TYPE).map(type => (
                  <button key={type} type="button"
                    onClick={() => { setBlockType(type); setFloor(null) }}
                    className={`min-h-11 rounded-xl text-sm font-semibold ${
                      blockType === type ? 'bg-blue-600 text-white' : 'bg-slate-800 text-slate-300'
                    }`}>
                    {type}
                  </button>
                ))}
              </div>
              <div className="flex flex-wrap gap-2">
                {BLOCKS_BY_TYPE[blockType].map(block => (
                  <button key={block} type="button" onClick={() => selectBlock(block)}
                    className={`min-h-11 rounded-xl px-4 text-sm font-semibold ${
                      faultForm.block === block ? 'bg-blue-600 text-white' : 'bg-slate-800 text-slate-300'
                    }`}>
                    {block}
                  </button>
                ))}
              </div>
              {floors.length > 0 && (
                <div className="flex gap-2">
                  {floors.map(item => (
                    <button key={item} type="button" onClick={() => selectFloor(item)}
                      className={`min-h-11 flex-1 rounded-xl text-sm ${
                        floor === item ? 'bg-blue-600 text-white' : 'bg-slate-800 text-slate-300'
                      }`}>
                      {t('avs_kiosk.home.floor')} {item}
                    </button>
                  ))}
                </div>
              )}
              {rooms.length > 0 && (
                <div className="grid max-h-44 grid-cols-5 gap-2 overflow-y-auto rounded-xl bg-slate-950/50 p-2">
                  {rooms.map(room => (
                    <button key={room.id} type="button" onClick={() => selectRoom(room)}
                      className={`min-h-10 rounded-lg text-xs font-semibold ${
                        selectedRoomId === Number(room.id) ? 'bg-blue-600 text-white' : 'bg-slate-800 text-slate-300'
                      }`}>
                      {room.room_no}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          <div>
            <label className="mb-2 block text-sm text-slate-400">{t('avs_kiosk.fault.location')}</label>
            <input value={faultForm.location}
              onChange={event => setFaultForm(previous => ({
                ...previous,
                location: event.target.value,
                room_id: '',
                cleaning_task_id: '',
              }))}
              placeholder={t('avs_kiosk.fault.location_placeholder')}
              className="w-full rounded-xl border border-slate-700 bg-slate-800 px-4 py-3 text-sm text-slate-100 focus:border-blue-500 focus:outline-none" />
          </div>

          <div>
            <label className="mb-2 block text-sm text-slate-400">{t('avs_kiosk.fault.description')}</label>
            <textarea value={faultForm.description}
              onChange={event => setFaultForm(previous => ({ ...previous, description: event.target.value }))}
              rows={4} placeholder={t('avs_kiosk.fault.description_placeholder')}
              className="w-full rounded-xl border border-slate-700 bg-slate-800 px-4 py-3 text-sm text-slate-100 focus:border-blue-500 focus:outline-none" />
            <div className="mt-1 text-right text-xs text-slate-600">{faultForm.description.length}/2000</div>
          </div>

          <div>
            <label className="mb-2 block text-sm text-slate-400">{t('avs_kiosk.fault.priority')}</label>
            <div className="grid grid-cols-3 gap-2">
              {['high', 'medium', 'low'].map(value => (
                <button key={value} type="button"
                  onClick={() => setFaultForm(previous => ({ ...previous, priority: value }))}
                  className={`min-h-12 rounded-xl text-xs font-medium ${
                    faultForm.priority === value ? 'bg-blue-600 text-white' : 'bg-slate-800 text-slate-400'
                  }`}>
                  {t(`avs_kiosk.fault.${value}`)}
                </button>
              ))}
            </div>
          </div>

          {faultPhoto ? (
            <PhotoPreview file={faultPhoto} onRemove={() => setFaultPhoto(null)}
              removeLabel={t('avs_kiosk.fault.remove_photo')} />
          ) : (
            <label className="flex min-h-14 cursor-pointer items-center justify-center gap-2 rounded-xl border border-dashed border-slate-600 bg-slate-800 text-sm text-slate-300">
              📷 {t('avs_kiosk.fault.add_photo')}
              <input type="file" accept="image/*" capture="environment" className="hidden"
                onChange={event => setFaultPhoto(event.target.files?.[0] || null)} />
            </label>
          )}

          {faultError && (
            <div role="alert" className="rounded-xl border border-red-500/40 bg-red-950/30 p-3 text-sm text-red-300">
              {faultError} · {t('avs_kiosk.fault.retry')}
            </div>
          )}
          <button type="button" onClick={() => submitFault.mutate()}
            disabled={submitFault.isPending || faultForm.location.trim().length < 3 || faultForm.description.trim().length < 10}
            className="min-h-14 w-full rounded-xl bg-blue-600 text-sm font-semibold text-white disabled:bg-slate-700 disabled:text-slate-400">
            {submitFault.isPending ? t('avs_kiosk.loading') : t('avs_kiosk.fault.submit')}
          </button>
        </>
      )}

      {myFaults.length > 0 && (
        <div className="border-t border-slate-800 pt-4">
          <h3 className="mb-3 text-sm font-medium text-slate-400">{t('avs_kiosk.my_faults.title')}</h3>
          <div className="space-y-2">
            {myFaults.map(item => (
              <div key={item.id} className="rounded-xl bg-slate-800 p-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="truncate text-sm font-medium text-slate-200">{item.location}</div>
                    <div className="mt-1 text-xs text-slate-500">
                      {item.tracking_no} · {t(`avs_kiosk.fault.category_${item.category || 'genel'}`)}
                    </div>
                  </div>
                  <span className={`shrink-0 rounded-lg px-2 py-1 text-xs font-medium ${STATUS_TONES[item.status] || STATUS_TONES.open}`}>
                    {t(`avs_kiosk.fault.status_${item.status}`)}
                  </span>
                </div>
                <div className="mt-2 flex justify-between text-xs text-slate-500">
                  <span>{item.technician_name || t('avs_kiosk.fault.unassigned')}</span>
                  <span>{item.opened_at ? new Date(item.opened_at).toLocaleDateString() : ''}</span>
                </div>
                <p className="mt-2 line-clamp-2 text-xs leading-5 text-slate-400">{item.description}</p>
                {(item.photo_before || item.photo_url) && (
                  <div className="mt-3 grid grid-cols-2 gap-2">
                    {item.photo_before && (
                      <button type="button"
                        onClick={() => setViewPhoto({
                          url: item.photo_before,
                          label: t('avs_kiosk.fault.report_photo'),
                        })}
                        className="overflow-hidden rounded-lg border border-red-500/30 text-left">
                        <img loading="lazy" src={item.photo_before} alt={t('avs_kiosk.fault.report_photo')}
                          className="aspect-[4/3] w-full object-cover" />
                        <span className="block bg-slate-900 px-2 py-1.5 text-[10px] font-semibold text-red-300">
                          {t('avs_kiosk.fault.report_photo')}
                        </span>
                      </button>
                    )}
                    {item.photo_url && (
                      <button type="button"
                        onClick={() => setViewPhoto({
                          url: item.photo_url,
                          label: t('avs_kiosk.fault.resolution_photo'),
                        })}
                        className="overflow-hidden rounded-lg border border-green-500/30 text-left">
                        <img loading="lazy" src={item.photo_url} alt={t('avs_kiosk.fault.resolution_photo')}
                          className="aspect-[4/3] w-full object-cover" />
                        <span className="block bg-slate-900 px-2 py-1.5 text-[10px] font-semibold text-green-300">
                          {t('avs_kiosk.fault.resolution_photo')}
                        </span>
                      </button>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {viewPhoto && (
        <div role="dialog" aria-modal="true" aria-label={viewPhoto.label}
          className="fixed inset-0 z-[80] flex items-center justify-center bg-black/90 p-4"
          onClick={() => setViewPhoto(null)}>
          <div className="w-full max-w-2xl" onClick={event => event.stopPropagation()}>
            <div className="mb-3 flex items-center justify-between gap-3">
              <div className="font-semibold text-white">{viewPhoto.label}</div>
              <button type="button" onClick={() => setViewPhoto(null)}
                aria-label={t('avs_kiosk.tasks.close')}
                className="min-h-11 min-w-11 rounded-xl bg-slate-800 text-white">✕</button>
            </div>
            <img src={viewPhoto.url} alt={viewPhoto.label}
              className="max-h-[80vh] w-full rounded-2xl object-contain" />
          </div>
        </div>
      )}
    </div>
  )
}
