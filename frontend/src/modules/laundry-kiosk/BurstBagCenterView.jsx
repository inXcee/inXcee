import { useEffect, useMemo, useState } from 'react'
import { BLOCKS, blockDisplayName } from '../../shared/blocks.js'
import { confirmDialog } from '../../shared/components/ConfirmDialog.jsx'
import { downscalePhotoFile } from '../../shared/photo.js'
import { useToastStore } from '../../shared/store/toastStore.js'

const STAGES = [
  ['unknown', 'Bilinmiyor'], ['intake', 'Girişte'], ['washing', 'Yıkamada'],
  ['transfer', 'Taşıma sırasında'], ['drying', 'Kurutmada'], ['ironing', 'Ütüde'], ['delivery', 'Teslimde'],
]
const STAGE_LABELS = Object.fromEntries(STAGES)
const EMPTY_INCIDENT = {
  block: '', room_no: '', file_no: '', person_name: '', garments: [],
  burst_stage: 'washing', found_location: 'Ayırma masası', notes: '',
}
const EMPTY_PIECE = { garment_type: '', brand: '', size: '', color: '', pattern: '', distinguishing_note: '', photo: null }
const EMPTY_CLAIM = { claimed_by_name: '', block: '', room_no: '', claim_note: '' }

function formatDateTime(value) {
  if (!value) return '—'
  const normalized = value.includes('T') ? value : value.replace(' ', 'T')
  const date = new Date(`${normalized}${/[zZ]|[+-]\d\d:\d\d$/.test(normalized) ? '' : 'Z'}`)
  return Number.isNaN(date.getTime()) ? '—' : date.toLocaleString('tr-TR', {
    day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
  })
}

function pieceDescription(piece) {
  return [piece.garment_type, piece.color, piece.brand, piece.size ? `${piece.size} beden` : null]
    .filter(Boolean).join(' · ')
}

export default function BurstBagCenterView({ kioskApi }) {
  const [data, setData] = useState({ summary: {}, incidents: [] })
  const [loading, setLoading] = useState(true)
  const [scope, setScope] = useState('open')
  const [query, setQuery] = useState('')
  const [expandedId, setExpandedId] = useState(null)
  const [createOpen, setCreateOpen] = useState(false)
  const [incidentForm, setIncidentForm] = useState(EMPTY_INCIDENT)
  const [garmentTypes, setGarmentTypes] = useState([])
  const [createResidents, setCreateResidents] = useState([])
  const [editingPiece, setEditingPiece] = useState(null)
  const [pieceForm, setPieceForm] = useState(EMPTY_PIECE)
  const [claimingPiece, setClaimingPiece] = useState(null)
  const [claimForm, setClaimForm] = useState(EMPTY_CLAIM)
  const [claimResidents, setClaimResidents] = useState([])
  const [closeNotes, setCloseNotes] = useState({})
  const [busy, setBusy] = useState(false)

  async function load(showLoader = true) {
    if (showLoader) setLoading(true)
    try {
      const response = await kioskApi.get('/self-service/laundry-kiosk/burst-bags?scope=all')
      setData(response.data)
    } catch (error) {
      useToastStore.getState().addToast(error.response?.data?.error || 'Ayırma alanı yüklenemedi', 'error')
    } finally {
      if (showLoader) setLoading(false)
    }
  }

  useEffect(() => {
    load()
    kioskApi.get('/self-service/laundry-kiosk/garment-types')
      .then(response => setGarmentTypes(response.data || []))
      .catch(() => useToastStore.getState().addToast('Kıyafet türleri alınamadı', 'error'))
    const timer = window.setInterval(() => load(false), 30_000)
    return () => window.clearInterval(timer)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const visible = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase('tr-TR')
    return (data.incidents || []).filter(incident => {
      if (scope === 'open' && incident.status === 'resolved') return false
      if (scope === 'resolved' && incident.status !== 'resolved') return false
      if (!needle) return true
      return [incident.source_file_no, incident.source_person_name, incident.source_block, incident.source_room_no,
        incident.found_location, incident.notes, incident.reported_by,
        ...(incident.pieces || []).flatMap(piece => [piece.temporary_code, piece.garment_type, piece.brand, piece.size, piece.color, piece.distinguishing_note, piece.claimed_by_name])]
        .filter(Boolean).join(' ').toLocaleLowerCase('tr-TR').includes(needle)
    })
  }, [data.incidents, query, scope])

  async function createIncident(event) {
    event.preventDefault()
    setBusy(true)
    try {
      const response = await kioskApi.post('/self-service/laundry-kiosk/burst-bags', {
        ...incidentForm,
        garments: incidentForm.garments.map(garment => ({
          type_id: garment.type_id, type_name: garment.type_name, count: garment.count,
        })),
      })
      useToastStore.getState().addToast('Oda filesi ve içinden çıkan kıyafetler kaydedildi', 'success')
      setIncidentForm(EMPTY_INCIDENT)
      setCreateResidents([])
      setCreateOpen(false)
      setExpandedId(response.data.id)
      await load(false)
    } catch (error) {
      useToastStore.getState().addToast(error.response?.data?.error || 'Patlayan file kaydedilemedi', 'error')
    } finally { setBusy(false) }
  }

  function toggleGarment(type) {
    setIncidentForm(form => {
      const selected = form.garments.some(garment => garment.type_id === type.id)
      return {
        ...form,
        garments: selected
          ? form.garments.filter(garment => garment.type_id !== type.id)
          : [...form.garments, { type_id: type.id, type_name: type.name, emoji: type.emoji || '👕', count: 1 }],
      }
    })
  }

  function changeGarmentCount(typeId, delta) {
    setIncidentForm(form => ({
      ...form,
      garments: form.garments.map(garment => garment.type_id === typeId
        ? { ...garment, count: Math.max(1, Math.min(20, garment.count + delta)) }
        : garment),
    }))
  }

  async function loadCreateResidents() {
    if (!incidentForm.block || !incidentForm.room_no.trim()) {
      useToastStore.getState().addToast('Önce blok ve oda numarasını girin', 'warning')
      return
    }
    try {
      const response = await kioskApi.get(`/self-service/laundry-kiosk/room-persons?block=${encodeURIComponent(incidentForm.block)}&room_no=${encodeURIComponent(incidentForm.room_no.trim())}`)
      setCreateResidents(response.data || [])
      if (!response.data?.length) useToastStore.getState().addToast('Bu odada aktif sakin bulunamadı; adı elle yazabilirsiniz', 'warning')
    } catch (error) {
      useToastStore.getState().addToast(error.response?.data?.error || 'Oda sakinleri alınamadı', 'error')
    }
  }

  function openPieceEditor(incident, piece = null) {
    setEditingPiece({ incidentId: incident.id, pieceId: piece?.id || null })
    setPieceForm(piece ? {
      garment_type: piece.garment_type === 'Bilinmeyen parça' ? '' : piece.garment_type,
      brand: piece.brand || '', size: piece.size || '', color: piece.color || '', pattern: piece.pattern || '',
      distinguishing_note: piece.distinguishing_note || '', photo: null,
    } : EMPTY_PIECE)
    setClaimingPiece(null)
  }

  async function savePiece(event) {
    event.preventDefault()
    setBusy(true)
    try {
      const form = new FormData()
      Object.entries(pieceForm).forEach(([key, value]) => {
        if (key !== 'photo' && value) form.append(key, value)
      })
      if (pieceForm.photo) form.append('photo', await downscalePhotoFile(pieceForm.photo), 'ayrilan-parca.jpg')
      const base = `/self-service/laundry-kiosk/burst-bags/${editingPiece.incidentId}/pieces`
      if (editingPiece.pieceId) await kioskApi.put(`${base}/${editingPiece.pieceId}`, form)
      else await kioskApi.post(base, form)
      useToastStore.getState().addToast(editingPiece.pieceId ? 'Kıyafet bilgileri güncellendi' : 'Yeni ayrılan kıyafet eklendi', 'success')
      setEditingPiece(null)
      setPieceForm(EMPTY_PIECE)
      await load(false)
    } catch (error) {
      useToastStore.getState().addToast(error.response?.data?.error || 'Kıyafet bilgileri kaydedilemedi', 'error')
    } finally { setBusy(false) }
  }

  async function changeStatus(incident, status) {
    setBusy(true)
    try {
      await kioskApi.put(`/self-service/laundry-kiosk/burst-bags/${incident.id}/status`, { status })
      useToastStore.getState().addToast(status === 'ready_for_selection' ? 'Kıyafetler sahip seçimine açıldı' : 'Olay ayırma aşamasına alındı', 'success')
      await load(false)
    } catch (error) {
      useToastStore.getState().addToast(error.response?.data?.error || 'Durum güncellenemedi', 'error')
    } finally { setBusy(false) }
  }

  async function closeIncident(incident) {
    const note = String(closeNotes[incident.id] || '').trim()
    const approved = await confirmDialog({
      title: 'Ayırma olayını kapat',
      body: `${incident.piece_waiting || 0} bekleyen kıyafet sahibi bulunamadı olarak arşivlenecek. Devam edilsin mi?`,
      danger: Number(incident.piece_waiting) > 0,
    })
    if (!approved) return
    setBusy(true)
    try {
      await kioskApi.put(`/self-service/laundry-kiosk/burst-bags/${incident.id}/status`, { status: 'resolved', resolution_note: note })
      useToastStore.getState().addToast('Ayırma olayı geçmişe alındı', 'success')
      await load(false)
    } catch (error) {
      useToastStore.getState().addToast(error.response?.data?.error || 'Olay kapatılamadı', 'error')
    } finally { setBusy(false) }
  }

  function openClaim(incident, piece) {
    setClaimingPiece({ incidentId: incident.id, pieceId: piece.id })
    setClaimForm({
      ...EMPTY_CLAIM,
      claimed_by_name: incident.source_person_name || '',
      block: incident.source_block || '',
      room_no: incident.source_room_no || '',
    })
    setClaimResidents([])
    setEditingPiece(null)
  }

  async function loadClaimResidents() {
    if (!claimForm.block || !claimForm.room_no.trim()) {
      useToastStore.getState().addToast('Önce blok ve oda numarasını girin', 'warning')
      return
    }
    try {
      const response = await kioskApi.get(`/self-service/laundry-kiosk/room-persons?block=${encodeURIComponent(claimForm.block)}&room_no=${encodeURIComponent(claimForm.room_no.trim())}`)
      setClaimResidents(response.data || [])
      if (!response.data?.length) useToastStore.getState().addToast('Bu odada aktif sakin bulunamadı; adı elle yazabilirsiniz', 'warning')
    } catch (error) {
      useToastStore.getState().addToast(error.response?.data?.error || 'Oda sakinleri alınamadı', 'error')
    }
  }

  async function submitClaim(event) {
    event.preventDefault()
    setBusy(true)
    try {
      await kioskApi.post(
        `/self-service/laundry-kiosk/burst-bags/${claimingPiece.incidentId}/pieces/${claimingPiece.pieceId}/claim`,
        claimForm,
      )
      useToastStore.getState().addToast('Kıyafet sahibine teslim edildi ve kayıt altına alındı', 'success')
      setClaimingPiece(null)
      setClaimForm(EMPTY_CLAIM)
      await load(false)
    } catch (error) {
      useToastStore.getState().addToast(error.response?.data?.error || 'Sahip teslimi kaydedilemedi', 'error')
    } finally { setBusy(false) }
  }

  const summary = data.summary || {}
  return (
    <section className="burst-center">
      <header className="burst-center-header">
        <div><span className="kiosk-eyebrow">ODA FİLESİ · KIYAFET KONTROLÜ</span><h1>Ayırma Merkezi</h1><p>Patlayan fileyi oda, file numarası ve kişiyle kaydedin; içinden çıkan kıyafetleri işaretleyerek ayırt edin.</p></div>
        <button type="button" className="burst-create-button" onClick={() => setCreateOpen(value => !value)}>{createOpen ? '✕ Vazgeç' : '＋ Patlayan file kaydı'}</button>
      </header>

      <div className="burst-summary-grid">
        <div className="is-alert"><span>Açık file olayı</span><strong>{summary.open_incidents || 0}</strong><small>Ayırma veya seçim sürüyor</small></div>
        <div><span>Ayırılıyor</span><strong>{summary.sorting || 0}</strong><small>File içeriği kontrol ediliyor</small></div>
        <div className="is-ready"><span>Seçime hazır</span><strong>{summary.ready_for_selection || 0}</strong><small>Sakinler kıyafetlerini seçebilir</small></div>
        <div><span>Sahibini bekleyen</span><strong>{summary.waiting_pieces || 0}</strong><small>Henüz teslim edilmedi</small></div>
        <div className="is-returned"><span>Sahibine verilen</span><strong>{summary.returned_pieces || 0}</strong><small>Kime verildiği kayıtlı</small></div>
      </div>

      {createOpen && (
        <form className="burst-create-form" onSubmit={createIncident}>
          <div className="burst-form-title"><span>01</span><div><strong>Oda filesini tanımla</strong><small>Torba numarası gerekmez; oda, file numarası ve file sahibi yeterlidir.</small></div></div>
          <label><span>Blok</span><select aria-label="File bloğu" value={incidentForm.block} onChange={event => { setIncidentForm(form => ({ ...form, block: event.target.value, person_name: '' })); setCreateResidents([]) }} required><option value="">Blok seçin</option>{BLOCKS.map(block => <option key={block.block} value={block.block}>{blockDisplayName(block.block)}</option>)}</select></label>
          <label><span>Oda numarası</span><input value={incidentForm.room_no} onChange={event => { setIncidentForm(form => ({ ...form, room_no: event.target.value, person_name: '' })); setCreateResidents([]) }} placeholder="Örn. 80" required /></label>
          <label><span>Oda file numarası</span><input value={incidentForm.file_no} onChange={event => setIncidentForm(form => ({ ...form, file_no: event.target.value }))} placeholder="Örn. 2" required /></label>
          <label><span>File sahibi / kişi adı</span><input value={incidentForm.person_name} onChange={event => setIncidentForm(form => ({ ...form, person_name: event.target.value }))} placeholder="Ad soyad" required /></label>
          <div className="burst-create-residents is-wide">
            <button type="button" onClick={loadCreateResidents}>Oda sakinlerini getir</button>
            {createResidents.map(person => <button key={person.id} type="button" className={incidentForm.person_name === person.full_name ? 'is-selected' : ''} onClick={() => setIncidentForm(form => ({ ...form, person_name: person.full_name }))}>{person.full_name}<small>{person.company || 'Firma yok'}</small></button>)}
          </div>
          <label><span>Patladığı aşama</span><select value={incidentForm.burst_stage} onChange={event => setIncidentForm(form => ({ ...form, burst_stage: event.target.value }))}>{STAGES.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
          <label><span>Ayırma konumu</span><input value={incidentForm.found_location} onChange={event => setIncidentForm(form => ({ ...form, found_location: event.target.value }))} placeholder="Ayırma masası / sepet no" required /></label>
          <div className="burst-garment-picker is-wide">
            <div className="burst-garment-picker-title"><span>02</span><div><strong>Fileden çıkan kıyafetleri işaretle</strong><small>Ütü kontrolündeki gibi gördüğünüz türlere dokunun; aynı türden fazlaysa adedi artırın.</small></div><em>{incidentForm.garments.reduce((total, garment) => total + garment.count, 0)} kıyafet</em></div>
            <div className="burst-garment-options">
              {garmentTypes.map(type => {
                const selected = incidentForm.garments.find(garment => garment.type_id === type.id)
                return <div key={type.id} className={`burst-garment-option${selected ? ' is-selected' : ''}`}>
                  <label><input type="checkbox" checked={Boolean(selected)} onChange={() => toggleGarment(type)} /><span className="burst-garment-check">{selected ? '✓' : ''}</span><span className="burst-garment-icon">{type.emoji || '👕'}</span><strong>{type.name}</strong></label>
                  {selected && <div className="burst-garment-count"><button type="button" aria-label={`${type.name} azalt`} onClick={() => changeGarmentCount(type.id, -1)}>−</button><span>{selected.count} adet</span><button type="button" aria-label={`${type.name} artır`} onClick={() => changeGarmentCount(type.id, 1)}>＋</button></div>}
                </div>
              })}
            </div>
            {incidentForm.garments.length === 0 && <small className="burst-garment-required">Kaydetmek için en az bir kıyafet türü işaretleyin.</small>}
          </div>
          <label className="is-wide"><span>Olay notu</span><textarea value={incidentForm.notes} onChange={event => setIncidentForm(form => ({ ...form, notes: event.target.value }))} placeholder="File nerede patladı, kıyafetler nasıl karıştı?" /></label>
          <button type="submit" disabled={busy || incidentForm.garments.length === 0}>{busy ? 'Kaydediliyor…' : 'Oda filesini kaydet →'}</button>
        </form>
      )}

      <div className="burst-toolbar">
        <label><span>⌕</span><input value={query} onChange={event => setQuery(event.target.value)} placeholder="Oda, file no, kişi veya kıyafet ara…" /></label>
        <div role="group" aria-label="File olay durumu">{[['open', 'Açık'], ['resolved', 'Tamamlanan'], ['all', 'Tümü']].map(([value, label]) => <button key={value} type="button" className={scope === value ? 'is-active' : ''} onClick={() => setScope(value)}>{label}</button>)}</div>
        <button type="button" className="records-refresh" onClick={() => load(false)}>↻ Yenile</button>
      </div>

      {!loading && visible.length === 0 && <div className="burst-empty"><span>✓</span><strong>Bu filtrede patlayan file kaydı yok.</strong><small>Yeni olay olduğunda “Patlayan file kaydı” düğmesini kullanın.</small></div>}
      <div className="burst-incident-list">
        {visible.map(incident => {
          const expanded = expandedId === incident.id
          return (
            <article key={incident.id} className={`is-${incident.status}`}>
              <button type="button" className="burst-incident-head" onClick={() => setExpandedId(expanded ? null : incident.id)} aria-expanded={expanded}>
                <span className="burst-incident-mark">≋</span>
                <span className="burst-incident-id"><code>ODA FİLESİ · {incident.source_file_no || `ESKİ-${String(incident.id).padStart(3, '0')}`}</code><strong>{incident.source_person_name || 'Kişi adı eski kayıtta yok'}</strong><small>{incident.source_block ? `${blockDisplayName(incident.source_block)}-${incident.source_room_no}` : 'Oda eski kayıtta yok'} · File {incident.source_file_no || '—'} · {incident.found_location}</small></span>
                <span><small>Patlama aşaması</small><strong>{STAGE_LABELS[incident.burst_stage] || 'Bilinmiyor'}</strong><em>{formatDateTime(incident.created_at)}</em></span>
                <span className="burst-piece-count"><strong>{incident.piece_total || 0}</strong><small>fileden çıktı</small><em>{incident.piece_returned || 0} teslim</em></span>
                <span className={`burst-status is-${incident.status}`}>{incident.status === 'sorting' ? 'AYIRILIYOR' : incident.status === 'ready_for_selection' ? 'SEÇİME AÇIK' : 'TAMAMLANDI'}</span>
                <span>{expanded ? '⌃' : '⌄'}</span>
              </button>

              {expanded && (
                <div className="burst-incident-body">
                  <div className="burst-event-facts"><div><span>Oda · file</span><strong>{incident.source_block ? `${blockDisplayName(incident.source_block)}-${incident.source_room_no}` : '—'} · File {incident.source_file_no || '—'}</strong></div><div><span>File sahibi</span><strong>{incident.source_person_name || 'Eski kayıtta belirtilmedi'}</strong></div><div><span>Fileden çıkanlar</span><strong>{(incident.pieces || []).map(piece => piece.garment_type).join(', ') || 'Kıyafet yok'}</strong></div><div><span>Bildiren</span><strong>{incident.reported_by}</strong></div><div><span>Olay notu</span><strong>{incident.notes || 'Not girilmedi'}</strong></div>{incident.resolved_at && <div><span>Kapanış</span><strong>{formatDateTime(incident.resolved_at)} · {incident.resolved_by}</strong></div>}</div>
                  {incident.status !== 'resolved' && (
                    <div className="burst-incident-actions">
                      {incident.status === 'sorting' ? <button type="button" className="is-ready" onClick={() => changeStatus(incident, 'ready_for_selection')} disabled={busy}>✓ Seçime hazırla</button> : <button type="button" onClick={() => changeStatus(incident, 'sorting')} disabled={busy}>← Ayırmaya geri al</button>}
                      <button type="button" onClick={() => openPieceEditor(incident)}>＋ Kıyafet ekle</button>
                      <input value={closeNotes[incident.id] || ''} onChange={event => setCloseNotes(notes => ({ ...notes, [incident.id]: event.target.value }))} placeholder="Kapanış notu (bekleyen kıyafet varsa zorunlu)" />
                      <button type="button" className="is-close" onClick={() => closeIncident(incident)} disabled={busy}>Olayı kapat</button>
                    </div>
                  )}

                  <div className="burst-pieces-grid">
                    {(incident.pieces || []).map(piece => (
                      <div key={piece.id} className={`burst-piece-card is-${piece.status}`}>
                        <div className="burst-piece-check" aria-label={piece.status === 'returned' ? 'Teslim edildi' : piece.status === 'unresolved' ? 'Sahibi bulunamadı' : 'Kontrol bekliyor'}>{piece.status === 'returned' ? '✓' : piece.status === 'unresolved' ? '!' : ''}</div>
                        <div className="burst-piece-photo">{piece.photo_url ? <img src={piece.photo_url} alt={`${piece.temporary_code} kıyafet`} /> : <span>👕</span>}</div>
                        <div className="burst-piece-title"><code>{piece.temporary_code}</code><strong>{pieceDescription(piece)}</strong><small>{piece.distinguishing_note || 'Ayırt edici not girilmedi'}</small></div>
                        {piece.status === 'waiting' && incident.status !== 'resolved' && <div className="burst-piece-buttons"><button type="button" onClick={() => openPieceEditor(incident, piece)}>Ayırt et</button><button type="button" className="is-claim" onClick={() => openClaim(incident, piece)} disabled={incident.status !== 'ready_for_selection'} title={incident.status !== 'ready_for_selection' ? 'Önce olayı seçime açın' : undefined}>✓ Teslim et</button></div>}
                        {piece.status === 'returned' && <div className="burst-claimed"><span>✓ SAHİBİNE VERİLDİ</span><strong>{piece.claimed_by_name}</strong><small>{blockDisplayName(piece.claimed_block)}-{piece.claimed_room_no} · {formatDateTime(piece.claimed_at)}</small>{piece.claim_note && <em>{piece.claim_note}</em>}</div>}
                        {piece.status === 'unresolved' && <div className="burst-unresolved">Sahibi bulunamadı · geçmişe alındı</div>}
                      </div>
                    ))}
                  </div>

                  {editingPiece?.incidentId === incident.id && (
                    <form className="burst-piece-form" onSubmit={savePiece}>
                      <div><strong>{editingPiece.pieceId ? 'Kıyafeti ayırt et' : 'Fileden çıkan başka kıyafet'}</strong><small>Renk, beden ve ayırt edici bilgiyi mümkün olduğunca doldurun.</small></div>
                      <input value={pieceForm.garment_type} onChange={event => setPieceForm(form => ({ ...form, garment_type: event.target.value }))} placeholder="Kıyafet türü (Gömlek, pantolon…)" required />
                      <input value={pieceForm.color} onChange={event => setPieceForm(form => ({ ...form, color: event.target.value }))} placeholder="Renk" />
                      <input value={pieceForm.size} onChange={event => setPieceForm(form => ({ ...form, size: event.target.value }))} placeholder="Beden" />
                      <input value={pieceForm.brand} onChange={event => setPieceForm(form => ({ ...form, brand: event.target.value }))} placeholder="Marka" />
                      <input value={pieceForm.pattern} onChange={event => setPieceForm(form => ({ ...form, pattern: event.target.value }))} placeholder="Desen" />
                      <input value={pieceForm.distinguishing_note} onChange={event => setPieceForm(form => ({ ...form, distinguishing_note: event.target.value }))} placeholder="Leke, yırtık, isim etiketi gibi ayırt edici not" />
                      <label className="burst-photo-pick">📷 Fotoğraf çek / seç<input type="file" accept="image/*" capture="environment" onChange={event => setPieceForm(form => ({ ...form, photo: event.target.files?.[0] || null }))} /></label>
                      <button type="submit" disabled={busy}>{busy ? 'Kaydediliyor…' : 'Kıyafeti kaydet'}</button><button type="button" onClick={() => setEditingPiece(null)}>Vazgeç</button>
                    </form>
                  )}

                  {claimingPiece?.incidentId === incident.id && (
                    <form className="burst-claim-form" onSubmit={submitClaim}>
                      <div><span>✓</span><strong>Kıyafet sahibini kaydet</strong><small>Yanlış teslimi önlemek için ad, blok ve oda zorunludur.</small></div>
                      <input value={claimForm.claimed_by_name} onChange={event => setClaimForm(form => ({ ...form, claimed_by_name: event.target.value }))} placeholder="Teslim alan ad soyad" required />
                      <select value={claimForm.block} onChange={event => setClaimForm(form => ({ ...form, block: event.target.value }))} required><option value="">Blok seçin</option>{BLOCKS.map(block => <option key={block.block} value={block.block}>{blockDisplayName(block.block)}</option>)}</select>
                      <input value={claimForm.room_no} onChange={event => setClaimForm(form => ({ ...form, room_no: event.target.value }))} placeholder="Oda no" required />
                      <button type="button" className="burst-resident-load" onClick={loadClaimResidents}>Oda sakinlerini getir</button>
                      {claimResidents.length > 0 && <div className="burst-resident-options">{claimResidents.map(person => <button key={person.id} type="button" onClick={() => setClaimForm(form => ({ ...form, claimed_by_name: person.full_name }))}>{person.full_name}<small>{person.company || 'Firma yok'}</small></button>)}</div>}
                      <input value={claimForm.claim_note} onChange={event => setClaimForm(form => ({ ...form, claim_note: event.target.value }))} placeholder="Nasıl doğrulandı? İsim etiketi, renk, marka…" />
                      <button type="submit" disabled={busy}>{busy ? 'Kaydediliyor…' : 'Sahibine teslim edildi'}</button><button type="button" onClick={() => setClaimingPiece(null)}>Vazgeç</button>
                    </form>
                  )}
                </div>
              )}
            </article>
          )
        })}
      </div>
    </section>
  )
}
