import { useEffect, useMemo, useRef, useState } from 'react'
import { blockNeedsSignature } from './constants.js'
import { PATTERNS } from './garmentPalette.js'
import { garmentTagSummary } from './garmentTag.js'

function recordNeedsSignature(record) {
  if (record?.signature_required != null) return record.signature_required === 1
  if (record?.is_premium != null) return record.is_premium !== 1
  return blockNeedsSignature(record?.block)
}

function SignaturePad({ signatureRef }) {
  const canvasRef = useRef(null)
  const drawing = useRef(false)
  const [hasInk, setHasInk] = useState(false)

  useEffect(() => {
    signatureRef.current = {
      isEmpty: () => !hasInk,
      toDataURL: () => canvasRef.current?.toDataURL(),
      clear: () => {
        const canvas = canvasRef.current
        canvas?.getContext('2d').clearRect(0, 0, canvas.width, canvas.height)
        setHasInk(false)
      },
    }
  })

  function point(event) {
    const canvas = canvasRef.current
    const rect = canvas.getBoundingClientRect()
    const source = event.touches?.[0] || event
    return {
      x: (source.clientX - rect.left) * (canvas.width / rect.width),
      y: (source.clientY - rect.top) * (canvas.height / rect.height),
    }
  }

  function start(event) {
    event.preventDefault()
    drawing.current = true
    const position = point(event)
    const context = canvasRef.current.getContext('2d')
    context.beginPath()
    context.moveTo(position.x, position.y)
  }

  function move(event) {
    if (!drawing.current) return
    event.preventDefault()
    const position = point(event)
    const context = canvasRef.current.getContext('2d')
    context.lineTo(position.x, position.y)
    context.strokeStyle = '#e2e8f0'
    context.lineWidth = 2
    context.lineCap = 'round'
    context.stroke()
    setHasInk(true)
  }

  return (
    <div>
      <canvas ref={canvasRef} width={560} height={150}
        onMouseDown={start} onMouseMove={move}
        onMouseUp={() => { drawing.current = false }}
        onMouseLeave={() => { drawing.current = false }}
        onTouchStart={start} onTouchMove={move}
        onTouchEnd={() => { drawing.current = false }}
        style={{
          display: 'block',
          width: '100%',
          minHeight: 120,
          borderRadius: 12,
          border: '1px solid #475569',
          background: '#1e293b',
          touchAction: 'none',
        }} />
      {hasInk && (
        <button type="button" onClick={() => signatureRef.current.clear()} style={linkButton}>
          İmzayı temizle
        </button>
      )}
    </div>
  )
}

export default function DeliverWorkView({ kioskApi, focusedBag, onConsumeFocus }) {
  const signatureRef = useRef(null)
  const [bags, setBags] = useState([])
  const [detail, setDetail] = useState(null)
  const [selectedIds, setSelectedIds] = useState(new Set())
  const [verifiedCount, setVerifiedCount] = useState(0)
  const [people, setPeople] = useState([])
  const [deliveredName, setDeliveredName] = useState('')
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [preview, setPreview] = useState(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [bagLoss, setBagLoss] = useState(null)
  const [missingGarment, setMissingGarment] = useState(null)
  const [lossForm, setLossForm] = useState({ lastSeen: 'Teslim kontrolünde', note: '' })
  // Oda bazlı toplu teslim — aynı odanın birden çok torbası tek isim + tek imzayla
  const [roomBulk, setRoomBulk] = useState(null) // { block, room_no, bags, people }

  const filteredBags = useMemo(() => {
    const query = searchQuery.trim().toLocaleLowerCase('tr-TR')
    if (!query) return bags
    return bags.filter(bag => [
      bag.bag_no,
      `${bag.block}-${bag.room_no}`,
      bag.block,
      bag.room_no,
      bag.intake_name,
      bag.garment_names,
    ].some(value => String(value || '').toLocaleLowerCase('tr-TR').includes(query)))
  }, [bags, searchQuery])

  // Hazır torbaları oda bazında grupla; tek torbalı odalar da doğrudan teslim edilebilir.
  const roomGroups = useMemo(() => {
    const map = new Map()
    for (const bag of filteredBags) {
      const key = `${bag.block}-${bag.room_no}`
      if (!map.has(key)) map.set(key, { key, block: bag.block, room_no: bag.room_no, bags: [] })
      map.get(key).bags.push(bag)
    }
    return [...map.values()]
  }, [filteredBags])

  async function openRoomBulk(group) {
    setError('')
    try {
      const response = await kioskApi.get(
        `/self-service/laundry-kiosk/room-persons?block=${encodeURIComponent(group.block)}&room_no=${encodeURIComponent(group.room_no)}`
      )
      setRoomBulk({ ...group, people: response.data })
      setDeliveredName(group.bags.find(bag => bag.intake_name)?.intake_name || '')
    } catch (requestError) {
      setError(requestError.response?.data?.error || 'Oda sakinleri yüklenemedi')
    }
  }

  async function submitRoomBulk() {
    if (!roomBulk) return
    const name = deliveredName.trim()
    if (!name) return setError('Teslim alan kişiyi seçin veya yazın')
    const needsSignature = recordNeedsSignature(roomBulk.bags[0])
    if (needsSignature && signatureRef.current?.isEmpty()) return setError('İmza gerekli')
    setSubmitting(true)
    setError('')
    try {
      const response = await kioskApi.post('/self-service/laundry-kiosk/deliver-room', {
        block: roomBulk.block,
        room_no: roomBulk.room_no,
        delivered_name: name,
        signature: needsSignature ? signatureRef.current?.toDataURL() : null,
      })
      const failures = response.data.failed || []
      setRoomBulk(null)
      setDeliveredName('')
      await loadBags()
      // Sebebi de göster: "2 başarısız" tek başına operatöre ne yapacağını
      // söylemiyor (çoğunlukla parçalar henüz ütüden/yıkamadan çıkmamıştır).
      setError(failures.length > 0
        ? `✓ ${response.data.delivered} torba teslim edildi · ${failures.length} başarısız — ${failures[0].error}`
        : `✓ ${response.data.delivered} torba tek imzayla teslim edildi`)
    } catch (requestError) {
      setError(requestError.response?.data?.error || 'Toplu teslim başarısız')
    } finally {
      setSubmitting(false)
    }
  }

  async function loadBags() {
    setLoading(true)
    setError('')
    try {
      const response = await kioskApi.get('/self-service/laundry-kiosk/bags?status=ready')
      setBags(response.data)
    } catch (requestError) {
      setError(requestError.response?.data?.error || 'Hazır torbalar yüklenemedi')
    } finally {
      setLoading(false)
    }
  }

  async function selectBag(bag) {
    setError('')
    try {
      const [detailResponse, peopleResponse] = await Promise.all([
        kioskApi.get(`/self-service/laundry-kiosk/bags/${bag.id}`),
        kioskApi.get(
          `/self-service/laundry-kiosk/room-persons?block=${encodeURIComponent(bag.block)}&room_no=${encodeURIComponent(bag.room_no)}`
        ),
      ])
      const nextDetail = detailResponse.data
      setDetail(nextDetail)
      setPeople(peopleResponse.data)
      setDeliveredName(nextDetail.bag.intake_name || '')
      setVerifiedCount(0)
      setSelectedIds(new Set())
      setBagLoss(null)
      setMissingGarment(null)
      setLossForm({ lastSeen: 'Teslim kontrolünde', note: '' })
      signatureRef.current?.clear()
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

  const readyGarments = (detail?.garments || []).filter(garment => garment.status === 'ready')
  const trackIndividually = (detail?.garments || []).length > 0
  const allSelected = trackIndividually
    ? readyGarments.length > 0 && readyGarments.every(garment => selectedIds.has(garment.id))
    : verifiedCount === detail?.bag.item_count

  function toggleGarment(id) {
    setSelectedIds(current => {
      const next = new Set(current)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
    globalThis.navigator?.vibrate?.(25)
  }

  async function deliver() {
    if (!detail || !allSelected) {
      setError('Teslimden önce tüm hazır parçaları doğrulayın')
      return
    }
    if (!deliveredName.trim()) {
      setError('Teslim alan kişiyi seçin veya adını yazın')
      return
    }
    let signature = null
    if (recordNeedsSignature(detail.bag)) {
      if (signatureRef.current?.isEmpty()) {
        setError('Bu blok için teslim imzası zorunludur')
        return
      }
      signature = signatureRef.current.toDataURL()
    }
    setSubmitting(true)
    setError('')
    try {
      const response = await kioskApi.post(
        `/self-service/laundry-kiosk/bags/${detail.bag.id}/deliver`,
        {
          delivered_name: deliveredName.trim(),
          garment_ids: trackIndividually ? [...selectedIds] : undefined,
          signature,
        }
      )
      setBags(current => current.filter(bag => bag.id !== detail.bag.id))
      setDetail(null)
      setSelectedIds(new Set())
      setDeliveredName('')
      setPeople([])
      setVerifiedCount(0)
      setError(`✓ ${response.data.delivered_count} parça teslim edildi`)
    } catch (requestError) {
      setError(requestError.response?.data?.error || 'Teslim kaydedilemedi; tekrar deneyin')
    } finally {
      setSubmitting(false)
    }
  }

  async function markLost() {
    if (!detail || !bagLoss) return
    setSubmitting(true)
    setError('')
    try {
      await kioskApi.post(`/self-service/laundry-kiosk/bags/${detail.bag.id}/lost`, {
        notes: `${lossForm.lastSeen}${lossForm.note.trim() ? ` · ${lossForm.note.trim()}` : ''}`,
      })
      setBags(current => current.filter(bag => bag.id !== detail.bag.id))
      setDetail(null)
      setBagLoss(null)
    } catch (requestError) {
      setError(requestError.response?.data?.error || 'Kayıp kaydı oluşturulamadı')
    } finally {
      setSubmitting(false)
    }
  }

  async function markGarmentMissing() {
    if (!detail || !missingGarment) return
    setSubmitting(true)
    setError('')
    try {
      const response = await kioskApi.post(
        `/self-service/laundry-kiosk/bags/${detail.bag.id}/garments/${missingGarment.id}/exception`,
        {
          reason: 'missing',
          note: `${lossForm.lastSeen}${lossForm.note.trim() ? ` · ${lossForm.note.trim()}` : ''}`,
        },
      )
      setDetail(current => ({
        ...current,
        garments: current.garments.map(garment => garment.id === missingGarment.id
          ? response.data.garment
          : garment),
        progress: response.data.progress,
      }))
      setSelectedIds(current => {
        const next = new Set(current)
        next.delete(missingGarment.id)
        return next
      })
      setMissingGarment(null)
      setLossForm({ lastSeen: 'Teslim kontrolünde', note: '' })
    } catch (requestError) {
      setError(requestError.response?.data?.error || 'Kayıp kıyafet kaydedilemedi')
    } finally {
      setSubmitting(false)
    }
  }

  // ── Oda bazlı toplu teslim ─────────────────────────────────────────────────
  if (roomBulk) {
    const needsSignature = recordNeedsSignature(roomBulk.bags[0])
    return (
      <section style={panel}>
        <header style={headerRow}>
          <button type="button" onClick={() => { setRoomBulk(null); setError('') }} style={smallButton}>
            ← Geri
          </button>
          <div style={{ textAlign: 'right' }}>
            <div style={{ color: '#f1f5f9', fontWeight: 900, fontSize: 16 }}>
              {roomBulk.block}-{roomBulk.room_no}
            </div>
            <div style={{ color: '#94a3b8', fontSize: 12 }}>
              {roomBulk.bags.length} torba · {roomBulk.bags.reduce((sum, b) => sum + (b.item_count || 0), 0)} parça
            </div>
          </div>
        </header>

        {error && <Message text={error} />}

        <div style={{
          borderRadius: 12, padding: '10px 12px',
          background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.3)',
          color: '#fbbf24', fontSize: 12,
        }}>
          ⚠️ Bu odanın <strong>tüm</strong> hazır torbaları tek isim ve tek imzayla teslim edilecek.
          Parça bazlı doğrulama yapılmaz — tek tek teslim için torbaya dokunun.
        </div>

        <div>
          <div style={eyebrow}>TESLİM EDİLECEK TORBALAR</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 5, marginTop: 8 }}>
            {roomBulk.bags.map(bag => (
              <div key={bag.id} style={{ color: '#cbd5e1', fontSize: 13 }}>
                <span style={{ color: '#38bdf8', fontFamily: 'monospace', fontWeight: 800 }}>
                  {bag.bag_no || `#${bag.id}`}
                </span>
                {' · '}{bag.item_count} parça
                {bag.intake_name ? ` · ${bag.intake_name}` : ''}
              </div>
            ))}
          </div>
        </div>

        <div>
          <div style={eyebrow}>TESLİM ALAN KİŞİ</div>
          {roomBulk.people.length > 0 && (
            <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap', margin: '8px 0' }}>
              {roomBulk.people.map(person => (
                <button type="button" key={person.id}
                  onClick={() => setDeliveredName(person.full_name)}
                  style={{
                    minHeight: 48,
                    borderRadius: 11,
                    border: `1px solid ${deliveredName === person.full_name ? '#22c55e' : '#334155'}`,
                    background: deliveredName === person.full_name ? '#14532d' : '#1e293b',
                    color: '#e2e8f0',
                    fontWeight: 800,
                    padding: '0 12px',
                  }}>
                  👤 {person.full_name}
                </button>
              ))}
            </div>
          )}
          <input value={deliveredName} onChange={event => setDeliveredName(event.target.value)}
            placeholder="Teslim alan kişinin adı" style={textInput} />
        </div>

        {needsSignature && (
          <div>
            <div style={eyebrow}>İMZA</div>
            <SignaturePad signatureRef={signatureRef} />
          </div>
        )}

        <button type="button" onClick={submitRoomBulk} disabled={submitting}
          style={{
            minHeight: 56,
            border: 0,
            borderRadius: 13,
            fontSize: 15,
            fontWeight: 900,
            background: submitting ? '#1e293b' : '#15803d',
            color: submitting ? '#475569' : '#fff',
          }}>
          {submitting ? 'Teslim ediliyor…' : `✓ ${roomBulk.bags.length} Torbayı Birden Teslim Et`}
        </button>
      </section>
    )
  }

  if (!detail) {
    return (
      <section style={panel}>
        <header style={headerRow}>
          <div>
            <div style={eyebrow}>HAZIR TESLİMATLAR</div>
            <h2 style={title}>Torbayı ve parçaları doğrula</h2>
          </div>
          <button type="button" onClick={loadBags} style={smallButton}>
            {loading ? '…' : '↻'}
          </button>
        </header>
        {error && <Message text={error} success={error.startsWith('✓')} />}
        {!loading && bags.length === 0 && <div style={empty}>📦 Teslim bekleyen torba yok</div>}

        {bags.length > 0 && (
          <input
            type="search"
            value={searchQuery}
            onChange={event => setSearchQuery(event.target.value)}
            placeholder="Oda, torba, kişi veya kıyafet ara…"
            aria-label="Teslimatlarda ara"
            style={{ ...textInput, borderColor: '#0ea5e9' }}
          />
        )}
        {!loading && bags.length > 0 && filteredBags.length === 0 && (
          <div style={empty}>Aramaya uygun teslimat bulunamadı</div>
        )}

        {/* Her oda doğrudan seçilebilir; tek ya da çok torba aynı hızlı akışta. */}
        {roomGroups.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <div style={eyebrow}>ODAYA DOKUNARAK TESLİM</div>
            {roomGroups.map(group => (
              <button type="button" key={group.key} onClick={() => openRoomBulk(group)}
                style={{
                  ...bagButton, borderLeftColor: '#f59e0b', minHeight: 56,
                }}>
                <div style={{ flex: 1, minWidth: 0, textAlign: 'left' }}>
                  <div style={{ color: '#f1f5f9', fontWeight: 900, fontSize: 15 }}>
                    📦 {group.block}-{group.room_no}
                  </div>
                  <div style={{ color: '#64748b', fontSize: 12 }}>
                    {group.bags.length} torba · {group.bags.reduce((sum, b) => sum + (b.item_count || 0), 0)} parça
                    {group.bags.length > 1 ? ' · tek imza' : ' · hızlı teslim'}
                  </div>
                </div>
                <span style={{ color: '#fbbf24', fontWeight: 900 }}>Odayı aç →</span>
              </button>
            ))}
          </div>
        )}

        {filteredBags.length > 0 && <div style={eyebrow}>TORBA / KIYAFET BAZINDA</div>}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
          {filteredBags.map(bag => (
            <button type="button" key={bag.id} onClick={() => selectBag(bag)} style={bagButton}>
              {bag.photo_url && (
                <img src={bag.photo_url} alt="" style={thumbnail} />
              )}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ color: '#38bdf8', fontFamily: 'monospace', fontSize: 12, fontWeight: 900 }}>
                  {bag.bag_no || `#${bag.id}`}
                </div>
                <div style={{ color: '#f1f5f9', fontWeight: 900, fontSize: 16 }}>
                  {bag.block}-{bag.room_no}
                </div>
                <div style={{ color: '#64748b', fontSize: 12, marginTop: 3 }}>
                  {bag.item_count} parça
                  {bag.intake_name ? ` · ${bag.intake_name}` : ''}
                </div>
                {bag.garment_names && (
                  <div style={{ color: '#93c5fd', fontSize: 11, marginTop: 2 }}>
                    👕 {bag.garment_names.split(',').join(', ')}
                  </div>
                )}
              </div>
              <span style={{ color: '#86efac', fontWeight: 900 }}>Teslim →</span>
            </button>
          ))}
        </div>
      </section>
    )
  }

  return (
    <section style={panel}>
      <header style={headerRow}>
        <button type="button" onClick={() => setDetail(null)} style={smallButton}>← Geri</button>
        <div style={{ textAlign: 'right' }}>
          <div style={{ color: '#38bdf8', fontFamily: 'monospace', fontWeight: 900 }}>
            {detail.bag.bag_no}
          </div>
          <div style={{ color: '#94a3b8', fontSize: 12 }}>
            {detail.bag.block}-{detail.bag.room_no}
          </div>
        </div>
      </header>

      {error && <Message text={error} />}

      {detail.bag.photo_url && (
        <button type="button" onClick={() => setPreview(detail.bag.photo_url)}
          style={{ ...bagButton, minHeight: 62, borderLeftColor: '#0ea5e9' }}>
          <img src={detail.bag.photo_url} alt="Torba" style={thumbnail} />
          <span style={{ color: '#bae6fd', fontWeight: 800 }}>Torba fotoğrafını büyüt</span>
        </button>
      )}

      <div>
        <div style={eyebrow}>TESLİM ALAN KİŞİ</div>
        {people.length > 0 && (
          <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap', margin: '8px 0' }}>
            {people.map(person => (
              <button type="button" key={person.id}
                onClick={() => setDeliveredName(person.full_name)}
                style={{
                  minHeight: 48,
                  borderRadius: 11,
                  border: `1px solid ${deliveredName === person.full_name ? '#22c55e' : '#334155'}`,
                  background: deliveredName === person.full_name ? '#14532d' : '#1e293b',
                  color: '#e2e8f0',
                  fontWeight: 800,
                  padding: '0 12px',
                }}>
                👤 {person.full_name}
              </button>
            ))}
          </div>
        )}
        <input value={deliveredName} onChange={event => setDeliveredName(event.target.value)}
          placeholder="Teslim alan ad soyad" style={textInput} />
      </div>

      {trackIndividually ? (
        <div>
          <div style={{ ...headerRow, marginBottom: 8 }}>
            <div style={eyebrow}>PARÇALARI TEK TEK DOĞRULA</div>
            <button type="button"
              onClick={() => setSelectedIds(allSelected
                ? new Set()
                : new Set(readyGarments.map(garment => garment.id)))}
              style={linkButton}>
              {allSelected ? 'Tümünü Kaldır' : 'Tümünü Seç'}
            </button>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {readyGarments.map(garment => {
              const checked = selectedIds.has(garment.id)
              return (
                <div key={garment.id}
                  style={{
                    minHeight: 60,
                    borderRadius: 12,
                    border: `1px solid ${checked ? '#22c55e' : '#334155'}`,
                    background: checked ? 'rgba(22,101,52,.25)' : '#1e293b',
                    padding: 10,
                    display: 'flex',
                    alignItems: 'center',
                    gap: 10,
                    textAlign: 'left',
                  }}>
                  <button type="button" onClick={() => toggleGarment(garment.id)}
                    aria-label={`${garment.garment_type} ${garment.garment_code} teslim seçimi`}
                    style={{
                      width: 42, height: 42, flexShrink: 0, borderRadius: 10,
                      background: checked ? '#15803d' : '#0f172a',
                      border: `2px solid ${checked ? '#22c55e' : '#64748b'}`,
                      display: 'grid', placeItems: 'center', color: '#fff', fontSize: 20,
                    }}>
                    {checked ? '✓' : ''}
                  </button>
                  <span style={{ flex: 1 }}>
                    <strong style={{ display: 'block', color: '#f8fafc' }}>
                      {garment.emoji || '👕'} {garment.garment_type}
                    </strong>
                    {/* Künye teslimde de görünür — sakin "benim değil" derse
                        marka/beden/renk üzerinden hemen ayırt edilir. */}
                    {garmentTagSummary(garment, PATTERNS) && (
                      <span style={{ display: 'block', color: '#93c5fd', fontSize: 12, fontWeight: 700 }}>
                        🏷️ {garmentTagSummary(garment, PATTERNS)}
                      </span>
                    )}
                    <span style={{ color: '#94a3b8', fontFamily: 'monospace', fontSize: 12 }}>
                      {garment.garment_code}
                    </span>
                  </span>
                  <button type="button" onClick={() => {
                    setMissingGarment(garment)
                    setBagLoss(null)
                    setLossForm({ lastSeen: 'Teslim kontrolünde', note: '' })
                  }} style={garmentLostButton}>
                    Kayıp
                  </button>
                </div>
              )
            })}
          </div>
        </div>
      ) : (
        <div style={countCard}>
          <strong style={{ color: '#e2e8f0' }}>Toplam parça adedini doğrula</strong>
          <span style={{ color: '#64748b', fontSize: 12 }}>
            Beklenen: {detail.bag.item_count}
          </span>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 16 }}>
            <CountButton label="−" onClick={() => setVerifiedCount(value => Math.max(0, value - 1))} />
            <strong style={{ color: '#fff', fontSize: 32 }}>{verifiedCount}</strong>
            <CountButton label="+" onClick={() => setVerifiedCount(value => Math.min(detail.bag.item_count, value + 1))} />
          </div>
        </div>
      )}

      {missingGarment && (
        <div style={lossPanel}>
          <div style={{ ...headerRow, alignItems: 'flex-start' }}>
            <div>
              <div style={{ ...eyebrow, color: '#fca5a5' }}>KAYIP KIYAFET BİLDİRİMİ</div>
              <strong style={{ display: 'block', color: '#fff', marginTop: 4 }}>
                {missingGarment.garment_code} · {missingGarment.garment_type}
              </strong>
              <small style={{ color: '#94a3b8' }}>
                Torba girişi: {formatDateTime(detail.bag.created_at)}
              </small>
            </div>
            <button type="button" onClick={() => setMissingGarment(null)} style={smallButton}>✕</button>
          </div>
          <LossFields value={lossForm} onChange={setLossForm} />
          <button type="button" onClick={markGarmentMissing} disabled={submitting} style={confirmLostButton}>
            {submitting ? 'Kaydediliyor…' : 'Kıyafeti kayıp olarak kaydet'}
          </button>
        </div>
      )}

      {bagLoss && (
        <div style={lossPanel}>
          <div style={{ ...headerRow, alignItems: 'flex-start' }}>
            <div>
              <div style={{ ...eyebrow, color: '#fca5a5' }}>KAYIP TORBA BİLDİRİMİ</div>
              <strong style={{ display: 'block', color: '#fff', marginTop: 4 }}>
                {detail.bag.bag_no || `#${detail.bag.id}`}
              </strong>
              <small style={{ color: '#94a3b8' }}>
                Giriş: {formatDateTime(detail.bag.created_at)} · {detail.bag.item_count} parça
              </small>
            </div>
            <button type="button" onClick={() => setBagLoss(null)} style={smallButton}>✕</button>
          </div>
          <div style={{ color: '#fecaca', fontSize: 12 }}>
            Bildirim zamanı ve işlemi yapan personel otomatik kaydedilir.
          </div>
          <LossFields value={lossForm} onChange={setLossForm} />
          <button type="button" onClick={markLost} disabled={submitting} style={confirmLostButton}>
            {submitting ? 'Kaydediliyor…' : 'Torbayı kayıp olarak kaydet'}
          </button>
        </div>
      )}

      {recordNeedsSignature(detail.bag) && (
        <div>
          <div style={{ ...eyebrow, marginBottom: 8 }}>TESLİM İMZASI</div>
          <SignaturePad signatureRef={signatureRef} />
        </div>
      )}

      <button type="button" onClick={deliver} disabled={!allSelected || submitting}
        style={{
          minHeight: 56,
          border: 0,
          borderRadius: 13,
          background: allSelected && !submitting ? '#15803d' : '#1e293b',
          color: allSelected && !submitting ? '#fff' : '#475569',
          fontSize: 15,
          fontWeight: 900,
        }}>
        {submitting
          ? 'Teslim kaydediliyor…'
          : `✓ ${trackIndividually ? selectedIds.size : verifiedCount} Parçayı Teslim Et`}
      </button>

      <button type="button" onClick={() => {
        setBagLoss({ openedAt: Date.now() })
        setMissingGarment(null)
        setLossForm({ lastSeen: 'Teslim kontrolünde', note: '' })
      }} style={lostButton}>
        ⚠ Torba teslim alanında bulunamadı
      </button>

      {preview && (
        <button type="button" aria-label="Fotoğraf önizlemesini kapat"
          onClick={() => setPreview(null)} style={previewBackdrop}>
          <img src={preview} alt="Torba büyük önizleme"
            style={{ maxWidth: '96vw', maxHeight: '86vh', borderRadius: 15, objectFit: 'contain' }} />
        </button>
      )}
    </section>
  )
}

function LossFields({ value, onChange }) {
  return (
    <>
      <label style={{ color: '#cbd5e1', fontSize: 11, fontWeight: 800 }}>
        En son nerede görüldü?
        <select value={value.lastSeen}
          onChange={event => onChange(current => ({ ...current, lastSeen: event.target.value }))}
          style={{ ...textInput, display: 'block', marginTop: 6 }}>
          <option>Teslim kontrolünde</option>
          <option>Ütü çıkışında</option>
          <option>Yıkama sonrasında</option>
          <option>Torba girişinde</option>
          <option>Bilinmiyor</option>
        </select>
      </label>
      <textarea value={value.note}
        onChange={event => onChange(current => ({ ...current, note: event.target.value }))}
        placeholder="Aranan yer, kimin fark ettiği veya ayırt edici bilgi…"
        rows={3} maxLength={420}
        style={{ ...textInput, minHeight: 80, resize: 'vertical', fontFamily: 'inherit' }} />
    </>
  )
}

function formatDateTime(value) {
  if (!value) return 'Bilinmiyor'
  const normalized = String(value).includes('T') ? value : `${value.replace(' ', 'T')}Z`
  const date = new Date(normalized)
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString('tr-TR', {
    day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit',
  })
}

function Message({ text, success = false }) {
  return (
    <div style={{
      borderRadius: 11,
      padding: 11,
      background: success ? '#052e16' : '#2b1117',
      color: success ? '#bbf7d0' : '#fecaca',
      fontSize: 13,
    }}>
      {text}
    </div>
  )
}

function CountButton({ label, onClick }) {
  return <button type="button" onClick={onClick} style={{ ...smallButton, width: 52, height: 52, fontSize: 24 }}>{label}</button>
}

const panel = { background: '#0f172a', border: '1px solid #1e293b', borderRadius: 17, padding: 16, display: 'flex', flexDirection: 'column', gap: 14 }
const headerRow = { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }
const eyebrow = { color: '#64748b', fontSize: 10, letterSpacing: 1.2, fontWeight: 900 }
const title = { color: '#f1f5f9', fontSize: 19, margin: '3px 0 0' }
const smallButton = { minHeight: 48, minWidth: 48, borderRadius: 10, border: '1px solid #334155', background: '#1e293b', color: '#cbd5e1', fontWeight: 900, cursor: 'pointer' }
const bagButton = { minHeight: 76, width: '100%', border: '1px solid #334155', borderLeft: '4px solid #22c55e', borderRadius: 13, background: '#1e293b', padding: 11, display: 'flex', alignItems: 'center', gap: 11, textAlign: 'left', cursor: 'pointer' }
const empty = { padding: 24, borderRadius: 13, border: '1px dashed #334155', color: '#64748b', textAlign: 'center' }
const thumbnail = { width: 48, height: 48, borderRadius: 10, objectFit: 'cover', border: '1px solid #475569', flexShrink: 0 }
const textInput = { width: '100%', boxSizing: 'border-box', minHeight: 48, borderRadius: 11, border: '1px solid #334155', background: '#1e293b', color: '#f8fafc', padding: '10px 12px', outline: 'none' }
const linkButton = { minHeight: 48, border: 0, background: 'transparent', color: '#60a5fa', fontWeight: 800, cursor: 'pointer' }
const countCard = { borderRadius: 14, padding: 18, background: '#111827', border: '1px solid #334155', display: 'flex', flexDirection: 'column', gap: 14, textAlign: 'center' }
const lostButton = { minHeight: 48, borderRadius: 12, border: '1px dashed #7f1d1d', background: '#1f1015', color: '#fca5a5', fontWeight: 800 }
const garmentLostButton = { minHeight: 42, borderRadius: 9, border: '1px solid #7f1d1d', background: '#1f1015', color: '#fca5a5', fontSize: 11, fontWeight: 900, padding: '0 10px' }
const lossPanel = { borderRadius: 14, padding: 13, background: '#1f1015', border: '1px solid #7f1d1d', display: 'flex', flexDirection: 'column', gap: 11 }
const confirmLostButton = { minHeight: 50, borderRadius: 11, border: 0, background: '#b91c1c', color: '#fff', fontWeight: 900 }
const previewBackdrop = { position: 'fixed', inset: 0, zIndex: 60, border: 0, background: 'rgba(2,6,23,.94)', display: 'grid', placeItems: 'center', padding: 10 }
