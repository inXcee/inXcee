import { useEffect, useMemo, useState } from 'react'
import { confirmDialog } from '../../shared/components/ConfirmDialog.jsx'

const REASONS = [
  ['missing', 'Eksik', '🔎'],
  ['damaged', 'Hasarlı', '⚠️'],
  ['no_ironing', 'Ütü Gerekmiyor', '↪️'],
  ['rework', 'Yeniden İşlem', '🔁'],
  ['other', 'Diğer', '•••'],
]

const SHELVES = ['A-01', 'A-02', 'B-01', 'B-02', 'C-01', 'C-02']

function newActionId() {
  return globalThis.crypto?.randomUUID?.() || `iron-${Date.now()}-${Math.random().toString(16).slice(2)}`
}

export default function IroningWorkView({ kioskApi, focusedBag, onConsumeFocus }) {
  const [bags, setBags] = useState([])
  const [detail, setDetail] = useState(null)
  const [loading, setLoading] = useState(true)
  const [savingIds, setSavingIds] = useState(new Set())
  const [error, setError] = useState('')
  const [shelf, setShelf] = useState('')
  const [verifiedCount, setVerifiedCount] = useState(0)
  const [exceptionGarment, setExceptionGarment] = useState(null)
  const [exception, setException] = useState({ reason: '', note: '', photo: null })
  const [undo, setUndo] = useState(null)

  async function loadBags() {
    setLoading(true)
    setError('')
    try {
      const response = await kioskApi.get('/self-service/laundry-kiosk/bags?status=ironing')
      setBags(response.data)
    } catch (requestError) {
      setError(requestError.response?.data?.error || 'Ütü kuyruğu yüklenemedi')
    } finally {
      setLoading(false)
    }
  }

  async function selectBag(bag) {
    setError('')
    try {
      const response = await kioskApi.get(`/self-service/laundry-kiosk/bags/${bag.id}`)
      setDetail(response.data)
      setShelf(response.data.bag.shelf_location || '')
      setVerifiedCount(0)
    } catch (requestError) {
      setError(requestError.response?.data?.error || 'Torba ayrıntısı yüklenemedi')
    }
  }

  useEffect(() => {
    loadBags()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!focusedBag || bags.length === 0) return
    const match = bags.find(bag => bag.id === focusedBag.id)
    if (match) {
      selectBag(match)
      onConsumeFocus?.()
    }
  }, [focusedBag, bags]) // eslint-disable-line react-hooks/exhaustive-deps

  const garments = detail?.garments || []
  const progress = detail?.progress || {}
  const trackIndividually = garments.length > 0
  const actionableGarments = useMemo(
    () => garments.filter(garment => garment.requires_ironing === 1),
    [garments]
  )

  async function setIroned(garment, completed) {
    if (savingIds.has(garment.id)) return
    const previousDetail = detail
    const nextStatus = completed ? 'ready' : 'ironing'
    setSavingIds(current => new Set(current).add(garment.id))
    setDetail(current => ({
      ...current,
      garments: current.garments.map(item => item.id === garment.id
        ? { ...item, status: nextStatus }
        : item),
    }))
    setError('')
    try {
      const response = await kioskApi.put(
        `/self-service/laundry-kiosk/bags/${detail.bag.id}/garments/${garment.id}/ironing`,
        { completed, client_action_id: newActionId() }
      )
      setDetail(current => ({
        ...current,
        garments: current.garments.map(item => item.id === garment.id
          ? response.data.garment
          : item),
        progress: response.data.progress,
      }))
      globalThis.navigator?.vibrate?.(35)
      if (completed) {
        setUndo({ garment: response.data.garment, expiresAt: Date.now() + 6000 })
        globalThis.setTimeout(() => {
          setUndo(current => current?.garment.id === garment.id ? null : current)
        }, 6000)
      } else {
        setUndo(null)
      }
    } catch (requestError) {
      setDetail(previousDetail)
      setError(requestError.response?.data?.error || 'Tik kaydedilemedi; tekrar deneyin')
    } finally {
      setSavingIds(current => {
        const next = new Set(current)
        next.delete(garment.id)
        return next
      })
    }
  }

  async function submitException() {
    if (!exceptionGarment || !exception.reason) return
    if (exception.reason === 'damaged' && !exception.photo) {
      setError('Hasarlı kıyafet için fotoğraf zorunludur')
      return
    }
    const form = new FormData()
    form.append('reason', exception.reason)
    if (exception.note.trim()) form.append('note', exception.note.trim())
    if (exception.photo) form.append('photo', exception.photo)
    setError('')
    try {
      const response = await kioskApi.post(
        `/self-service/laundry-kiosk/bags/${detail.bag.id}/garments/${exceptionGarment.id}/exception`,
        form
      )
      setDetail(current => ({
        ...current,
        garments: current.garments.map(item => item.id === exceptionGarment.id
          ? response.data.garment
          : item),
        progress: response.data.progress,
      }))
      setExceptionGarment(null)
      setException({ reason: '', note: '', photo: null })
    } catch (requestError) {
      setError(requestError.response?.data?.error || 'İstisna kaydedilemedi')
    }
  }

  async function completeBag() {
    if (!detail) return
    if (!shelf.trim()) {
      const proceed = await confirmDialog({
        title: 'Raf konumu boş',
        body: 'Raf konumu girilmedi. Teslim sırasında torbayı bulmak zorlaşabilir. Yine de tamamla?',
      })
      if (!proceed) return
    }
    setError('')
    try {
      await kioskApi.post(`/self-service/laundry-kiosk/bags/${detail.bag.id}/ironing-complete`, {
        shelf_location: shelf.trim() || undefined,
        verified_count: trackIndividually ? undefined : verifiedCount,
      })
      setBags(current => current.filter(bag => bag.id !== detail.bag.id))
      setDetail(null)
      setShelf('')
      setUndo(null)
    } catch (requestError) {
      setError(requestError.response?.data?.error || 'Ütü tamamlanamadı')
    }
  }

  if (!detail) {
    return (
      <section style={panel}>
        <header style={headerRow}>
          <div>
            <div style={eyebrow}>TEKİL ÜTÜ KUYRUĞU</div>
            <h2 style={title}>Her kıyafeti tek tek onayla</h2>
          </div>
          <button type="button" onClick={loadBags} style={smallButton}>
            {loading ? '…' : '↻'}
          </button>
        </header>
        {error && <ErrorBox message={error} />}
        {!loading && bags.length === 0 && <div style={empty}>✓ Ütü bekleyen torba yok</div>}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
          {bags.map(bag => (
            <button type="button" key={bag.id} onClick={() => selectBag(bag)} style={bagButton}>
              <div style={{ flex: 1 }}>
                <div style={{ color: '#a78bfa', fontSize: 12, fontFamily: 'monospace', fontWeight: 800 }}>
                  {bag.bag_no || `#${bag.id}`}
                </div>
                <div style={{ color: '#f1f5f9', fontSize: 16, fontWeight: 900, marginTop: 2 }}>
                  {bag.block}-{bag.room_no}
                </div>
                <div style={{ color: '#64748b', fontSize: 12, marginTop: 3 }}>
                  {bag.garment_total || bag.item_count} parça · {bag.garment_ready || 0} hazır
                </div>
              </div>
              <span style={{ color: '#c4b5fd', fontWeight: 900 }}>Aç →</span>
            </button>
          ))}
        </div>
      </section>
    )
  }

  const completedCount = actionableGarments.filter(garment =>
    ['ready', 'lost', 'damaged'].includes(garment.status)
  ).length
  const canComplete = trackIndividually
    ? Number(progress.pending_ironing || 0) === 0
    : verifiedCount === detail.bag.item_count

  return (
    <section style={panel}>
      <header style={headerRow}>
        <button type="button" onClick={() => setDetail(null)} style={smallButton}>← Geri</button>
        <div style={{ textAlign: 'right' }}>
          <div style={{ color: '#a78bfa', fontFamily: 'monospace', fontWeight: 900 }}>
            {detail.bag.bag_no}
          </div>
          <div style={{ color: '#94a3b8', fontSize: 12 }}>
            {detail.bag.block}-{detail.bag.room_no}
          </div>
        </div>
      </header>

      {error && <ErrorBox message={error} />}

      {trackIndividually ? (
        <>
          <div style={{ background: '#111827', borderRadius: 13, padding: 13 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', color: '#cbd5e1', fontSize: 13, fontWeight: 800 }}>
              <span>Ütü ilerlemesi</span>
              <span>{completedCount}/{actionableGarments.length}</span>
            </div>
            <div style={{ height: 9, borderRadius: 9, background: '#1e293b', marginTop: 9, overflow: 'hidden' }}>
              <div style={{
                width: `${actionableGarments.length ? (completedCount / actionableGarments.length) * 100 : 100}%`,
                height: '100%',
                background: 'linear-gradient(90deg, #7c3aed, #22c55e)',
                transition: 'width .2s ease',
              }} />
            </div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {garments.map(garment => {
              const completed = ['ready', 'lost', 'damaged'].includes(garment.status)
              const busy = savingIds.has(garment.id)
              const disabled = garment.requires_ironing !== 1 || ['lost', 'damaged'].includes(garment.status)
              return (
                <div key={garment.id} style={{
                  minHeight: 68,
                  padding: 10,
                  borderRadius: 13,
                  background: completed ? 'rgba(22,101,52,.18)' : '#1e293b',
                  border: `1px solid ${completed ? '#166534' : '#334155'}`,
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10,
                }}>
                  <button type="button"
                    disabled={busy || disabled}
                    onClick={() => setIroned(garment, garment.status !== 'ready')}
                    aria-label={`${garment.garment_code} ütü onayı`}
                    style={{
                      width: 48,
                      height: 48,
                      flexShrink: 0,
                      borderRadius: 12,
                      border: `2px solid ${completed ? '#22c55e' : '#64748b'}`,
                      background: completed ? '#15803d' : '#0f172a',
                      color: '#fff',
                      fontSize: 22,
                      cursor: disabled ? 'default' : 'pointer',
                    }}>
                    {busy ? '…' : completed ? '✓' : ''}
                  </button>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ color: '#f1f5f9', fontSize: 14, fontWeight: 900 }}>
                      {garment.emoji || '👕'} {garment.garment_type}
                    </div>
                    <div style={{ color: '#94a3b8', fontFamily: 'monospace', fontSize: 12, marginTop: 3 }}>
                      {garment.garment_code}
                      {garment.status === 'lost' ? ' · EKSİK' : ''}
                      {garment.status === 'damaged' ? ' · HASARLI' : ''}
                      {garment.requires_ironing !== 1 ? ' · ÜTÜ YOK' : ''}
                    </div>
                  </div>
                  {garment.status === 'ironing' && (
                    <button type="button" onClick={() => {
                      setExceptionGarment(garment)
                      setException({ reason: '', note: '', photo: null })
                    }} style={exceptionButton}>
                      İstisna
                    </button>
                  )}
                </div>
              )
            })}
          </div>
        </>
      ) : (
        <div style={countCard}>
          <div style={{ color: '#cbd5e1', fontWeight: 900 }}>Listesiz torba adet doğrulaması</div>
          <div style={{ color: '#64748b', fontSize: 12 }}>
            Torbadaki toplam {detail.bag.item_count} parçayı sayın.
          </div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 16 }}>
            <CountButton label="−" onClick={() => setVerifiedCount(value => Math.max(0, value - 1))} />
            <strong style={{ color: '#fff', fontSize: 32 }}>{verifiedCount}</strong>
            <CountButton label="+" onClick={() => setVerifiedCount(value => Math.min(detail.bag.item_count, value + 1))} />
          </div>
        </div>
      )}

      <div>
        <div style={eyebrow}>RAF KONUMU</div>
        <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap', margin: '8px 0' }}>
          {SHELVES.map(value => (
            <button type="button" key={value} onClick={() => setShelf(value)}
              style={{
                minHeight: 48,
                borderRadius: 10,
                border: `1px solid ${shelf === value ? '#22c55e' : '#334155'}`,
                background: shelf === value ? '#14532d' : '#1e293b',
                color: shelf === value ? '#dcfce7' : '#94a3b8',
                fontWeight: 800,
                padding: '0 13px',
              }}>
              {value}
            </button>
          ))}
        </div>
        <input value={shelf} onChange={event => setShelf(event.target.value)}
          placeholder="Başka raf konumu…" style={textInput} />
      </div>

      <button type="button" onClick={completeBag} disabled={!canComplete}
        style={{
          minHeight: 54,
          border: 0,
          borderRadius: 13,
          background: canComplete ? '#15803d' : '#1e293b',
          color: canComplete ? '#fff' : '#475569',
          fontWeight: 900,
          fontSize: 15,
        }}>
        ✓ Torbayı Hazıra Al
      </button>

      {undo && undo.expiresAt > Date.now() && (
        <div style={undoBar}>
          <span>{undo.garment.garment_code} ütülendi</span>
          <button type="button" onClick={() => setIroned(undo.garment, false)}
            style={{ ...smallButton, color: '#fde68a' }}>
            Geri Al
          </button>
        </div>
      )}

      {exceptionGarment && (
        <div style={modalBackdrop}>
          <div style={modalCard}>
            <div style={headerRow}>
              <div>
                <div style={eyebrow}>KIYAFET İSTİSNASI</div>
                <div style={{ color: '#fff', fontWeight: 900 }}>
                  {exceptionGarment.garment_code} · {exceptionGarment.garment_type}
                </div>
              </div>
              <button type="button" onClick={() => setExceptionGarment(null)} style={smallButton}>✕</button>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 8 }}>
              {REASONS.map(([key, label, icon]) => (
                <button type="button" key={key}
                  onClick={() => setException(current => ({ ...current, reason: key }))}
                  style={{
                    minHeight: 50,
                    borderRadius: 11,
                    border: `1px solid ${exception.reason === key ? '#f59e0b' : '#334155'}`,
                    background: exception.reason === key ? '#78350f' : '#1e293b',
                    color: '#f8fafc',
                    fontWeight: 800,
                  }}>
                  {icon} {label}
                </button>
              ))}
            </div>
            <textarea value={exception.note}
              onChange={event => setException(current => ({ ...current, note: event.target.value }))}
              placeholder="Kısa açıklama (opsiyonel)" rows={3}
              style={{ ...textInput, resize: 'vertical', fontFamily: 'inherit' }} />
            <label style={fileLabel}>
              📷 {exception.photo ? exception.photo.name : 'Fotoğraf ekle'}
              <input type="file" accept="image/*" capture="environment"
                onChange={event => setException(current => ({
                  ...current,
                  photo: event.target.files?.[0] || null,
                }))}
                style={{ display: 'none' }} />
            </label>
            <button type="button" onClick={submitException} disabled={!exception.reason}
              style={{
                minHeight: 52,
                border: 0,
                borderRadius: 12,
                background: exception.reason ? '#b45309' : '#1e293b',
                color: exception.reason ? '#fff' : '#475569',
                fontWeight: 900,
              }}>
              İstisnayı Kaydet
            </button>
          </div>
        </div>
      )}
    </section>
  )
}

function ErrorBox({ message }) {
  return <div style={{ borderRadius: 11, padding: 11, background: '#2b1117', color: '#fecaca', fontSize: 13 }}>{message}</div>
}

function CountButton({ label, onClick }) {
  return <button type="button" onClick={onClick} style={{ ...smallButton, width: 52, height: 52, fontSize: 24 }}>{label}</button>
}

const panel = { background: '#0f172a', border: '1px solid #1e293b', borderRadius: 17, padding: 16, display: 'flex', flexDirection: 'column', gap: 14 }
const headerRow = { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }
const eyebrow = { color: '#64748b', fontSize: 10, letterSpacing: 1.2, fontWeight: 900 }
const title = { color: '#f1f5f9', fontSize: 19, margin: '3px 0 0' }
const smallButton = { minHeight: 48, minWidth: 48, borderRadius: 10, border: '1px solid #334155', background: '#1e293b', color: '#cbd5e1', fontWeight: 900, cursor: 'pointer' }
const bagButton = { minHeight: 76, width: '100%', border: '1px solid #334155', borderLeft: '4px solid #8b5cf6', borderRadius: 13, background: '#1e293b', padding: 12, display: 'flex', alignItems: 'center', textAlign: 'left', cursor: 'pointer' }
const empty = { padding: 24, borderRadius: 13, border: '1px dashed #334155', color: '#64748b', textAlign: 'center' }
const exceptionButton = { minHeight: 48, border: '1px solid #92400e', borderRadius: 10, background: '#451a03', color: '#fcd34d', fontWeight: 800, padding: '0 10px' }
const textInput = { width: '100%', boxSizing: 'border-box', minHeight: 48, borderRadius: 11, border: '1px solid #334155', background: '#1e293b', color: '#f8fafc', padding: '10px 12px', outline: 'none' }
const countCard = { borderRadius: 14, padding: 18, background: '#111827', border: '1px solid #334155', display: 'flex', flexDirection: 'column', gap: 14, textAlign: 'center' }
const undoBar = { position: 'sticky', bottom: 74, zIndex: 10, display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderRadius: 12, background: '#422006', color: '#fef3c7', padding: '8px 10px', boxShadow: '0 8px 30px rgba(0,0,0,.35)' }
const modalBackdrop = { position: 'fixed', inset: 0, zIndex: 50, background: 'rgba(2,6,23,.82)', display: 'flex', alignItems: 'flex-end', justifyContent: 'center', padding: 12 }
const modalCard = { width: '100%', maxWidth: 520, maxHeight: '90vh', overflowY: 'auto', borderRadius: 18, background: '#0f172a', border: '1px solid #334155', padding: 16, display: 'flex', flexDirection: 'column', gap: 13 }
const fileLabel = { minHeight: 50, borderRadius: 11, border: '1px dashed #64748b', background: '#1e293b', color: '#cbd5e1', fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', padding: '0 12px' }
