import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { laundryApi } from '../api.js'

export default function DamageModal({ item, onClose }) {
  const qc = useQueryClient()
  const [description, setDescription] = useState('')
  const [photo, setPhoto] = useState(null)
  const [preview, setPreview] = useState(null)
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
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['laundry-items'] }); onClose() },
  })

  const handlePhoto = (e) => {
    const file = e.target.files[0] || null
    setPhoto(file)
    if (file) {
      const url = URL.createObjectURL(file)
      setPreview(url)
    } else {
      setPreview(null)
    }
  }

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.75)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      zIndex: 1000, backdropFilter: 'blur(4px)',
    }}
      onClick={e => e.target === e.currentTarget && onClose()}
    >
      <div className="panel fade-up" style={{ width: 400, maxWidth: '92vw' }}>
        {/* Header */}
        <div className="panel-header" style={{
          background: 'linear-gradient(135deg, rgba(231,76,60,0.07), transparent)',
          borderBottom: '1px solid rgba(231,76,60,0.15)',
        }}>
          <div>
            <span className="panel-title" style={{ color: 'var(--red)' }}>HASAR KAYDI</span>
            <div className="panel-subtitle">
              {item.block} · {item.room_no} — {item.item_count} parça
            </div>
          </div>
          <button className="btn btn-ghost btn-xs" onClick={onClose}>ESC</button>
        </div>

        <div className="panel-body" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {/* Açıklama */}
          <div>
            <label className="form-label">HASAR AÇIKLAMASI *</label>
            <textarea
              className="form-textarea"
              value={description}
              onChange={e => setDescription(e.target.value)}
              placeholder="Leke, yırtık, renk akması, düğme kopması..."
              rows={3}
              style={{ resize: 'none' }}
            />
          </div>

          {/* Fotoğraf */}
          <div>
            <label className="form-label">FOTOĞRAF (OPSİYONEL)</label>

            {/* Önizleme */}
            {preview ? (
              <div style={{ marginBottom: 8, position: 'relative' }}>
                <img src={preview} alt="Önizleme"
                  style={{
                    width: '100%', height: 160, objectFit: 'cover',
                    borderRadius: 8, border: '1px solid var(--border)',
                  }}
                />
                <button
                  className="btn btn-ghost btn-xs"
                  style={{
                    position: 'absolute', top: 6, right: 6,
                    background: 'rgba(0,0,0,0.6)', border: 'none', color: '#fff',
                  }}
                  onClick={() => { setPhoto(null); setPreview(null) }}
                >
                  ✕ Kaldır
                </button>
                <div style={{
                  position: 'absolute', bottom: 6, left: 8,
                  fontFamily: 'var(--mono)', fontSize: 8, color: '#fff',
                  background: 'rgba(0,0,0,0.5)', padding: '2px 6px', borderRadius: 3,
                }}>
                  {photo.name} · {(photo.size / 1024).toFixed(0)} KB
                </div>
              </div>
            ) : (
              <label style={{
                display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6,
                padding: '18px 20px', borderRadius: 8, cursor: 'pointer',
                border: '1px dashed var(--border)', background: 'var(--surface2)',
                transition: 'border-color 0.15s',
              }}
                onMouseEnter={e => e.currentTarget.style.borderColor = 'var(--accent)'}
                onMouseLeave={e => e.currentTarget.style.borderColor = 'var(--border)'}
              >
                <span style={{ fontSize: 24 }}>📷</span>
                <span style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--text3)' }}>
                  Fotoğraf seç veya çek
                </span>
                <input type="file" accept="image/*" capture="environment"
                  onChange={handlePhoto} style={{ display: 'none' }} />
              </label>
            )}
          </div>

          {report.isError && (
            <div className="alert alert-danger">
              {report.error?.response?.data?.error || 'Hata'}
            </div>
          )}

          <div style={{ display: 'flex', gap: 8 }}>
            <button
              className="btn btn-sm"
              style={{
                flex: 1, background: 'var(--red)', color: '#fff',
                padding: '10px', letterSpacing: 1,
              }}
              onClick={() => report.mutate()}
              disabled={!description.trim() || report.isPending || uploading}
            >
              {uploading ? 'Yükleniyor...' : report.isPending ? 'Kaydediliyor...' : '⚠ HASAR KAYDET'}
            </button>
            <button className="btn btn-ghost btn-sm" onClick={onClose}>İptal</button>
          </div>
        </div>
      </div>
    </div>
  )
}
