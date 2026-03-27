import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { laundryApi } from '../api.js'

export default function DamageModal({ item, onClose }) {
  const qc = useQueryClient()
  const [description, setDescription] = useState('')
  const [photo, setPhoto] = useState(null)
  const [uploading, setUploading] = useState(false)

  const report = useMutation({
    mutationFn: async () => {
      let photo_url = null
      if (photo) {
        setUploading(true)
        try {
          const res = await laundryApi.uploadPhoto(photo)
          photo_url = res.url || res.path
        } finally {
          setUploading(false)
        }
      }
      return laundryApi.reportDamage(item.id, { description, photo_url })
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['laundry-items'] })
      onClose()
    },
  })

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000,
    }}
      onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="panel fade-up" style={{ width: 380, maxWidth: '90vw' }}>
        <div className="panel-header">
          <div>
            <span className="panel-title">HASAR KAYDI</span>
            <span className="panel-subtitle">
              {item.block} · {item.room_no} — {item.item_count} parça
            </span>
          </div>
          <button className="btn btn-ghost btn-xs" onClick={onClose}>ESC</button>
        </div>
        <div className="panel-body" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div>
            <label className="form-label">HASAR AÇIKLAMASI *</label>
            <textarea className="form-textarea" value={description}
              onChange={e => setDescription(e.target.value)}
              placeholder="Leke, yırtık, renk akması..." rows={3} />
          </div>

          <div>
            <label className="form-label">FOTOĞRAF (OPSİYONEL)</label>
            <input type="file" accept="image/*" capture="environment"
              onChange={e => setPhoto(e.target.files[0] || null)}
              className="form-input" style={{ padding: 6 }} />
            {photo && (
              <div style={{ fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--text3)', marginTop: 4 }}>
                {photo.name} ({(photo.size / 1024).toFixed(0)} KB)
              </div>
            )}
          </div>

          {report.isError && (
            <div className="alert alert-danger">
              {report.error?.response?.data?.error || 'Hata'}
            </div>
          )}

          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn btn-sm" style={{ flex: 1, background: 'var(--accent)', color: '#000' }}
              onClick={() => report.mutate()}
              disabled={!description.trim() || report.isPending || uploading}>
              {uploading ? 'Yükleniyor...' : report.isPending ? 'Kaydediliyor...' : 'HASAR KAYDET'}
            </button>
            <button className="btn btn-ghost btn-sm" onClick={onClose}>İptal</button>
          </div>
        </div>
      </div>
    </div>
  )
}
