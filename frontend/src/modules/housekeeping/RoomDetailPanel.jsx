// Seçili oda detay paneli: sol kolonda oda notu / temizlik-yok toggle / kontrol
// listesi / aksiyon butonları, sağ kolonda odadaki kişiler + arıza listesi + arıza
// bildir formu. Oda detayı query'sini ve oda-özel mutation'ları (not, no-clean,
// arıza) kendisi yönetir; görev aksiyonları (tamamla/atla) prop olarak gelir.
import { useState, useRef } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import api from '../../shared/api/client.js'
import { SkeletonTable } from '../../shared/components/Skeleton.jsx'
import { BLOCK_BY_NAME } from '../../shared/blocks.js'
import { CHECKLIST_ITEMS, SKIP_REASONS } from './shared.jsx'
import { downscalePhoto, dataUrlToBlob } from '../../shared/photo.js'

export default function RoomDetailPanel({ block, floor, roomNo, task, isPrivateBath, onComplete, onUncomplete, onSkip, onClose, onInvalidateRooms }) {
  const qc = useQueryClient()
  const [checkedItems, setCheckedItems] = useState(() => {
    if (task?.checklist) {
      try { return new Set(JSON.parse(task.checklist)) } catch { return new Set() }
    }
    return new Set()
  })
  const [showSkip, setShowSkip]   = useState(false)
  const [skipReason, setSkipReason] = useState(task?.skip_reason || '')
  const [faultDesc, setFaultDesc] = useState('')
  const [faultPriority, setFaultPriority] = useState('medium')
  const [faultPhoto, setFaultPhoto] = useState(null)
  const [faultPreview, setFaultPreview] = useState(null)
  const [faultSent, setFaultSent] = useState(false)
  const faultCameraRef = useRef(null)
  const faultFileRef = useRef(null)
  const [noCleanLocal, setNoCleanLocal] = useState(null)
  const [noteText, setNoteText] = useState('')
  const [noteInited, setNoteInited] = useState(false)
  const [cleanPhoto, setCleanPhoto] = useState(null) // temizlik kanıt fotoğrafı (dataURL)

  async function onCleanPhotoPick(e) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    try { setCleanPhoto(await downscalePhoto(file)) } catch { /* sessiz */ }
  }

  const done    = !!task?.completed_at
  const skipped = task?.skipped === 1
  const isM     = BLOCK_BY_NAME[block]?.type === 'M'

  const visibleChecklist = CHECKLIST_ITEMS.filter(i => !i.privateOnly || isPrivateBath)
  const checkedCount = [...checkedItems].filter(id => visibleChecklist.some(i => i.id === id)).length

  const { data: details, isLoading: detailLoading, refetch: refetchDetails } = useQuery({
    queryKey: ['hk-room-details', block, roomNo],
    queryFn: () => api.get(`/housekeeping/room-details?block=${block}&room_no=${roomNo}`).then(r => r.data),
    staleTime: 15000,
  })

  // Temizlik geçmişi — qr_location üretim anahtarı: `${block}-${roomNo}`
  const { data: cleanHistory = [] } = useQuery({
    queryKey: ['hk-task-history', block, roomNo],
    queryFn: () => api.get(`/housekeeping/task-history?qr_location=${encodeURIComponent(`${block}-${roomNo}`)}&days=7`).then(r => r.data),
    staleTime: 30000,
  })
  const room   = details?.room
  const faults = details?.faults || []
  const noClean = noCleanLocal !== null ? noCleanLocal : (room?.no_clean === 1)

  // Init note text from room data once loaded
  if (room && !noteInited) {
    setNoteText(room.notes || '')
    setNoteInited(true)
  }

  const mutNoClean = useMutation({
    mutationFn: (val) => api.patch(`/housekeeping/rooms/${room.id}/no-clean`, { no_clean: val }),
    onSuccess: (_, val) => {
      setNoCleanLocal(val)
      qc.invalidateQueries(['capacity-rooms', block])
      onInvalidateRooms?.()
    },
  })

  const mutNotes = useMutation({
    mutationFn: (n) => api.patch(`/housekeeping/rooms/${room.id}/notes`, { notes: n }),
    onSuccess: () => {
      qc.invalidateQueries(['hk-room-details', block, roomNo])
      qc.invalidateQueries(['capacity-rooms', block])
    },
  })

  const handleFaultPhoto = (file) => {
    if (!file) return
    setFaultPhoto(file)
    const reader = new FileReader()
    reader.onload = e => setFaultPreview(e.target.result)
    reader.readAsDataURL(file)
  }

  const clearFaultPhoto = () => {
    setFaultPhoto(null)
    setFaultPreview(null)
    if (faultCameraRef.current) faultCameraRef.current.value = ''
    if (faultFileRef.current) faultFileRef.current.value = ''
  }

  const mutFault = useMutation({
    mutationFn: () => {
      const fd = new FormData()
      fd.append('location', `${block} Kat ${floor} Oda ${roomNo}`)
      fd.append('description', faultDesc)
      fd.append('priority', faultPriority)
      if (faultPhoto) fd.append('photo', faultPhoto)
      return api.post('/housekeeping/fault-report', fd)
    },
    onSuccess: () => {
      setFaultDesc(''); setFaultPriority('medium'); clearFaultPhoto()
      setFaultSent(true); refetchDetails()
    },
  })

  function toggleItem(id) {
    if (done || skipped) return
    setCheckedItems(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  function selectAll() { setCheckedItems(new Set(visibleChecklist.map(i => i.id))) }
  function clearAll()  { setCheckedItems(new Set()) }

  const side = Number(roomNo) % 2 !== 0 ? 'SOL · TEK' : 'SAĞ · ÇİFT'
  const accentLine = done
    ? 'linear-gradient(90deg,var(--green),var(--teal))'
    : skipped
      ? 'linear-gradient(90deg,var(--border),var(--border2))'
      : 'linear-gradient(90deg,var(--accent),var(--accent3))'

  return (
    <div className="panel fade-up" style={{ marginTop: '16px' }}>
      <div style={{ height: '3px', background: accentLine }} />

      {/* Header */}
      <div className="panel-header">
        <div>
          <div className="panel-title" style={{ fontSize: '20px' }}>
            ODA {roomNo}
            {isPrivateBath && <span style={{ marginLeft: '8px', fontSize: '14px' }}>🚿🚽</span>}
            <span style={{ marginLeft: '10px', fontFamily: 'var(--mono)', fontSize: '10px', color: 'var(--text3)', verticalAlign: 'middle', letterSpacing: '1px' }}>
              {block} · KAT {floor} · {side}
            </span>
          </div>
          {room && (
            <div className="panel-subtitle">
              {room.occupied || 0}/{room.active_beds || room.capacity} KİŞİ
              {isPrivateBath ? ' · ÖZEL BANYO + TUVALET' : ' · ORTAK BANYO/WC'}
              {noClean && ' · ⊘ TEMİZLİK İSTEMİYOR'}
            </div>
          )}
        </div>
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
          {done    && <span className="badge badge-green" style={{ fontSize: '11px' }}>✓ TEMİZLENDİ</span>}
          {skipped && <span className="badge badge-gray"  style={{ fontSize: '11px' }}>⊘ ATLANDI</span>}
          {!done && !skipped && task && <span className="badge badge-blue" style={{ fontSize: '11px' }}>○ BEKLİYOR</span>}
          {!task  && <span className="badge badge-gray"  style={{ fontSize: '11px' }}>— GÖREV YOK</span>}
          <button className="btn btn-ghost btn-xs" onClick={onClose}>✕</button>
        </div>
      </div>

      {/* Two-column body */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(300px, 100%), 1fr))', borderTop: '1px solid var(--border)' }}>

        {/* ── LEFT: Checklist + Actions ── */}
        <div style={{ padding: '18px 20px', borderRight: '1px solid var(--border)' }}>

          {/* Room note - editable */}
          {room && (
            <div style={{ background: 'rgba(240,165,0,.07)', border: '1px solid rgba(240,165,0,.2)', borderRadius: '7px', padding: '10px 13px', marginBottom: '14px' }}>
              <div style={{ fontFamily: 'var(--mono)', fontSize: '8px', color: 'var(--accent)', letterSpacing: '2px', marginBottom: '6px' }}>ODA NOTU</div>
              <textarea
                className="form-textarea"
                rows={2}
                placeholder="Bu oda hakkında not ekleyin..."
                value={noteText}
                onChange={e => setNoteText(e.target.value)}
                style={{ marginBottom: '6px', fontSize: '12px', background: 'rgba(0,0,0,.15)', border: '1px solid rgba(240,165,0,.15)' }}
              />
              <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                <button
                  className="btn btn-primary btn-xs"
                  onClick={() => mutNotes.mutate(noteText)}
                  disabled={mutNotes.isPending || noteText === (room.notes || '')}
                  style={{ fontSize: '9px' }}
                >
                  {mutNotes.isPending ? '...' : '✎ NOTU KAYDET'}
                </button>
                {noteText && noteText !== (room.notes || '') && (
                  <button className="btn btn-ghost btn-xs" onClick={() => setNoteText(room.notes || '')} style={{ fontSize: '9px' }}>İPTAL</button>
                )}
                {mutNotes.isSuccess && (
                  <span style={{ fontFamily: 'var(--mono)', fontSize: '8px', color: 'var(--green)' }}>Kaydedildi</span>
                )}
              </div>
            </div>
          )}

          {/* no_clean toggle */}
          {room && (
            <div
              onClick={() => !mutNoClean.isPending && mutNoClean.mutate(!noClean)}
              style={{
                display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer',
                padding: '9px 12px', borderRadius: '7px', marginBottom: '16px',
                background: noClean ? 'rgba(61,78,106,.18)' : 'var(--surface2)',
                border: `1px solid ${noClean ? 'var(--border2)' : 'var(--border)'}`,
                transition: 'all .15s', opacity: mutNoClean.isPending ? 0.6 : 1,
              }}
            >
              {/* Toggle switch visual */}
              <div style={{
                width: '36px', height: '20px', borderRadius: '10px', flexShrink: 0,
                background: noClean ? 'var(--border2)' : 'var(--surface3)',
                border: '1px solid var(--border2)', position: 'relative', transition: 'background .2s',
              }}>
                <div style={{
                  position: 'absolute', top: '3px',
                  left: noClean ? '17px' : '3px',
                  width: '12px', height: '12px', borderRadius: '50%',
                  background: noClean ? 'var(--text2)' : 'var(--text4)',
                  transition: 'left .2s',
                }} />
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontFamily: 'var(--mono)', fontSize: '10px', color: noClean ? 'var(--text2)' : 'var(--text3)', letterSpacing: '0.5px' }}>
                  Bu oda temizlik istemiyor
                </div>
                {noClean && <div style={{ fontFamily: 'var(--mono)', fontSize: '8px', color: 'var(--text4)', marginTop: '2px' }}>Görevler yine de oluşturulur, atlanabilir</div>}
              </div>
              <span style={{ fontFamily: 'var(--mono)', fontSize: '9px', color: noClean ? 'var(--text2)' : 'var(--text4)' }}>
                {noClean ? 'AKTİF' : 'PASİF'}
              </span>
            </div>
          )}

          {/* Checklist header */}
          <div style={{ display: 'flex', alignItems: 'center', marginBottom: '10px' }}>
            <div style={{ fontFamily: 'var(--mono)', fontSize: '9px', color: 'var(--text3)', letterSpacing: '2px', flex: 1 }}>
              TEMİZLİK KONTROLLİSTESİ
              {isPrivateBath && <span style={{ marginLeft: '6px', color: 'var(--teal)' }}>· ÖZEL BANYO + TUVALET</span>}
            </div>
            {!done && !skipped && (
              <div style={{ display: 'flex', gap: '6px' }}>
                <button className="btn btn-ghost btn-xs" onClick={selectAll}>Tümü</button>
                <button className="btn btn-ghost btn-xs" onClick={clearAll}>Temizle</button>
              </div>
            )}
          </div>

          {/* Checklist items */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '5px', marginBottom: '14px' }}>
            {visibleChecklist.map(item => {
              const checked    = checkedItems.has(item.id)
              const isReadOnly = done || skipped
              return (
                <div
                  key={item.id}
                  onClick={() => toggleItem(item.id)}
                  style={{
                    display: 'flex', alignItems: 'center', gap: '10px',
                    padding: '8px 11px', borderRadius: '7px',
                    cursor: isReadOnly ? 'default' : 'pointer',
                    background: checked ? 'rgba(39,201,106,.1)' : 'var(--surface2)',
                    border: `1px solid ${checked ? 'rgba(39,201,106,.3)' : 'var(--border)'}`,
                    opacity: isReadOnly && !checked ? 0.35 : 1,
                    transition: 'all .12s',
                  }}
                >
                  {/* Checkbox */}
                  <div style={{
                    width: '18px', height: '18px', borderRadius: '4px', flexShrink: 0,
                    background: checked ? 'var(--green)' : 'transparent',
                    border: `2px solid ${checked ? 'var(--green)' : 'var(--border2)'}`,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    transition: 'all .12s',
                  }}>
                    {checked && <span style={{ fontSize: '10px', color: '#000', fontWeight: 700 }}>✓</span>}
                  </div>
                  <span style={{ fontSize: '12px' }}>{item.icon}</span>
                  <span style={{ fontFamily: 'var(--sans)', fontSize: '12.5px', color: checked ? 'var(--text)' : 'var(--text2)', flex: 1 }}>
                    {item.label}
                  </span>
                </div>
              )
            })}
          </div>

          {/* Progress */}
          {!done && !skipped && (
            <div style={{ marginBottom: '14px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '5px' }}>
                <span style={{ fontFamily: 'var(--mono)', fontSize: '8px', color: 'var(--text3)' }}>KONTROL LİSTESİ</span>
                <span style={{ fontFamily: 'var(--mono)', fontSize: '8px', color: checkedCount === visibleChecklist.length ? 'var(--green)' : 'var(--text3)' }}>
                  {checkedCount}/{visibleChecklist.length}
                </span>
              </div>
              <div className="prog-bar">
                <div className={`prog-fill ${checkedCount === visibleChecklist.length ? 'prog-green' : 'prog-amber'}`}
                  style={{ width: `${(checkedCount / visibleChecklist.length) * 100}%` }} />
              </div>
            </div>
          )}

          {/* ── Action buttons ── */}
          {!task && (
            <div style={{ fontFamily: 'var(--mono)', fontSize: '10px', color: 'var(--text4)', padding: '8px 0', textAlign: 'center' }}>
              Bu kat için görev oluşturulmamış.
            </div>
          )}

          {task && done && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {task.checklist && (() => {
                try {
                  const saved = JSON.parse(task.checklist)
                  if (!saved.length) return null
                  return (
                    <div style={{ background: 'rgba(39,201,106,.07)', border: '1px solid rgba(39,201,106,.2)', borderRadius: '6px', padding: '8px 12px' }}>
                      <div style={{ fontFamily: 'var(--mono)', fontSize: '8px', color: 'var(--green)', letterSpacing: '1px', marginBottom: '5px' }}>TAMAMLANAN İŞLER</div>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '5px' }}>
                        {saved.map(id => {
                          const item = CHECKLIST_ITEMS.find(i => i.id === id)
                          return item ? (
                            <span key={id} style={{ fontFamily: 'var(--mono)', fontSize: '10px', color: 'var(--green)', background: 'rgba(39,201,106,.12)', borderRadius: '4px', padding: '2px 7px' }}>
                              {item.icon} {item.label}
                            </span>
                          ) : null
                        })}
                      </div>
                    </div>
                  )
                } catch { return null }
              })()}
              {task.assignee_name && (
                <div style={{ fontFamily: 'var(--mono)', fontSize: '9px', color: 'var(--text3)' }}>
                  ✓ {task.assignee_name} · {new Date(task.completed_at).toLocaleTimeString('tr-TR', { hour:'2-digit', minute:'2-digit' })}
                </div>
              )}
              <button className="btn btn-ghost btn-sm" onClick={() => onUncomplete(task.id)}>
                ↩ TEMİZLİĞİ GERİ AL
              </button>
            </div>
          )}

          {task && skipped && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <div style={{ background: 'rgba(61,78,106,.15)', border: '1px solid var(--border2)', borderRadius: '7px', padding: '10px 13px' }}>
                <div style={{ fontFamily: 'var(--mono)', fontSize: '8px', color: 'var(--text3)', letterSpacing: '1px', marginBottom: '4px' }}>ATLANMA SEBEBİ</div>
                <div style={{ fontSize: '13px', color: 'var(--text2)' }}>{task.skip_reason || '—'}</div>
              </div>
              <div style={{ display: 'flex', gap: '8px' }}>
                <button className="btn btn-ghost btn-sm" style={{ flex: 1 }} onClick={() => onSkip(task.id, null, true)}>
                  ↩ ATLAMAYI GERİ AL
                </button>
                <button className="btn btn-primary btn-sm" style={{ flex: 1 }} onClick={() => onComplete(task.id, [...checkedItems], cleanPhoto ? dataUrlToBlob(cleanPhoto) : null)}>
                  ✓ Yine de Tamamla
                </button>
              </div>
            </div>
          )}

          {task && !done && !skipped && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {/* Temizlik kanıt fotoğrafı (opsiyonel) */}
              {cleanPhoto ? (
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: '8px', padding: '8px 10px' }}>
                  <img src={cleanPhoto} alt="temizlik kanıtı" style={{ width: '52px', height: '52px', objectFit: 'cover', borderRadius: '6px', border: '1px solid var(--border)' }} />
                  <span style={{ fontFamily: 'var(--mono)', fontSize: '9px', color: 'var(--green)', flex: 1 }}>📷 Kanıt fotoğrafı hazır</span>
                  <button className="btn btn-ghost btn-xs" onClick={() => setCleanPhoto(null)}>✕</button>
                </div>
              ) : (
                <label className="btn btn-ghost btn-sm" style={{ width: '100%', cursor: 'pointer', textAlign: 'center' }}>
                  📷 KANIT FOTOĞRAFI ÇEK / SEÇ
                  <input type="file" accept="image/*" capture="environment" style={{ display: 'none' }} onChange={onCleanPhotoPick} />
                </label>
              )}
              <button
                className="btn btn-primary btn-sm"
                style={{ width: '100%', padding: '10px' }}
                onClick={() => onComplete(task.id, [...checkedItems], cleanPhoto ? dataUrlToBlob(cleanPhoto) : null)}
              >
                {cleanPhoto ? '📷✓' : '✓'} TEMİZLİK TAMAMLANDI
                {checkedCount > 0 && <span style={{ opacity: 0.75, marginLeft: '6px', fontSize: '9px' }}>({checkedCount} madde)</span>}
              </button>
              {!showSkip ? (
                <button className="btn btn-ghost btn-sm" style={{ width: '100%' }} onClick={() => setShowSkip(true)}>
                  ⊘ BU ODAYI ATLA
                </button>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: '8px', padding: '12px' }}>
                  <div style={{ fontFamily: 'var(--mono)', fontSize: '8px', color: 'var(--text3)', letterSpacing: '2px', marginBottom: '2px' }}>ATLANMA SEBEBİ</div>
                  <select className="form-select" value={skipReason} onChange={e => setSkipReason(e.target.value)}>
                    <option value="">Seçin...</option>
                    {SKIP_REASONS.map(r => <option key={r} value={r}>{r}</option>)}
                  </select>
                  <div style={{ display: 'flex', gap: '6px', marginTop: '2px' }}>
                    <button className="btn btn-primary btn-sm" style={{ flex: 1 }}
                      onClick={() => { onSkip(task.id, skipReason); setShowSkip(false) }}
                      disabled={!skipReason}>
                      ⊘ Atla
                    </button>
                    <button className="btn btn-ghost btn-xs" onClick={() => setShowSkip(false)}>İptal</button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* ── RIGHT: Occupants + Faults ── */}
        <div style={{ padding: '18px 20px' }}>

          {/* Occupants */}
          <div style={{ marginBottom: '16px' }}>
            <div style={{ fontFamily: 'var(--mono)', fontSize: '9px', color: 'var(--text3)', letterSpacing: '2px', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '8px' }}>
              ODADAKI KİŞİLER
              {!detailLoading && (
                <span style={{ background: 'var(--surface3)', color: 'var(--text2)', borderRadius: '10px', padding: '1px 7px', fontSize: '9px', fontFamily: 'var(--mono)' }}>
                  {details?.personnel?.length || 0}
                </span>
              )}
            </div>
            {detailLoading ? (
              <SkeletonTable rows={2} cols={3} />
            ) : !details?.personnel?.length ? (
              <div style={{ padding: '10px 12px', borderRadius: '7px', background: 'var(--surface2)', border: '1px solid var(--border)', fontFamily: 'var(--mono)', fontSize: '9px', color: 'var(--text4)' }}>
                Odada kimse yok
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
                {details.personnel.map((p, i) => (
                  <div key={p.id || i} style={{
                    display: 'flex', alignItems: 'center', gap: '10px',
                    padding: '8px 11px', borderRadius: '7px',
                    background: 'var(--surface2)', border: '1px solid var(--border)',
                  }}>
                    <div style={{
                      width: '26px', height: '26px', borderRadius: '50%', flexShrink: 0,
                      background: p.shift_type === 'night' ? 'rgba(99,102,241,.25)' : 'rgba(240,165,0,.2)',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontFamily: 'var(--display)', fontSize: '11px',
                      color: p.shift_type === 'night' ? 'var(--purple)' : 'var(--accent)',
                    }}>
                      {p.full_name.charAt(0).toUpperCase()}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {p.full_name}
                      </div>
                      <div style={{ fontFamily: 'var(--mono)', fontSize: '8px', color: 'var(--text3)', marginTop: '1px', display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                        {p.company && <span>{p.company}</span>}
                        {p.phone_number && <span style={{ color: 'var(--teal)' }}>📞 {p.phone_number}</span>}
                      </div>
                    </div>
                    <div style={{ flexShrink: 0, display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '2px' }}>
                      <span style={{ fontFamily: 'var(--mono)', fontSize: '8px', color: 'var(--text4)', background: 'var(--surface3)', borderRadius: '3px', padding: '1px 5px' }}>
                        YATAK {p.bed_no}
                      </span>
                      <span style={{ fontFamily: 'var(--mono)', fontSize: '7px', color: p.shift_type === 'night' ? 'var(--purple)' : 'var(--accent)' }}>
                        {p.shift_type === 'night' ? '☾ GECE' : '☀ GÜNDÜZ'}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div style={{ borderTop: '1px solid var(--border)', marginBottom: '14px' }} />

          {/* Faults header */}
          {(() => {
            const openFaults = faults.filter(f => f.status !== 'done')
            return (<>
              <div style={{ display: 'flex', alignItems: 'center', marginBottom: '10px' }}>
                <div style={{ fontFamily: 'var(--mono)', fontSize: '9px', color: 'var(--text3)', letterSpacing: '2px', flex: 1 }}>ARIZALAR</div>
                {openFaults.length > 0 && (
                  <span style={{ background: 'var(--red)', color: '#fff', borderRadius: '10px', padding: '1px 8px', fontFamily: 'var(--mono)', fontSize: '9px', fontWeight: 700 }}>
                    {openFaults.length} açık
                  </span>
                )}
              </div>

              {detailLoading ? (
                <SkeletonTable rows={2} cols={3} />
              ) : faults.length === 0 ? (
                <div style={{ padding: '12px', borderRadius: '7px', textAlign: 'center', background: 'var(--surface2)', border: '1px solid var(--border)', marginBottom: '14px' }}>
                  <div style={{ fontFamily: 'var(--mono)', fontSize: '9px', color: 'var(--text3)' }}>Arıza kaydı yok</div>
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '7px', marginBottom: '14px', maxHeight: '340px', overflowY: 'auto' }}>
                  {faults.map(f => {
                    const isDone = f.status === 'done'
                    const borderColor = isDone ? 'rgba(39,201,106,.25)' : 'rgba(231,76,60,.2)'
                    const bgColor = isDone ? 'rgba(39,201,106,.04)' : 'rgba(231,76,60,.06)'
                    return (
                      <div key={f.id} style={{ padding: '10px 13px', borderRadius: '7px', background: bgColor, border: `1px solid ${borderColor}` }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                          <span className={`badge badge-${isDone ? 'green' : f.status === 'open' ? 'red' : 'amber'}`} style={{ fontSize: '8px', padding: '1px 6px' }}>
                            {isDone ? 'KAPANDI' : f.status === 'open' ? 'YENİ' : 'İŞLEMDE'}
                          </span>
                          {f.priority && (
                            <span style={{
                              fontFamily: 'var(--mono)', fontSize: '7px', padding: '1px 4px', borderRadius: '3px',
                              color: f.priority === 'high' ? 'var(--red)' : f.priority === 'medium' ? 'var(--accent)' : 'var(--blue)',
                              background: f.priority === 'high' ? 'rgba(231,76,60,.1)' : f.priority === 'medium' ? 'rgba(240,165,0,.1)' : 'rgba(59,140,240,.1)',
                            }}>
                              {f.priority === 'high' ? 'YÜKSEK' : f.priority === 'medium' ? 'ORTA' : 'DÜŞÜK'}
                            </span>
                          )}
                          <span style={{ fontFamily: 'var(--mono)', fontSize: '8px', color: 'var(--text3)' }}>
                            #{f.id} · {new Date(f.opened_at).toLocaleDateString('tr-TR')}
                            {isDone && f.closed_at && ` → ${new Date(f.closed_at).toLocaleDateString('tr-TR')}`}
                          </span>
                        </div>
                        <div style={{ fontSize: '12.5px', color: 'var(--text)', lineHeight: 1.4 }}>{f.description}</div>
                        {/* Before / After photos */}
                        {(f.photo_before || f.photo_url) && (
                          <div style={{ display: 'flex', gap: '8px', marginTop: '8px', flexWrap: 'wrap' }}>
                            {f.photo_before && (
                              <div style={{ flex: 1, minWidth: '80px' }}>
                                <div style={{ fontFamily: 'var(--mono)', fontSize: '7px', color: 'var(--red)', letterSpacing: '1px', marginBottom: '3px' }}>ÖNCE</div>
                                <img loading="lazy" src={f.photo_before} alt="" style={{ width: '100%', maxHeight: '100px', objectFit: 'cover', borderRadius: '6px', border: '1px solid var(--border)' }} />
                              </div>
                            )}
                            {f.photo_url && (
                              <div style={{ flex: 1, minWidth: '80px' }}>
                                <div style={{ fontFamily: 'var(--mono)', fontSize: '7px', color: 'var(--green)', letterSpacing: '1px', marginBottom: '3px' }}>SONRA</div>
                                <img loading="lazy" src={f.photo_url} alt="" style={{ width: '100%', maxHeight: '100px', objectFit: 'cover', borderRadius: '6px', border: '1px solid var(--border)' }} />
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              )}
            </>)
          })()}

          {/* Temizlik geçmişi — foto kanıtlı (son 7 gün) */}
          {cleanHistory.length > 0 && (
            <>
              <div style={{ fontFamily: 'var(--mono)', fontSize: '9px', color: 'var(--text3)', letterSpacing: '2px', marginBottom: '10px' }}>
                TEMİZLİK GEÇMİŞİ — SON 7 GÜN
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '5px', marginBottom: '14px', maxHeight: '240px', overflowY: 'auto' }}>
                {cleanHistory.map(h => {
                  const hDone = !!h.completed_at
                  const who = h.worker_name || h.assignee_name
                  return (
                    <div key={h.id} style={{
                      display: 'flex', alignItems: 'center', gap: '8px',
                      padding: '7px 10px', borderRadius: '6px',
                      background: hDone ? 'rgba(39,201,106,.05)' : h.skipped ? 'rgba(240,165,0,.05)' : 'var(--surface2)',
                      border: `1px solid ${hDone ? 'rgba(39,201,106,.2)' : h.skipped ? 'rgba(240,165,0,.2)' : 'var(--border)'}`,
                    }}>
                      <span style={{ fontFamily: 'var(--mono)', fontSize: '9px', color: 'var(--text3)', width: '62px', flexShrink: 0 }}>
                        {new Date(h.scheduled_at).toLocaleDateString('tr-TR', { day: '2-digit', month: 'short', weekday: 'short' })}
                      </span>
                      <span style={{ fontSize: '11px', flex: 1, color: hDone ? 'var(--green)' : h.skipped ? 'var(--accent)' : 'var(--text3)' }}>
                        {hDone
                          ? `✓ Temizlendi${who ? ` — ${who}` : ''}${h.verified_by_qr ? ' · QR' : ''}`
                          : h.skipped ? `⊘ Atlandı${h.skip_reason ? ` (${h.skip_reason})` : ''}` : 'Yapılmadı'}
                      </span>
                      {h.photo_url && (
                        <img loading="lazy" src={h.photo_url} alt="temizlik kanıtı"
                          onClick={() => window.open(h.photo_url, '_blank')}
                          title="Temizlik kanıt fotoğrafı — büyütmek için tıkla"
                          style={{ width: '34px', height: '34px', objectFit: 'cover', borderRadius: '5px', border: '1px solid var(--border)', cursor: 'pointer', flexShrink: 0 }} />
                      )}
                    </div>
                  )
                })}
              </div>
            </>
          )}

          {/* Report fault */}
          <div style={{ fontFamily: 'var(--mono)', fontSize: '9px', color: 'var(--text3)', letterSpacing: '2px', marginBottom: '10px' }}>ARIZA BİLDİR</div>
          {faultSent ? (
            <div className="alert alert-success" style={{ margin: 0 }}>
              <span>✓</span>
              <div>
                <div style={{ fontWeight: 600 }}>Arıza teknik servise iletildi</div>
                <button className="btn btn-ghost btn-xs" style={{ marginTop: '6px' }}
                  onClick={() => setFaultSent(false)}>+ Yeni arıza bildir</button>
              </div>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <div style={{ fontFamily: 'var(--mono)', fontSize: '9px', color: 'var(--text3)', padding: '5px 10px', background: 'var(--surface2)', borderRadius: '5px', border: '1px solid var(--border)' }}>
                📍 {block} Kat {floor} Oda {roomNo}
              </div>
              <textarea
                className="form-textarea"
                rows={2}
                placeholder="Arızayı kısaca açıklayın..."
                value={faultDesc}
                onChange={e => setFaultDesc(e.target.value)}
                style={{ minHeight: '56px' }}
              />
              {/* Priority */}
              <div style={{ display: 'flex', gap: '4px' }}>
                {[
                  { key: 'high', label: 'YÜKSEK', color: 'var(--red)' },
                  { key: 'medium', label: 'ORTA', color: 'var(--accent)' },
                  { key: 'low', label: 'DÜŞÜK', color: 'var(--blue)' },
                ].map(p => (
                  <button key={p.key} type="button" onClick={() => setFaultPriority(p.key)}
                    style={{
                      flex: 1, padding: '6px', borderRadius: '5px', cursor: 'pointer',
                      border: faultPriority === p.key ? `2px solid ${p.color}` : '1px solid var(--border)',
                      background: faultPriority === p.key ? `color-mix(in srgb, ${p.color} 12%, transparent)` : 'transparent',
                      color: faultPriority === p.key ? p.color : 'var(--text3)',
                      fontFamily: 'var(--mono)', fontSize: '9px', fontWeight: 600,
                      transition: 'all .1s',
                    }}>
                    {p.label}
                  </button>
                ))}
              </div>
              {/* Camera / Photo */}
              {faultPreview ? (
                <div style={{ position: 'relative', display: 'inline-block' }}>
                  <img loading="lazy" src={faultPreview} alt="" style={{ maxWidth: '100%', maxHeight: '120px', borderRadius: '6px', border: '1px solid var(--border)', objectFit: 'cover' }} />
                  <button onClick={clearFaultPhoto} style={{
                    position: 'absolute', top: '4px', right: '4px', width: '20px', height: '20px', borderRadius: '50%',
                    background: 'rgba(0,0,0,.7)', color: '#fff', border: 'none', cursor: 'pointer', fontSize: '10px',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}>✕</button>
                </div>
              ) : (
                <div style={{ display: 'flex', gap: '6px' }}>
                  <button type="button" onClick={() => faultCameraRef.current?.click()} style={{
                    flex: 1, padding: '10px 8px', borderRadius: '6px', cursor: 'pointer',
                    border: '1px dashed var(--border)', background: 'rgba(15,23,42,.3)',
                    color: 'var(--text2)', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px',
                    fontFamily: 'var(--mono)', fontSize: '9px', transition: 'all .1s',
                  }}>
                    📷 KAMERA
                  </button>
                  <button type="button" onClick={() => faultFileRef.current?.click()} style={{
                    flex: 1, padding: '10px 8px', borderRadius: '6px', cursor: 'pointer',
                    border: '1px dashed var(--border)', background: 'rgba(15,23,42,.3)',
                    color: 'var(--text2)', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px',
                    fontFamily: 'var(--mono)', fontSize: '9px', transition: 'all .1s',
                  }}>
                    📁 DOSYA
                  </button>
                  <input ref={faultCameraRef} type="file" accept="image/*" capture="environment"
                    style={{ display: 'none' }} onChange={e => handleFaultPhoto(e.target.files?.[0])} />
                  <input ref={faultFileRef} type="file" accept="image/*"
                    style={{ display: 'none' }} onChange={e => handleFaultPhoto(e.target.files?.[0])} />
                </div>
              )}
              <button
                className="btn btn-danger btn-sm"
                onClick={() => mutFault.mutate()}
                disabled={mutFault.isPending || !faultDesc.trim()}
                style={{ opacity: (mutFault.isPending || !faultDesc.trim()) ? 0.5 : 1 }}
              >
                {mutFault.isPending ? 'GÖNDERİLİYOR...' : '⚙ ARIZA BİLDİR'}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
