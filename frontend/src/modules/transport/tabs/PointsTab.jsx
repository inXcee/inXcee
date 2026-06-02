import { useState, useRef, lazy, Suspense } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import api from '../../../shared/api/client.js'
import { REGIONS } from '../zonguldakBartin.js'
import { ModalShell, Label, ModalActions, EmptyState, toast, toastErr } from '../shared.jsx'

const MapPicker = lazy(() => import('../MapPicker.jsx'))
const DISTRICTS = [...new Set(REGIONS.map(r => r.name))]

// ─────────────────────────────────────────────────────────────────────────────
// DURAKLAR
// ─────────────────────────────────────────────────────────────────────────────
export default function PointsTab() {
  const qc = useQueryClient()
  const [editing, setEditing] = useState(null)
  const [creating, setCreating] = useState(false)

  const { data: points = [] } = useQuery({ queryKey: ['transport-points'], queryFn: () => api.get('/transport/pickup-points').then(r => r.data) })

  const delMut = useMutation({
    mutationFn: (id) => api.delete(`/transport/pickup-points/${id}`),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['transport-points'] }); toast('Durak kapatıldı') },
    onError: toastErr,
  })

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 14 }}>
        <div style={{ fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--text3)', letterSpacing: 2 }}>{points.length} DURAK</div>
        <button onClick={() => setCreating(true)} className="btn btn-primary btn-sm" style={{ borderRadius: 10 }}>+ DURAK</button>
      </div>

      {points.length === 0 ? (
        <EmptyState icon="📍" title="HENÜZ DURAK YOK" desc="İlk durağı oluştur" />
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 10 }}>
          {points.map(p => (
            <div key={p.id} style={{
              borderRadius: 12, background: 'var(--surface)', border: '1px solid var(--border)',
              opacity: p.is_active ? 1 : 0.55, overflow: 'hidden',
            }}>
              {p.photo_url && (
                <img src={p.photo_url} alt={p.name} loading="lazy"
                  style={{ width: '100%', height: 120, objectFit: 'cover', display: 'block' }} />
              )}
              <div style={{ padding: 14 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                <span style={{ fontSize: 14 }}>📍</span>
                <strong style={{ fontSize: 13 }}>{p.name}</strong>
                {!p.is_active && <span style={{ fontSize: 9, color: 'var(--text3)', marginLeft: 'auto' }}>PASİF</span>}
              </div>
              {p.district && <div style={{ fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--accent)', marginBottom: 4 }}>{p.district} {p.neighborhood ? `· ${p.neighborhood}` : ''}</div>}
              <div style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--text3)', marginBottom: 8 }}>
                👥 {p.staff_count} personel · 🛣 {p.route_count} rota
              </div>
              {p.lat != null && p.lng != null && (
                <a href={`https://www.google.com/maps?q=${p.lat},${p.lng}`} target="_blank" rel="noreferrer"
                  style={{ fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--accent)', textDecoration: 'none', marginBottom: 4, display: 'inline-block' }}>
                  🗺 Haritada Aç ({p.lat.toFixed(4)}, {p.lng.toFixed(4)})
                </a>
              )}
              {p.notes && <div style={{ fontSize: 11, color: 'var(--text3)', marginBottom: 8 }}>{p.notes}</div>}
              <div style={{ display: 'flex', gap: 4 }}>
                <button onClick={() => setEditing(p)} className="btn btn-ghost btn-xs" style={{ borderRadius: 8, flex: 1 }}>DÜZENLE</button>
                {p.is_active && <button onClick={() => delMut.mutate(p.id)} className="btn btn-ghost btn-xs" style={{ borderRadius: 8, color: 'var(--red)' }}>KAPAT</button>}
              </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {(creating || editing) && <PointFormModal initial={editing} onClose={() => { setCreating(false); setEditing(null) }} onSaved={() => qc.invalidateQueries({ queryKey: ['transport-points'] })} />}
    </div>
  )
}

function PointFormModal({ initial, onClose, onSaved }) {
  const qc = useQueryClient()
  const [name, setName] = useState(initial?.name || '')
  const [district, setDistrict] = useState(initial?.district || '')
  const [neighborhood, setNeighborhood] = useState(initial?.neighborhood || '')
  const [notes, setNotes] = useState(initial?.notes || '')
  const [lat, setLat] = useState(initial?.lat ?? null)
  const [lng, setLng] = useState(initial?.lng ?? null)
  const [photoUrl, setPhotoUrl] = useState(initial?.photo_url || null)
  const [isActive, setIsActive] = useState(initial?.is_active ?? 1)
  const [showMap, setShowMap] = useState(!!(initial?.lat && initial?.lng))
  const photoFileRef = useRef(null)

  const mut = useMutation({
    mutationFn: () => {
      const body = { name, district, neighborhood, notes, lat, lng, is_active: isActive }
      return initial?.id ? api.put(`/transport/pickup-points/${initial.id}`, body) : api.post('/transport/pickup-points', body)
    },
    onSuccess: () => { onSaved(); onClose(); toast('Kaydedildi') },
    onError: toastErr,
  })

  const photoUpload = useMutation({
    mutationFn: (file) => {
      const fd = new FormData()
      fd.append('photo', file)
      return api.post(`/transport/pickup-points/${initial.id}/photo`, fd)
    },
    onSuccess: (r) => { setPhotoUrl(r.data.photo_url); qc.invalidateQueries({ queryKey: ['transport-points'] }); toast('Fotoğraf yüklendi') },
    onError: toastErr,
  })

  const photoDelete = useMutation({
    mutationFn: () => api.delete(`/transport/pickup-points/${initial.id}/photo`),
    onSuccess: () => { setPhotoUrl(null); qc.invalidateQueries({ queryKey: ['transport-points'] }); toast('Fotoğraf silindi') },
    onError: toastErr,
  })

  return (
    <ModalShell onClose={onClose} title={initial?.id ? 'DURAK DÜZENLE' : 'YENİ DURAK'} wide>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <div>
          <Label>Durak Adı *</Label>
          <input className="form-input" value={name} onChange={e => setName(e.target.value)} autoFocus placeholder="Ör: Eski Sanayi, Belediye Önü" style={{ borderRadius: 10 }} />
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
          <div>
            <Label>İlçe / Bölge</Label>
            <input className="form-input" list="district-list" value={district} onChange={e => setDistrict(e.target.value)} placeholder="Zonguldak — Merkez…" style={{ borderRadius: 10 }} />
            <datalist id="district-list">
              {DISTRICTS.map(d => <option key={d} value={d} />)}
            </datalist>
          </div>
          <div>
            <Label>Mahalle</Label>
            <input className="form-input" value={neighborhood} onChange={e => setNeighborhood(e.target.value)} style={{ borderRadius: 10 }} />
          </div>
        </div>
        <div>
          <Label>Notlar</Label>
          <input className="form-input" value={notes} onChange={e => setNotes(e.target.value)} placeholder="İşaret, yön tarifi, vb." style={{ borderRadius: 10 }} />
        </div>

        {/* Fotoğraf — sadece kayıt sonrası yüklenebilir */}
        {initial?.id ? (
          <div>
            <Label>📷 FOTOĞRAF</Label>
            <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
              {photoUrl ? (
                <img src={photoUrl} alt="durak" loading="lazy"
                  style={{ width: 120, height: 90, objectFit: 'cover', borderRadius: 8, border: '1px solid var(--border)' }} />
              ) : (
                <div style={{ width: 120, height: 90, borderRadius: 8, background: 'var(--surface2)', border: '1px dashed var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 24, color: 'var(--text4)' }}>📷</div>
              )}
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 4 }}>
                <input ref={photoFileRef} type="file" accept="image/jpeg,image/png,image/webp" style={{ display: 'none' }}
                  onChange={e => { const f = e.target.files?.[0]; if (f) photoUpload.mutate(f) }} />
                <button type="button" onClick={() => photoFileRef.current?.click()} className="btn btn-ghost btn-sm" disabled={photoUpload.isPending} style={{ borderRadius: 8 }}>
                  {photoUpload.isPending ? 'Yükleniyor…' : (photoUrl ? 'Değiştir' : 'Fotoğraf Yükle')}
                </button>
                {photoUrl && (
                  <button type="button" onClick={() => photoDelete.mutate()} disabled={photoDelete.isPending} className="btn btn-ghost btn-sm" style={{ borderRadius: 8, color: 'var(--red)' }}>
                    Sil
                  </button>
                )}
                <div style={{ fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--text4)', marginTop: 4 }}>
                  JPG/PNG/WEBP · maks 5MB
                </div>
              </div>
            </div>
          </div>
        ) : (
          <div style={{ fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--text4)', padding: '6px 10px', background: 'var(--surface2)', borderRadius: 8 }}>
            📷 Önce durağı kaydet, sonra fotoğraf yükleyebilirsin
          </div>
        )}

        {/* Harita */}
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
            <Label>📍 HARITADAN KONUM</Label>
            <button type="button" onClick={() => setShowMap(s => !s)}
              style={{ background: 'transparent', border: 'none', color: 'var(--accent)', fontSize: 10, fontFamily: 'var(--mono)', cursor: 'pointer' }}>
              {showMap ? 'GIZLE ▲' : (lat ? `📍 ${(+lat).toFixed(4)}, ${(+lng).toFixed(4)} — DÜZENLE` : 'HARITAYI AÇ')}
            </button>
          </div>
          {showMap && (
            <Suspense fallback={<div style={{ height: 320, background: 'var(--surface2)', borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text3)', fontFamily: 'var(--mono)', fontSize: 11 }}>Harita yükleniyor…</div>}>
              <MapPicker initialLat={lat} initialLng={lng}
                onChange={(la, ln) => { setLat(la); setLng(ln) }} />
            </Suspense>
          )}
          {/* Manuel koordinat girişi — harita çalışmazsa yedek */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr auto', gap: 6, marginTop: 6 }}>
            <input className="form-input" type="number" step="any" placeholder="Enlem (lat)"
              value={lat ?? ''} onChange={e => setLat(e.target.value === '' ? null : +e.target.value)}
              style={{ borderRadius: 8, fontSize: 11, fontFamily: 'var(--mono)' }} />
            <input className="form-input" type="number" step="any" placeholder="Boylam (lng)"
              value={lng ?? ''} onChange={e => setLng(e.target.value === '' ? null : +e.target.value)}
              style={{ borderRadius: 8, fontSize: 11, fontFamily: 'var(--mono)' }} />
            {lat != null && lng != null && (
              <a href={`https://www.google.com/maps?q=${lat},${lng}`} target="_blank" rel="noreferrer"
                className="btn btn-ghost btn-sm"
                style={{ borderRadius: 8, textDecoration: 'none', display: 'inline-flex', alignItems: 'center' }}>
                🗺 Google Maps
              </a>
            )}
          </div>
          <div style={{ fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--text4)', marginTop: 4 }}>
            Google Maps'ten konum kopyala: sağ tık → koordinatlara tıkla → buraya yapıştır
          </div>
        </div>

        {initial?.id && (
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: 'var(--text2)', cursor: 'pointer' }}>
            <input type="checkbox" checked={!!isActive} onChange={e => setIsActive(e.target.checked ? 1 : 0)} /> Aktif
          </label>
        )}
      </div>
      <ModalActions onClose={onClose} onSave={() => mut.mutate()} disabled={!name || mut.isPending} loading={mut.isPending} />
    </ModalShell>
  )
}

