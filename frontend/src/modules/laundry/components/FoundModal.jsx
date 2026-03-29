import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { laundryApi } from '../api.js'

export default function FoundModal({ item, onClose }) {
  const qc = useQueryClient()
  const [sendWA, setSendWA] = useState(true)

  const name = item.occupant_name || item.intake_name || ''
  const firstName = name ? name.split(' ')[0] : ''
  const shelf = item.shelf_location || '—'

  const waMsg = `Merhaba${firstName ? ' ' + firstName : ''}!\n\nKayıp olarak bildirilen ${item.item_count} parça çamaşırınız bulundu.\nRaf: ${shelf}\nTeslim için çamaşırhaneye gelebilirsiniz.`

  const found = useMutation({
    mutationFn: () => laundryApi.markFound(item.id, sendWA && !!item.phone_number),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['laundry-items'] })
      onClose()
    },
  })

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.75)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      zIndex: 1200, backdropFilter: 'blur(4px)',
    }} onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="panel fade-up" style={{ width: 420, maxWidth: '92vw' }}>
        <div className="panel-header" style={{
          background: 'linear-gradient(135deg, rgba(39,201,106,0.07), transparent)',
          borderBottom: '1px solid rgba(39,201,106,0.12)',
        }}>
          <div>
            <span className="panel-title" style={{ color: 'var(--green)' }}>KAYIP BULUNDU</span>
            <div className="panel-subtitle">{item.block} · {item.room_no} · {item.item_count} parça</div>
          </div>
          <button className="btn btn-ghost btn-xs" onClick={onClose}>ESC</button>
        </div>

        <div className="panel-body" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {/* Item özeti */}
          <div style={{
            padding: '10px 14px', background: 'var(--surface2)',
            border: '1px solid var(--border)', borderRadius: 8,
          }}>
            <div style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--text)', marginBottom: 4 }}>
              {name && <span>{name} · </span>}
              {item.item_count} parça
              {shelf !== '—' && <span> · Raf: {shelf}</span>}
            </div>
            {item.clothing_items && (() => {
              try {
                const cl = JSON.parse(item.clothing_items)
                return <div style={{ fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--text3)' }}>
                  {cl.map(c => `${c.qty}× ${c.type}${c.color ? ` (${c.color})` : ''}`).join(' · ')}
                </div>
              } catch { return null }
            })()}
          </div>

          {/* WA mesaj önizleme */}
          {item.phone_number && (
            <div>
              <label className="form-label" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <input type="checkbox" checked={sendWA} onChange={e => setSendWA(e.target.checked)}
                  style={{ accentColor: '#25D366', width: 13, height: 13 }} />
                <span>WhatsApp Bildirimi Gönder</span>
                <span style={{ fontFamily: 'var(--mono)', fontSize: 9, color: '#25D366' }}>{item.phone_number}</span>
              </label>
              {sendWA && (
                <div style={{
                  padding: '10px 12px', background: 'rgba(37,211,102,0.05)',
                  border: '1px solid rgba(37,211,102,0.2)', borderRadius: 8,
                  fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--text2)', whiteSpace: 'pre-line', lineHeight: 1.6,
                }}>
                  {waMsg}
                </div>
              )}
            </div>
          )}

          {!item.phone_number && (
            <div className="alert alert-warn" style={{ fontSize: 10 }}>
              Bu kayıt için telefon numarası yok — WA bildirimi gönderilemeyecek.
            </div>
          )}

          {found.isError && (
            <div className="alert alert-danger">{found.error?.response?.data?.error || 'Hata'}</div>
          )}

          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn btn-sm" style={{ flex: 1, background: 'var(--green)', color: '#000', padding: '10px', letterSpacing: 1 }}
              onClick={() => found.mutate()}
              disabled={found.isPending}>
              {found.isPending ? 'Kaydediliyor...' : `✓ BULUNDU ONAYLA${sendWA && item.phone_number ? ' + WA GÖNDER' : ''}`}
            </button>
            <button className="btn btn-ghost btn-sm" onClick={onClose}>İptal</button>
          </div>
        </div>
      </div>
    </div>
  )
}
