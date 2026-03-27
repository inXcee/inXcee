import { useState, useEffect } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { laundryApi } from '../api.js'
import api from '../../../shared/api/client.js'

export default function NewItemModal({ onClose }) {
  const qc = useQueryClient()
  const [form, setForm] = useState({ room_id: '', item_count: 1, notes: '', urgent: false, item_details: '', phone_override: '' })
  const [roomSearch, setRoomSearch] = useState('')
  const [phoneLoading, setPhoneLoading] = useState(false)

  const { data: rooms = [] } = useQuery({
    queryKey: ['rooms-list'],
    queryFn: () => api.get('/checkin/available-rooms').then(r => r.data).catch(() => []),
  })

  const filtered = rooms.filter(r =>
    !roomSearch || `${r.block} ${r.room_no}`.toLowerCase().includes(roomSearch.toLowerCase())
  )

  const create = useMutation({
    mutationFn: () => laundryApi.createItem({
      ...form,
      room_id: +form.room_id,
      urgent: form.urgent ? 1 : 0,
      phone_override: form.phone_override || undefined,
    }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['laundry-items'] }); onClose() },
  })

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  // Auto-fill phone when room changes
  useEffect(() => {
    if (!form.room_id) return
    setPhoneLoading(true)
    laundryApi.getRoomOccupant(form.room_id)
      .then(data => { if (data?.phone_number) set('phone_override', data.phone_number) })
      .finally(() => setPhoneLoading(false))
  }, [form.room_id])

  const selectedRoom = rooms.find(r => (r.room_id || r.id) === +form.room_id)

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.75)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      zIndex: 1000, backdropFilter: 'blur(4px)',
    }}
      onClick={e => e.target === e.currentTarget && onClose()}
    >
      <div className="panel fade-up" style={{ width: 420, maxWidth: '92vw', maxHeight: '90vh', overflow: 'auto' }}>
        {/* Header */}
        <div className="panel-header" style={{
          background: 'linear-gradient(135deg, rgba(240,165,0,0.08), transparent)',
          borderBottom: '1px solid rgba(240,165,0,0.12)',
        }}>
          <div>
            <span className="panel-title">YENİ ÇAMAŞIR KAYDI</span>
            <div className="panel-subtitle">Oda seç · Parça gir · Kaydet</div>
          </div>
          <button className="btn btn-ghost btn-xs" onClick={onClose}>ESC</button>
        </div>

        <div className="panel-body" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

          {/* Oda arama + seçim */}
          <div>
            <label className="form-label">ODA SEÇİMİ</label>
            <input
              className="form-input"
              value={roomSearch}
              onChange={e => setRoomSearch(e.target.value)}
              placeholder="Blok veya oda numarası ara..."
              style={{ marginBottom: 6 }}
            />
            {selectedRoom && (
              <div style={{
                padding: '6px 10px', borderRadius: 6, marginBottom: 6,
                background: 'rgba(240,165,0,0.08)', border: '1px solid rgba(240,165,0,0.2)',
                fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--accent)',
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              }}>
                <span>✓ {selectedRoom.block} - {selectedRoom.room_no}</span>
                <button
                  className="btn btn-ghost btn-xs"
                  onClick={() => { set('room_id', ''); setRoomSearch('') }}
                  style={{ padding: '2px 6px' }}
                >✕</button>
              </div>
            )}
            <div style={{
              maxHeight: 160, overflowY: 'auto',
              border: '1px solid var(--border)', borderRadius: 7,
              background: 'var(--surface2)',
            }}>
              {filtered.length === 0 ? (
                <div style={{ padding: '10px 12px', fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--text3)' }}>
                  Oda bulunamadı
                </div>
              ) : filtered.slice(0, 20).map(r => {
                const id = r.room_id || r.id
                const isSelected = +form.room_id === id
                return (
                  <div key={id}
                    onClick={() => { set('room_id', id); setRoomSearch('') }}
                    style={{
                      padding: '8px 12px', cursor: 'pointer',
                      borderBottom: '1px solid rgba(35,45,63,0.4)',
                      background: isSelected ? 'rgba(240,165,0,0.08)' : 'transparent',
                      color: isSelected ? 'var(--accent)' : 'var(--text)',
                      fontFamily: 'var(--mono)', fontSize: 11,
                      transition: 'background 0.15s',
                      display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                    }}
                    onMouseEnter={e => { if (!isSelected) e.currentTarget.style.background = 'rgba(255,255,255,0.04)' }}
                    onMouseLeave={e => { if (!isSelected) e.currentTarget.style.background = 'transparent' }}
                  >
                    <span>{r.block} - {r.room_no}</span>
                    {isSelected && <span style={{ fontSize: 9 }}>✓</span>}
                  </div>
                )
              })}
            </div>
          </div>

          {/* Parça adedi */}
          <div>
            <label className="form-label">PARÇA ADEDİ</label>
            <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
              <button
                className="btn btn-ghost"
                style={{ width: 36, height: 36, padding: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18 }}
                onClick={() => set('item_count', Math.max(1, form.item_count - 1))}
              >−</button>
              <span style={{
                fontFamily: 'var(--display)', fontSize: 38, letterSpacing: 3,
                color: 'var(--accent)', minWidth: 52, textAlign: 'center', lineHeight: 1,
              }}>
                {form.item_count}
              </span>
              <button
                className="btn btn-ghost"
                style={{ width: 36, height: 36, padding: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18 }}
                onClick={() => set('item_count', form.item_count + 1)}
              >+</button>
            </div>
          </div>

          {/* Item details */}
          <div>
            <label className="form-label">KIYAFET DETAYLARI (OPSİYONEL)</label>
            <input className="form-input" value={form.item_details}
              onChange={e => set('item_details', e.target.value)}
              placeholder="Örn: 2 tişört, 1 pantolon..." />
          </div>

          {/* Notes */}
          <div>
            <label className="form-label">NOTLAR</label>
            <input className="form-input" value={form.notes}
              onChange={e => set('notes', e.target.value)}
              placeholder="Açıklama..." />
          </div>

          {/* Phone */}
          <div>
            <label className="form-label" style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span>WHATSAPP TELEFon</span>
              {phoneLoading && <span style={{ fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--text3)' }}>yükleniyor...</span>}
              {form.phone_override && !phoneLoading && (
                <a
                  href={`https://wa.me/${form.phone_override.replace(/\D/g,'').replace(/^0/,'90')}`}
                  target="_blank" rel="noreferrer"
                  style={{ fontFamily: 'var(--mono)', fontSize: 9, color: '#25D366', textDecoration: 'none', letterSpacing: 0.5 }}
                >
                  WA →
                </a>
              )}
            </label>
            <input className="form-input" value={form.phone_override}
              onChange={e => set('phone_override', e.target.value)}
              placeholder="Oda sakininden otomatik · veya gir..."
              style={{ fontFamily: 'var(--mono)' }} />
          </div>

          {/* Urgent */}
          <label style={{
            display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer',
            padding: '10px 12px', borderRadius: 8,
            background: form.urgent ? 'rgba(231,76,60,0.08)' : 'var(--surface2)',
            border: `1px solid ${form.urgent ? 'rgba(231,76,60,0.25)' : 'var(--border)'}`,
            transition: 'all 0.2s',
          }}>
            <input type="checkbox" checked={form.urgent}
              onChange={e => set('urgent', e.target.checked)}
              style={{ accentColor: 'var(--red)', width: 14, height: 14 }} />
            <span style={{
              fontFamily: 'var(--mono)', fontSize: 11, fontWeight: 700,
              color: form.urgent ? 'var(--red)' : 'var(--text2)',
              letterSpacing: 1,
            }}>
              ACİL İŞARETLE
            </span>
            {form.urgent && (
              <span style={{ fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--red)', opacity: 0.7, marginLeft: 'auto' }}>
                Öncelikli yıkama
              </span>
            )}
          </label>

          {create.isError && (
            <div className="alert alert-danger">
              {create.error?.response?.data?.error || 'Hata oluştu'}
            </div>
          )}

          <div style={{ display: 'flex', gap: 8 }}>
            <button
              className="btn btn-primary"
              style={{ flex: 1, padding: '10px', letterSpacing: 1 }}
              onClick={() => create.mutate()}
              disabled={!form.room_id || create.isPending}
            >
              {create.isPending ? 'Kaydediliyor...' : '+ KAYDET'}
            </button>
            <button className="btn btn-ghost" onClick={onClose}>İptal</button>
          </div>
        </div>
      </div>
    </div>
  )
}
