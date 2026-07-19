import { useState, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import api from '../../shared/api/client.js'
import { PHOTO_CATEGORIES, PHOTO_CATEGORY_MAP } from './shared.jsx'
import { downscalePhoto, dataUrlToBlob } from '../../shared/photo.js'

function catMeta(id) {
  return PHOTO_CATEGORY_MAP[id] || PHOTO_CATEGORY_MAP.genel
}

// Bir temizlik görevinin TÜM fotoğraflarını gösteren lightbox galeri.
// Yönetici: foto ekleyebilir, kategori/açıklama düzenleyebilir, silebilir.
export default function TaskPhotoGallery({ task, isManager, onClose, onChanged }) {
  const qc = useQueryClient()
  const [idx, setIdx] = useState(0)
  const [addCategory, setAddCategory] = useState('genel')
  const [captionDraft, setCaptionDraft] = useState('')
  const [busy, setBusy] = useState(false)

  const { data: photos = [], isLoading } = useQuery({
    queryKey: ['hk-task-photos', task.id],
    queryFn: () => api.get(`/housekeeping/tasks/${task.id}/photos`).then(r => r.data.photos || []),
  })
  const current = photos[Math.min(idx, Math.max(0, photos.length - 1))] || null

  useEffect(() => { setCaptionDraft(current?.caption || '') }, [current?.id])
  useEffect(() => {
    const onKey = e => {
      if (e.key === 'Escape') onClose()
      else if (e.key === 'ArrowLeft') setIdx(i => Math.max(0, i - 1))
      else if (e.key === 'ArrowRight') setIdx(i => Math.min(photos.length - 1, i + 1))
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [photos.length, onClose])

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['hk-task-photos', task.id] })
    qc.invalidateQueries({ queryKey: ['housekeeping-photo-overview'] })
    onChanged?.()
  }

  const addPhotos = useMutation({
    mutationFn: async (files) => {
      const fd = new FormData()
      fd.append('category', addCategory)
      for (let i = 0; i < files.length; i++) {
        const d = await downscalePhoto(files[i])
        fd.append('photos', dataUrlToBlob(d), `foto-${i + 1}.jpg`)
      }
      return api.post(`/housekeeping/tasks/${task.id}/photos`, fd)
    },
    onSuccess: invalidate,
  })
  const updatePhoto = useMutation({
    mutationFn: ({ photoId, patch }) => api.patch(`/housekeeping/tasks/${task.id}/photos/${photoId}`, patch),
    onSuccess: invalidate,
  })
  const deletePhoto = useMutation({
    mutationFn: (photoId) => api.delete(`/housekeeping/tasks/${task.id}/photos/${photoId}`),
    onSuccess: () => { setIdx(0); invalidate() },
  })

  async function onAddPick(e) {
    const files = [...(e.target.files || [])]
    e.target.value = ''
    if (!files.length) return
    setBusy(true)
    try { await addPhotos.mutateAsync(files) } finally { setBusy(false) }
  }

  return (
    <div onClick={onClose} style={{
      position: 'fixed', inset: 0, zIndex: 1000, background: 'rgba(0,0,0,.72)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '18px',
    }}>
      <div onClick={e => e.stopPropagation()} className="panel" style={{ width: 'min(880px,100%)', maxHeight: '92vh', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        {/* Başlık */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '12px 16px', borderBottom: '1px solid var(--border)' }}>
          <div style={{ flex: 1 }}>
            <div className="panel-title" style={{ fontSize: '14px' }}>📷 {task.area}</div>
            <div style={{ fontFamily: 'var(--mono)', fontSize: '9px', color: 'var(--text3)', marginTop: '2px' }}>
              {task.block} BLOK · KAT {task.floor} · {photos.length} FOTOĞRAF
            </div>
          </div>
          <button className="btn btn-ghost btn-sm" onClick={onClose}>✕ KAPAT</button>
        </div>

        <div style={{ overflowY: 'auto', padding: '14px 16px' }}>
          {isLoading && <div style={{ textAlign: 'center', color: 'var(--text3)', padding: '30px' }}>Yükleniyor…</div>}
          {!isLoading && photos.length === 0 && (
            <div style={{ textAlign: 'center', color: 'var(--text3)', padding: '30px' }}>
              <div style={{ fontSize: '30px', marginBottom: '6px' }}>📭</div>Bu görevde fotoğraf yok.
            </div>
          )}

          {current && (
            <>
              {/* Büyük görsel + gezinme */}
              <div style={{ position: 'relative', background: 'var(--surface2)', borderRadius: '10px', overflow: 'hidden', display: 'grid', placeItems: 'center', minHeight: '260px' }}>
                <img src={current.photo_url} alt={current.caption || 'temizlik kanıtı'} style={{ maxWidth: '100%', maxHeight: '52vh', objectFit: 'contain' }} />
                {photos.length > 1 && (
                  <>
                    <button onClick={() => setIdx(i => Math.max(0, i - 1))} disabled={idx === 0}
                      style={navBtn('left')}>‹</button>
                    <button onClick={() => setIdx(i => Math.min(photos.length - 1, i + 1))} disabled={idx >= photos.length - 1}
                      style={navBtn('right')}>›</button>
                    <div style={{ position: 'absolute', bottom: '8px', right: '10px', background: 'rgba(0,0,0,.6)', color: '#fff', borderRadius: '999px', padding: '2px 9px', fontFamily: 'var(--mono)', fontSize: '10px' }}>
                      {idx + 1} / {photos.length}
                    </div>
                  </>
                )}
                <span style={{ position: 'absolute', top: '8px', left: '10px', background: catMeta(current.category).color, color: '#fff', borderRadius: '6px', padding: '2px 8px', fontFamily: 'var(--mono)', fontSize: '9px', fontWeight: 700 }}>
                  {catMeta(current.category).icon} {catMeta(current.category).label.toUpperCase()}
                </span>
              </div>

              {/* Geçerli fotoğrafın meta + aksiyonları */}
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', alignItems: 'center', marginTop: '10px' }}>
                <span style={{ fontFamily: 'var(--mono)', fontSize: '9px', color: 'var(--text3)' }}>
                  {current.uploaded_by_name ? `${current.uploaded_by_name} · ` : ''}{current.uploaded_at ? new Date(current.uploaded_at).toLocaleString('tr-TR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : ''}
                </span>
                <a href={current.photo_url} target="_blank" rel="noreferrer" className="btn btn-ghost btn-xs" style={{ marginLeft: 'auto' }}>⬇ İndir</a>
                {isManager && (
                  <button className="btn btn-ghost btn-xs" style={{ color: 'var(--red)' }}
                    disabled={deletePhoto.isPending}
                    onClick={() => deletePhoto.mutate(current.id)}>🗑 Sil</button>
                )}
              </div>

              {/* Yönetici: kategori + açıklama düzenleme */}
              {isManager && (
                <div style={{ marginTop: '10px', padding: '10px', background: 'var(--surface2)', borderRadius: '8px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
                    {PHOTO_CATEGORIES.map(c => (
                      <button key={c.id} className={`filter-chip${current.category === c.id ? ' active' : ''}`}
                        style={current.category === c.id ? { color: c.color, borderColor: c.color } : undefined}
                        onClick={() => updatePhoto.mutate({ photoId: current.id, patch: { category: c.id } })}>
                        {c.icon} {c.label}
                      </button>
                    ))}
                  </div>
                  <div style={{ display: 'flex', gap: '6px' }}>
                    <input className="form-input" style={{ flex: 1 }} value={captionDraft} maxLength={300}
                      onChange={e => setCaptionDraft(e.target.value)} placeholder="Açıklama / not (ör. lavabo altı leke)" />
                    <button className="btn btn-ghost btn-sm" disabled={updatePhoto.isPending || captionDraft === (current.caption || '')}
                      onClick={() => updatePhoto.mutate({ photoId: current.id, patch: { caption: captionDraft } })}>Kaydet</button>
                  </div>
                </div>
              )}
              {!isManager && current.caption && (
                <div style={{ marginTop: '8px', fontSize: '12px', color: 'var(--text2)' }}>📝 {current.caption}</div>
              )}

              {/* Küçük resim şeridi */}
              {photos.length > 1 && (
                <div style={{ display: 'flex', gap: '6px', overflowX: 'auto', marginTop: '12px', paddingBottom: '4px' }}>
                  {photos.map((p, i) => (
                    <button key={p.id} onClick={() => setIdx(i)} style={{
                      flexShrink: 0, width: '58px', height: '58px', borderRadius: '6px', overflow: 'hidden', cursor: 'pointer', padding: 0,
                      border: `2px solid ${i === idx ? catMeta(p.category).color : 'var(--border)'}`, background: 'none',
                    }}>
                      <img src={p.photo_url} alt={`${i + 1}`} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                    </button>
                  ))}
                </div>
              )}
            </>
          )}

          {/* Yönetici: yeni foto ekle */}
          {isManager && (
            <div style={{ marginTop: '14px', paddingTop: '12px', borderTop: '1px solid var(--border)' }}>
              <div style={{ fontFamily: 'var(--mono)', fontSize: '9px', color: 'var(--text3)', letterSpacing: '1px', marginBottom: '6px' }}>YENİ FOTOĞRAF EKLE</div>
              <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap', marginBottom: '8px' }}>
                {PHOTO_CATEGORIES.map(c => (
                  <button key={c.id} className={`filter-chip${addCategory === c.id ? ' active' : ''}`}
                    style={addCategory === c.id ? { color: c.color, borderColor: c.color } : undefined}
                    onClick={() => setAddCategory(c.id)}>{c.icon} {c.label}</button>
                ))}
              </div>
              <label className="btn btn-ghost btn-sm" style={{ cursor: 'pointer' }}>
                {busy ? 'YÜKLENİYOR…' : '📷 FOTOĞRAF EKLE / ÇEK (çoklu)'}
                <input type="file" accept="image/*" capture="environment" multiple style={{ display: 'none' }} onChange={onAddPick} disabled={busy} />
              </label>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function navBtn(side) {
  return {
    position: 'absolute', top: '50%', transform: 'translateY(-50%)', [side]: '8px',
    width: '38px', height: '38px', borderRadius: '50%', border: 'none', cursor: 'pointer',
    background: 'rgba(0,0,0,.55)', color: '#fff', fontSize: '22px', lineHeight: '38px', padding: 0,
  }
}
