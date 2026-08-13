import { useMemo, useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import { laundryApi } from '../api.js'
import LaundryCardPanel from '../../laundry-kiosk/LaundryCardPanel.jsx'
import {
  cardGateReady, cardRequestFields, emptyLaundryCard, useLaundryCardRequirement,
} from '../laundryCard.js'

export default function BatchDeliveryModal({ items, onClose, onSuccess }) {
  const [deliveredTo, setDeliveredTo] = useState('')
  const [laundryCard, setLaundryCard] = useState(emptyLaundryCard)
  const [warning, setWarning] = useState('')
  const { required } = useLaundryCardRequirement('delivery')
  const roomKeys = useMemo(() => new Set(items.map(item => item.room_id || `${item.block}:${item.room_no}`)), [items])
  const mixedRooms = required && roomKeys.size > 1
  const cardReady = cardGateReady({ required, online: true, value: laundryCard })

  const deliver = useMutation({
    mutationFn: () => laundryApi.batchDeliver({
      item_ids: items.map(item => item.id),
      delivered_to: deliveredTo.trim(),
      ...cardRequestFields(laundryCard),
    }),
    onSuccess: result => {
      if (result.card_warning) setWarning(result.card_warning)
      else onSuccess?.(result)
    },
  })

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 1100, background: 'rgba(0,0,0,.72)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16,
    }} onClick={event => event.target === event.currentTarget && onClose()}>
      <div className="panel" style={{ width: 520, maxWidth: '96vw', maxHeight: '92vh', overflow: 'auto' }}>
        <div className="panel-header">
          <div>
            <span className="panel-title">TOPLU TESLİM</span>
            <div className="panel-subtitle">{items.length} kayıt · aynı oda için tek okutma</div>
          </div>
          <button className="btn btn-ghost btn-xs" onClick={onClose}>ESC</button>
        </div>
        <div className="panel-body" style={{ display: 'grid', gap: 14 }}>
          {mixedRooms && (
            <div className="alert alert-danger">
              Kart zorunluyken farklı odaların kayıtları birlikte teslim edilemez. Oda bazında ayrı gruplar seçin.
            </div>
          )}
          {!mixedRooms && (
            <>
              <input className="form-input" value={deliveredTo}
                onChange={event => setDeliveredTo(event.target.value)} placeholder="Teslim alan adı" autoFocus />
              <LaundryCardPanel
                action="delivery"
                required={required}
                room={{ item_id: items[0]?.id }}
                verifyCard={laundryApi.verifyCard}
                value={laundryCard}
                onChange={setLaundryCard}
                resetKey={items[0]?.id}
                captureHid
              />
            </>
          )}
          {warning && <div className="alert alert-warning">{warning}</div>}
          {deliver.isError && <div className="alert alert-danger">{deliver.error?.response?.data?.error || 'Toplu teslim başarısız'}</div>}
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn btn-primary" style={{ flex: 1 }}
              onClick={() => warning ? onSuccess?.() : deliver.mutate()}
              disabled={!warning && (mixedRooms || !deliveredTo.trim() || !cardReady || deliver.isPending)}>
              {warning ? 'Kapat' : deliver.isPending ? 'Kaydediliyor...' : `Teslim Et (${items.length})`}
            </button>
            <button className="btn btn-ghost" onClick={onClose}>İptal</button>
          </div>
        </div>
      </div>
    </div>
  )
}
