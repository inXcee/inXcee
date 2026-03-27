import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { laundryApi } from '../api.js'
import api from '../../../shared/api/client.js'

export default function NewItemModal({ onClose }) {
  const qc = useQueryClient()
  const [form, setForm] = useState({ room_id: '', item_count: 1, notes: '', urgent: false, item_details: '' })

  const { data: rooms = [] } = useQuery({
    queryKey: ['rooms-list'],
    queryFn: () => api.get('/checkin/available-rooms').then(r => r.data).catch(() => []),
  })

  const create = useMutation({
    mutationFn: () => laundryApi.createItem({
      ...form,
      room_id: +form.room_id,
      urgent: form.urgent ? 1 : 0,
    }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['laundry-items'] }); onClose() },
  })

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000,
    }}
      onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="panel fade-up" style={{ width: 380, maxWidth: '90vw' }}>
        <div className="panel-header">
          <span className="panel-title">YENİ ÇAMAŞIR KAYDI</span>
          <button className="btn btn-ghost btn-xs" onClick={onClose}>ESC</button>
        </div>
        <div className="panel-body" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div>
            <label className="form-label">ODA</label>
            <select className="form-select" value={form.room_id}
              onChange={e => set('room_id', e.target.value)}>
              <option value="">Oda seç...</option>
              {rooms.map(r => (
                <option key={r.room_id || r.id} value={r.room_id || r.id}>
                  {r.block} - {r.room_no}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="form-label">PARÇA ADEDİ</label>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <button className="btn btn-ghost btn-sm"
                onClick={() => set('item_count', Math.max(1, form.item_count - 1))}>-</button>
              <span style={{ fontFamily: 'var(--display)', fontSize: 28, letterSpacing: 2, color: 'var(--text)', minWidth: 40, textAlign: 'center' }}>
                {form.item_count}
              </span>
              <button className="btn btn-ghost btn-sm"
                onClick={() => set('item_count', form.item_count + 1)}>+</button>
            </div>
          </div>

          <div>
            <label className="form-label">KIYAFET DETAYLARI (OPSİYONEL)</label>
            <input className="form-input" value={form.item_details}
              onChange={e => set('item_details', e.target.value)}
              placeholder="Örn: 2 tişört, 1 pantolon..." />
          </div>

          <div>
            <label className="form-label">NOTLAR</label>
            <input className="form-input" value={form.notes}
              onChange={e => set('notes', e.target.value)}
              placeholder="Açıklama..." />
          </div>

          <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
            <input type="checkbox" checked={form.urgent}
              onChange={e => set('urgent', e.target.checked)}
              style={{ accentColor: 'var(--red)' }} />
            <span style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--red)', fontWeight: 600 }}>
              ACİL İŞARETLE
            </span>
          </label>

          {create.isError && (
            <div className="alert alert-danger">
              {create.error?.response?.data?.error || 'Hata oluştu'}
            </div>
          )}

          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn btn-primary" style={{ flex: 1 }}
              onClick={() => create.mutate()}
              disabled={!form.room_id || create.isPending}>
              {create.isPending ? 'Kaydediliyor...' : 'KAYDET'}
            </button>
            <button className="btn btn-ghost" onClick={onClose}>İptal</button>
          </div>
        </div>
      </div>
    </div>
  )
}
