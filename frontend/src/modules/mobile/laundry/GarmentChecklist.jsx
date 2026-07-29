import { useEffect, useMemo, useState } from 'react'
import mobileApi from '../auth/mobileApi.js'

const REASONS = [
  ['missing', 'Eksik'],
  ['damaged', 'Hasarlı'],
  ['no_ironing', 'Ütü gerekmiyor'],
  ['rework', 'Yeniden işlem'],
  ['other', 'Diğer'],
]

function actionId(garmentId) {
  return `mobile-${garmentId}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

export default function GarmentChecklist({ item, onClose, onChanged }) {
  const [garments, setGarments] = useState([])
  const [loading, setLoading] = useState(true)
  const [busyId, setBusyId] = useState(null)
  const [exception, setException] = useState(null)
  const [reason, setReason] = useState('missing')
  const [note, setNote] = useState('')
  const [photo, setPhoto] = useState(null)
  const [shelf, setShelf] = useState(item.shelf_location || '')
  const [error, setError] = useState('')

  async function load() {
    setLoading(true)
    try {
      const response = await mobileApi.get(`/laundry/items/${item.id}/garments`)
      setGarments(response.data)
    } catch (e) {
      setError(e.response?.data?.error || 'Kıyafetler yüklenemedi')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [item.id])

  const ironing = useMemo(
    () => garments.filter(garment => garment.requires_ironing === 1),
    [garments]
  )
  const completed = ironing.filter(garment => ['ready', 'delivered'].includes(garment.status)).length

  async function toggle(garment) {
    const next = garment.status !== 'ready'
    setBusyId(garment.id)
    setError('')
    setGarments(current => current.map(row => (
      row.id === garment.id ? { ...row, status: next ? 'ready' : 'ironing' } : row
    )))
    try {
      const response = await mobileApi.put(
        `/laundry/items/${item.id}/garments/${garment.id}/ironing`,
        { completed: next, client_action_id: actionId(garment.id) }
      )
      setGarments(current => current.map(row => (
        row.id === garment.id ? response.data.garment : row
      )))
      navigator.vibrate?.(18)
      onChanged?.()
    } catch (e) {
      setGarments(current => current.map(row => (
        row.id === garment.id ? garment : row
      )))
      setError(e.response?.data?.error || 'Tik kaydedilemedi')
    } finally {
      setBusyId(null)
    }
  }

  async function submitException() {
    if (!exception) return
    if (reason === 'damaged' && !photo) {
      setError('Hasarlı kıyafet için fotoğraf zorunludur')
      return
    }
    setBusyId(exception.id)
    setError('')
    const form = new FormData()
    form.append('reason', reason)
    form.append('note', note)
    if (photo) form.append('photo', photo)
    try {
      const response = await mobileApi.post(
        `/laundry/items/${item.id}/garments/${exception.id}/exception`,
        form
      )
      setGarments(current => current.map(row => (
        row.id === exception.id ? response.data.garment : row
      )))
      setException(null)
      setNote('')
      setPhoto(null)
      navigator.vibrate?.([15, 25, 15])
      onChanged?.()
    } catch (e) {
      setError(e.response?.data?.error || 'İstisna kaydedilemedi')
    } finally {
      setBusyId(null)
    }
  }

  async function completeBag() {
    setError('')
    try {
      await mobileApi.post(`/laundry/items/${item.id}/ironing-complete`, {
        shelf_location: shelf.trim() || null,
      })
      navigator.vibrate?.([20, 30, 20])
      onChanged?.()
      onClose()
    } catch (e) {
      setError(e.response?.data?.error || 'Torba hazır durumuna alınamadı')
    }
  }

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 100, background: '#f3f4f6', overflowY: 'auto', padding: 16 }}>
      <div style={{ maxWidth: 560, margin: '0 auto' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
          <button type="button" onClick={onClose} style={smallButton}>←</button>
          <div style={{ flex: 1 }}>
            <strong>{item.bag_no || `#${item.id}`}</strong>
            <div style={{ color: '#6b7280', fontSize: 12 }}>
              {item.block} {item.room_no} · {completed}/{ironing.length} ütülendi
            </div>
          </div>
        </div>

        {error && <div style={errorBox}>{error}</div>}
        {loading ? <div style={emptyBox}>Yükleniyor…</div> : garments.length === 0 ? (
          <div style={emptyBox}>Bu torba toplam adetle izleniyor. Kiosk üzerinden adet doğrulaması yapın.</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {garments.map(garment => {
              const resolved = ['ready', 'delivered', 'lost', 'damaged'].includes(garment.status)
              return (
                <div key={garment.id} style={card}>
                  <button
                    type="button"
                    disabled={busyId === garment.id || garment.requires_ironing !== 1 || ['lost', 'damaged'].includes(garment.status)}
                    onClick={() => toggle(garment)}
                    style={{
                      width: 52, height: 52, borderRadius: 12,
                      border: `2px solid ${resolved ? '#10b981' : '#d1d5db'}`,
                      background: resolved ? '#d1fae5' : '#fff',
                      color: resolved ? '#047857' : '#6b7280',
                      fontSize: 22, flexShrink: 0,
                    }}
                  >
                    {resolved ? '✓' : '○'}
                  </button>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <strong style={{ fontFamily: 'monospace' }}>{garment.garment_code}</strong>
                    <div style={{ fontSize: 13, color: '#4b5563' }}>
                      {garment.emoji || '👕'} {garment.garment_type}
                    </div>
                    <div style={{ fontSize: 11, color: '#9ca3af' }}>
                      {garment.requires_ironing ? 'Ütü gerekli' : 'Ütü gerekmiyor'} · {garment.status}
                    </div>
                  </div>
                  {!['lost', 'damaged', 'delivered'].includes(garment.status) && (
                    <button type="button" onClick={() => setException(garment)} style={warningButton}>!</button>
                  )}
                </div>
              )
            })}
          </div>
        )}

        {garments.length > 0 && (
          <div style={{ marginTop: 14, background: '#fff', padding: 14, borderRadius: 12 }}>
            <label style={labelStyle}>RAF KONUMU</label>
            <input value={shelf} onChange={event => setShelf(event.target.value)} placeholder="Örn. A-02" style={inputStyle} />
            <button type="button" onClick={completeBag} disabled={ironing.length > completed} style={primaryButton}>
              Torbayı Hazıra Al
            </button>
          </div>
        )}
      </div>

      {exception && (
        <div style={overlay}>
          <div style={{ background: '#fff', borderRadius: 16, padding: 16, width: 'min(420px, calc(100vw - 32px))' }}>
            <h2 style={{ margin: '0 0 12px', fontSize: 18 }}>{exception.garment_code} · İstisna</h2>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
              {REASONS.map(([value, label]) => (
                <button key={value} type="button" onClick={() => setReason(value)}
                  style={{ ...smallButton, background: reason === value ? '#fef3c7' : '#f3f4f6' }}>
                  {label}
                </button>
              ))}
            </div>
            <textarea value={note} onChange={event => setNote(event.target.value)}
              placeholder="Kısa not (opsiyonel)" style={{ ...inputStyle, minHeight: 80, marginTop: 10 }} />
            <label style={{ ...inputStyle, display: 'flex', alignItems: 'center', marginTop: 8 }}>
              📷 {photo ? photo.name : reason === 'damaged' ? 'Fotoğraf seç (zorunlu)' : 'Fotoğraf seç'}
              <input type="file" accept="image/*" capture="environment" hidden
                onChange={event => setPhoto(event.target.files?.[0] || null)} />
            </label>
            <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
              <button type="button" onClick={() => setException(null)} style={{ ...smallButton, flex: 1 }}>İptal</button>
              <button type="button" onClick={submitException} style={{ ...primaryButton, flex: 1, marginTop: 0 }}>Kaydet</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

const card = { display: 'flex', alignItems: 'center', gap: 10, background: '#fff', borderRadius: 12, padding: 10, boxShadow: '0 1px 3px rgba(0,0,0,.08)' }
const smallButton = { minWidth: 48, minHeight: 48, border: '1px solid #d1d5db', borderRadius: 10, background: '#fff', color: '#374151', fontWeight: 700 }
const warningButton = { ...smallButton, minWidth: 48, color: '#b45309', background: '#fffbeb' }
const primaryButton = { width: '100%', minHeight: 50, border: 0, borderRadius: 10, marginTop: 10, background: '#10b981', color: '#fff', fontWeight: 800 }
const inputStyle = { width: '100%', boxSizing: 'border-box', minHeight: 48, border: '1px solid #d1d5db', borderRadius: 10, padding: '10px 12px', background: '#fff' }
const labelStyle = { display: 'block', marginBottom: 6, fontSize: 11, fontWeight: 800, color: '#6b7280' }
const errorBox = { marginBottom: 10, padding: 10, borderRadius: 8, background: '#fee2e2', color: '#b91c1c', fontSize: 13 }
const emptyBox = { padding: 24, textAlign: 'center', color: '#6b7280', background: '#fff', borderRadius: 12 }
const overlay = { position: 'fixed', inset: 0, zIndex: 110, background: 'rgba(15,23,42,.65)', display: 'grid', placeItems: 'center', padding: 16 }
