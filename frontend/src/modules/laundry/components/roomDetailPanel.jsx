import { useState, useMemo, useCallback, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { laundryApi } from '../api.js'
import { BLOCK_BY_NAME } from '../../../shared/blocks.js'
import PersonPanel from './PersonPanel.jsx'
import {
  TlChipGroup, YearHeatmap, HourDayMatrix,
  BlockCompareCard, SlaCard, ItemActionMenu, DamagesCard,
} from './roomsAnalytics.jsx'
import { STATUS_LABEL, STATUS_COLOR, formatRelative } from './roomsShared.js'
import { OccupantRow, PremiumGarmentsCard } from './roomsCards.jsx'
import { InlineNewRecord } from './roomsNewRecord.jsx'
import LaundryCardPanel from '../../laundry-kiosk/LaundryCardPanel.jsx'
import {
  cardGateMessage, cardGateReady, cardRequestFields, emptyLaundryCard, useLaundryCardRequirement,
} from '../laundryCard.js'

export default function RoomDetailPanel({ block, room_no, onClose }) {
  const qc = useQueryClient()
  const { data, isLoading, refetch } = useQuery({
    queryKey: ['laundry-room-detail', block, room_no],
    queryFn: () => laundryApi.getRoomLaundryDetail(block, room_no),
  })
  const [personPanelName, setPersonPanelName] = useState(null)
  const [mode, setMode] = useState('detail')  // 'detail' | 'new'
  const [savedBanner, setSavedBanner] = useState(false)

  const summary = data?.summary || {}
  const items = data?.items || []
  const premiumItems = data?.premium_items || []
  const isYBlock = BLOCK_BY_NAME[block]?.type === 'Y'
  const trend = data?.trend || []
  const byPerson = data?.by_person || []
  const heatmap = data?.heatmap || []
  const hourDay = data?.hour_day || []
  const blockAvg = data?.block_avg || null
  const damages = data?.damages || []
  const slaViolations = data?.sla_violations || []
  const lastBag = data?.last_bag || null

  // Faz 3 — batch + actions
  const [batchMode, setBatchMode] = useState(false)
  const [selectedIds, setSelectedIds] = useState(() => new Set())
  const [actionItem, setActionItem] = useState(null)        // expanded action panel
  const [batchAction, setBatchAction] = useState(null)      // 'deliver' | 'lost'
  const [batchInput, setBatchInput] = useState('')
  const [laundryCard, setLaundryCard] = useState(emptyLaundryCard)
  const { required: cardRequired } = useLaundryCardRequirement('delivery')
  const cardReady = cardGateReady({ required: cardRequired, online: true, value: laundryCard })
  const cardMessage = cardGateMessage({ required: cardRequired, online: true, value: laundryCard })

  useEffect(() => {
    setLaundryCard(emptyLaundryCard())
  }, [actionItem, batchAction, block, room_no])

  // Timeline filtreleri
  const [tlStatus, setTlStatus] = useState('all')   // all | active | delivered | lost
  const [tlType, setTlType]     = useState('all')   // all | urgent | ironing | premium
  const [tlRange, setTlRange]   = useState('all')   // 7 | 30 | 90 | all
  const [tlSearch, setTlSearch] = useState('')

  const toggleSelect = (id) => setSelectedIds(prev => {
    const next = new Set(prev)
    if (next.has(id)) next.delete(id); else next.add(id)
    return next
  })

  const advance = useMutation({
    mutationFn: ({ id }) => laundryApi.advanceItem(id, {}),
    onSuccess: () => { refetch(); qc.invalidateQueries({ queryKey: ['laundry-items'] }); qc.invalidateQueries({ queryKey: ['laundry-rooms-overview'] }); setActionItem(null) },
  })
  const markLost = useMutation({
    mutationFn: ({ id, notes }) => laundryApi.lostItem(id, { notes }),
    onSuccess: () => { refetch(); qc.invalidateQueries({ queryKey: ['laundry-items'] }); qc.invalidateQueries({ queryKey: ['laundry-rooms-overview'] }); setActionItem(null) },
  })
  const deliver = useMutation({
    mutationFn: ({ id, delivered_to }) => laundryApi.deliverItem(id, { delivered_to, ...cardRequestFields(laundryCard) }),
    onSuccess: () => { refetch(); qc.invalidateQueries({ queryKey: ['laundry-items'] }); qc.invalidateQueries({ queryKey: ['laundry-rooms-overview'] }); setActionItem(null); setLaundryCard(emptyLaundryCard()) },
  })
  const batchDeliverMut = useMutation({
    mutationFn: (delivered_to) => laundryApi.batchDeliver({ item_ids: [...selectedIds], delivered_to, ...cardRequestFields(laundryCard) }),
    onSuccess: () => { refetch(); qc.invalidateQueries({ queryKey: ['laundry-items'] }); qc.invalidateQueries({ queryKey: ['laundry-rooms-overview'] }); setSelectedIds(new Set()); setBatchAction(null); setBatchInput(''); setLaundryCard(emptyLaundryCard()) },
  })
  const batchLostMut = useMutation({
    mutationFn: (notes) => laundryApi.batchLost([...selectedIds], notes),
    onSuccess: () => { refetch(); qc.invalidateQueries({ queryKey: ['laundry-items'] }); qc.invalidateQueries({ queryKey: ['laundry-rooms-overview'] }); setSelectedIds(new Set()); setBatchAction(null); setBatchInput('') },
  })
  const occupants = data?.occupants || []

  // Status breakdown
  const byStatus = useMemo(() => {
    const map = {}
    for (const it of items) map[it.status] = (map[it.status] || 0) + 1
    return Object.entries(map).sort((a, b) => b[1] - a[1])
  }, [items])

  // Timeline filtreli liste
  const filteredItems = useMemo(() => {
    let arr = items
    if (tlStatus === 'active')         arr = arr.filter(it => it.status !== 'delivered' && it.status !== 'lost')
    else if (tlStatus === 'delivered') arr = arr.filter(it => it.status === 'delivered')
    else if (tlStatus === 'lost')      arr = arr.filter(it => it.status === 'lost')

    if (tlType === 'urgent')       arr = arr.filter(it => it.urgent)
    else if (tlType === 'ironing') arr = arr.filter(it => it.needs_ironing)
    else if (tlType === 'premium') arr = arr.filter(it => it.is_premium)

    if (tlRange !== 'all') {
      const cutoff = Date.now() - (+tlRange) * 86400000
      arr = arr.filter(it => new Date(it.created_at).getTime() >= cutoff)
    }

    const q = tlSearch.trim().toLowerCase()
    if (q) {
      arr = arr.filter(it =>
        (it.bag_no || '').toLowerCase().includes(q) ||
        (it.intake_name || '').toLowerCase().includes(q) ||
        (it.delivered_name || '').toLowerCase().includes(q) ||
        (it.delivered_to || '').toLowerCase().includes(q) ||
        (it.notes || '').toLowerCase().includes(q) ||
        (it.garments_json || '').toLowerCase().includes(q)
      )
    }
    return arr
  }, [items, tlStatus, tlType, tlRange, tlSearch])

  const tlFilterActive = tlStatus !== 'all' || tlType !== 'all' || tlRange !== 'all' || tlSearch.trim() !== ''

  // 14g sparkline
  // Faz 2 — CSV export (filtre uygulanmışsa filtreliyi, değilse tümünü)
  const exportCsv = useCallback(() => {
    const rows = tlFilterActive ? filteredItems : items
    if (!rows.length) return
    const headers = [
      'bag_no','status','intake_name','intake_at','item_count',
      'urgent','premium','needs_ironing','file_count',
      'delivered_to','delivered_at','total_hours','notes','garments',
    ]
    const escape = (v) => {
      if (v == null) return ''
      const s = String(v).replace(/"/g, '""')
      return /[",\n;]/.test(s) ? `"${s}"` : s
    }
    const lines = [headers.join(',')]
    for (const r of rows) {
      lines.push([
        r.bag_no || `#${r.id}`,
        STATUS_LABEL[r.status] || r.status,
        r.intake_name,
        r.created_at,
        r.item_count,
        r.urgent ? '1' : '',
        r.is_premium ? '1' : '',
        r.needs_ironing ? '1' : '',
        r.file_count ?? '',
        r.delivered_to || r.delivered_name || '',
        r.delivered_at || '',
        r.total_hours ?? '',
        r.notes || '',
        r.garments_json || '',
      ].map(escape).join(','))
    }
    // Excel uyumu için UTF-8 BOM
    const blob = new Blob(['﻿' + lines.join('\n')], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    const stamp = new Date().toISOString().slice(0, 10)
    a.download = `oda-${block}-${room_no}-${stamp}.csv`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }, [items, filteredItems, tlFilterActive, block, room_no])

  const handlePrint = useCallback(() => { window.print() }, [])

  const sparkPoints = useMemo(() => {
    const map = {}
    for (const t of trend) map[t.day] = t.count
    const out = []
    for (let i = 13; i >= 0; i--) {
      const d = new Date()
      d.setDate(d.getDate() - i)
      const k = d.toISOString().slice(0, 10)
      out.push(map[k] || 0)
    }
    return out
  }, [trend])

  return (
    <>
      <div onClick={onClose} className="room-detail-overlay"
        style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 1100 }} />
      <div className="room-detail-panel" style={{
        position: 'fixed', right: 0, top: 0, bottom: 0, width: 560, maxWidth: '96vw',
        background: 'var(--surface)', borderLeft: '1px solid var(--border)', zIndex: 1101,
        display: 'flex', flexDirection: 'column', boxShadow: '-12px 0 36px rgba(0,0,0,0.5)',
      }}>
        {/* Header */}
        <div style={{
          padding: '18px 20px', borderBottom: '1px solid var(--border)',
          background: 'linear-gradient(135deg, rgba(59,130,246,0.06), transparent)',
          display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start',
        }}>
          <div>
            <div style={{ fontFamily: 'var(--display)', fontSize: 30, letterSpacing: 4, color: 'var(--text)', lineHeight: 1 }}>
              {block} · {room_no}
            </div>
            <div style={{ fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--text3)', letterSpacing: 1, marginTop: 6 }}>
              {BLOCK_BY_NAME[block]?.type === 'M' ? 'MERKEZİ · ORTAK BANYO' :
                BLOCK_BY_NAME[block]?.type === 'S' ? 'SOSYAL · ÖZEL BANYO' :
                'YENİ · PREMIUM'}
            </div>
          </div>
          <div style={{ display: 'flex', gap: 4, alignItems: 'center' }} className="rooms-detail-actions">
            <button onClick={exportCsv} disabled={items.length === 0}
              title="CSV indir"
              style={{
                background: 'var(--surface2)', border: '1px solid var(--border)',
                color: items.length ? 'var(--text2)' : 'var(--text3)',
                cursor: items.length ? 'pointer' : 'not-allowed',
                width: 30, height: 30, borderRadius: 6, fontSize: 14,
              }}>📥</button>
            <button onClick={handlePrint}
              title="Yazdır"
              style={{
                background: 'var(--surface2)', border: '1px solid var(--border)',
                color: 'var(--text2)', cursor: 'pointer',
                width: 30, height: 30, borderRadius: 6, fontSize: 14,
              }}>🖨</button>
            <button className="btn btn-ghost btn-xs" onClick={onClose}>✕</button>
          </div>
        </div>

        <div style={{ flex: 1, overflowY: 'auto', padding: 16, display: 'flex', flexDirection: 'column', gap: 14 }}>

          {/* Success banner */}
          {savedBanner && (
            <div style={{
              padding: '10px 14px', borderRadius: 8,
              background: 'rgba(22,163,74,0.1)', border: '1px solid rgba(22,163,74,0.3)',
              fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--green)', fontWeight: 700,
            }}>
              ✓ Kayıt eklendi
            </div>
          )}

          {/* Quick actions */}
          <div className="rooms-detail-no-print" style={{ display: 'flex', gap: 8 }}>
            {mode === 'detail' && (
              <button className="btn btn-primary" onClick={() => setMode('new')} style={{ flex: 1, letterSpacing: 1 }}>
                + YENİ KAYIT
              </button>
            )}
            {mode === 'new' && (
              <button className="btn btn-ghost" onClick={() => setMode('detail')} style={{ flex: 1, letterSpacing: 1 }}>
                ← GERİ
              </button>
            )}
          </div>

          {/* Inline new record */}
          {mode === 'new' && data?.room_id && (
            <InlineNewRecord
              roomId={data.room_id}
              block={block}
              room_no={room_no}
              occupants={data.occupants || []}
              lastBag={lastBag}
              onSaved={() => {
                setMode('detail')
                setSavedBanner(true)
                setTimeout(() => setSavedBanner(false), 2500)
                refetch()
                qc.invalidateQueries({ queryKey: ['laundry-rooms-overview'] })
                qc.invalidateQueries({ queryKey: ['laundry-items'] })
              }}
            />
          )}

          {mode === 'detail' && (<>

          {/* KPI grid */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8 }}>
            {[
              { label: 'TOPLAM',    value: summary.total_given || 0,     color: 'var(--blue)' },
              { label: 'AKTİF',     value: summary.active_count || 0,    color: 'var(--accent)' },
              { label: 'TESLİM',    value: summary.total_delivered || 0, color: 'var(--green)' },
              { label: 'KAYIP',     value: summary.total_lost || 0,      color: (summary.total_lost || 0) > 0 ? 'var(--red)' : 'var(--text3)' },
              { label: 'ORT. SÜRE', value: summary.avg_hours != null ? `${summary.avg_hours}s` : '—', color: '#a78bfa', span: 2 },
              { label: 'SON GİRİŞ', value: summary.last_intake_at ? formatRelative(summary.last_intake_at) : '—', color: 'var(--teal)', span: 2, small: true },
            ].map(k => (
              <div key={k.label} style={{
                background: 'var(--surface2)', border: '1px solid var(--border)',
                borderTop: `2px solid ${k.color}`, borderRadius: 8, padding: '10px 12px',
                gridColumn: k.span ? `span ${k.span}` : undefined,
              }}>
                <div style={{ fontFamily: 'var(--display)', fontSize: k.small ? 14 : 24, color: k.color, lineHeight: 1, marginBottom: 4 }}>
                  {k.value}
                </div>
                <div style={{ fontFamily: 'var(--mono)', fontSize: 8, color: 'var(--text3)', letterSpacing: 1.5 }}>{k.label}</div>
              </div>
            ))}
          </div>

          {/* 14-day trend */}
          <div className="panel" style={{ padding: 12 }}>
            <div style={{ fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--text3)', letterSpacing: 1.5, marginBottom: 8 }}>
              SON 14 GÜN — GİRİŞ TRENDİ
            </div>
            <div style={{ display: 'flex', alignItems: 'flex-end', gap: 3, height: 50 }}>
              {sparkPoints.map((p, i) => {
                const max = Math.max(1, ...sparkPoints)
                return (
                  <div key={i} style={{
                    flex: 1, height: `${(p / max) * 100}%`, minHeight: 2,
                    background: p > 0 ? 'var(--accent3)' : 'var(--border)',
                    borderRadius: 2, position: 'relative',
                  }} title={`${p}`}>
                    {p > 0 && (
                      <span style={{
                        position: 'absolute', top: -14, left: '50%', transform: 'translateX(-50%)',
                        fontSize: 8, fontFamily: 'var(--mono)', color: 'var(--text3)',
                      }}>{p}</span>
                    )}
                  </div>
                )
              })}
            </div>
          </div>

          {/* Faz 4 — Yıllık heatmap */}
          {heatmap.length > 0 && <YearHeatmap points={heatmap} />}

          {/* Faz 4 — Saat × gün matrisi */}
          {hourDay.length > 0 && <HourDayMatrix points={hourDay} />}

          {/* Faz 5 — Blok kıyas */}
          <BlockCompareCard blockAvg={blockAvg} summary={summary} />

          {/* Faz 5 — SLA ihlalleri */}
          <SlaCard violations={slaViolations} />

          {/* Faz 5 — Hasar raporları */}
          <DamagesCard damages={damages} />

          {/* Faz 3 — Y blok premium parça listesi */}
          {isYBlock && premiumItems.length > 0 && (
            <PremiumGarmentsCard items={premiumItems} />
          )}

          {/* Status breakdown */}
          {byStatus.length > 0 && (
            <div className="panel" style={{ padding: 12 }}>
              <div style={{ fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--text3)', letterSpacing: 1.5, marginBottom: 8 }}>
                DURUM DAĞILIMI
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {byStatus.map(([k, v]) => (
                  <div key={k} style={{
                    display: 'flex', alignItems: 'center', gap: 4,
                    background: 'var(--surface2)', borderRadius: 4, padding: '3px 8px',
                    border: `1px solid ${STATUS_COLOR[k] || 'var(--border)'}`,
                  }}>
                    <span style={{ fontFamily: 'var(--mono)', fontSize: 10, color: STATUS_COLOR[k] || 'var(--text3)', fontWeight: 700 }}>{v}</span>
                    <span style={{ fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--text3)' }}>{STATUS_LABEL[k] || k}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Occupants */}
          {occupants.length > 0 && (
            <div className="panel" style={{ padding: 12 }}>
              <div style={{ fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--text3)', letterSpacing: 1.5, marginBottom: 8 }}>
                ODA SAKİNLERİ ({occupants.length})
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                {occupants.map(p => {
                  const stats = byPerson.find(bp => bp.name === p.full_name)
                  return (
                    <OccupantRow key={p.id} occupant={p} stats={stats}
                      block={block} room_no={room_no}
                      onOpenHistory={() => setPersonPanelName(p.full_name)} />
                  )
                })}
              </div>
              {byPerson.some(bp => !occupants.find(o => o.full_name === bp.name)) && (
                <div style={{ marginTop: 8, fontFamily: 'var(--mono)', fontSize: 8, color: 'var(--text3)', letterSpacing: 1 }}>
                  GEÇMİŞTE TESLİM EDEN (artık odada değil)
                </div>
              )}
              {byPerson.filter(bp => !occupants.find(o => o.full_name === bp.name)).map(bp => (
                <button key={bp.name} onClick={() => setPersonPanelName(bp.name)}
                  style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    background: 'transparent', border: '1px dashed var(--border)',
                    borderRadius: 6, padding: '6px 10px', cursor: 'pointer', textAlign: 'left',
                    marginTop: 4,
                  }}>
                  <span style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--text2)', opacity: 0.7 }}>{bp.name}</span>
                  <span style={{ fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--text3)' }}>{bp.total} torba</span>
                </button>
              ))}
            </div>
          )}

          {/* Timeline + batch mode + per-item actions (Faz 3) */}
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
              <div style={{ fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--text3)', letterSpacing: 1.5 }}>
                TÜM GEÇMİŞ ({tlFilterActive ? `${filteredItems.length}/${items.length}` : items.length})
              </div>
              <button onClick={() => { setBatchMode(b => !b); setSelectedIds(new Set()); setBatchAction(null) }}
                className="rooms-detail-no-print"
                style={{
                  fontFamily: 'var(--mono)', fontSize: 9, padding: '3px 8px', cursor: 'pointer',
                  background: batchMode ? 'rgba(240,165,0,0.18)' : 'var(--surface2)',
                  border: `1px solid ${batchMode ? 'rgba(240,165,0,0.4)' : 'var(--border)'}`,
                  color: batchMode ? 'var(--accent)' : 'var(--text3)', borderRadius: 4, letterSpacing: 1,
                }}>
                {batchMode ? '✓ TOPLU' : '☐ TOPLU SEÇ'}
              </button>
            </div>

            {/* Faz 1 — Timeline filtre çubuğu */}
            {items.length > 0 && (
              <div className="rooms-detail-no-print" style={{
                display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center',
                marginBottom: 8, padding: '8px 10px',
                background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 6,
              }}>
                <TlChipGroup value={tlStatus} onChange={setTlStatus} options={[
                  ['all', 'Tümü'], ['active', 'Aktif'], ['delivered', 'Teslim'], ['lost', 'Kayıp'],
                ]} />
                <span style={{ width: 1, height: 16, background: 'var(--border)' }} />
                <TlChipGroup value={tlType} onChange={setTlType} options={[
                  ['all', '·'], ['urgent', '⚡'], ['ironing', '🫧'], ['premium', '🟣'],
                ]} />
                <span style={{ width: 1, height: 16, background: 'var(--border)' }} />
                <TlChipGroup value={tlRange} onChange={setTlRange} options={[
                  ['all', 'Hepsi'], ['7', '7G'], ['30', '30G'], ['90', '90G'],
                ]} />
                <input value={tlSearch} onChange={e => setTlSearch(e.target.value)}
                  placeholder="Ara…"
                  className="form-input"
                  style={{ flex: '1 1 100px', minWidth: 80, height: 24, padding: '2px 8px', fontSize: 10, marginLeft: 'auto' }} />
                {tlFilterActive && (
                  <button onClick={() => { setTlStatus('all'); setTlType('all'); setTlRange('all'); setTlSearch('') }}
                    title="Filtreleri temizle"
                    style={{
                      background: 'transparent', border: '1px solid var(--border)', borderRadius: 4,
                      color: 'var(--text3)', cursor: 'pointer', fontSize: 10, padding: '2px 6px',
                    }}>✕</button>
                )}
              </div>
            )}

            {/* Batch action bar */}
            {batchMode && selectedIds.size > 0 && (
              <div className="panel rooms-detail-no-print" style={{
                padding: 10, marginBottom: 8, background: 'rgba(240,165,0,0.05)',
                border: '1px solid rgba(240,165,0,0.2)',
                display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center',
              }}>
                <span style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--accent)', fontWeight: 700 }}>
                  {selectedIds.size} seçili
                </span>
                {batchAction === null && (
                  <>
                    <button onClick={() => setBatchAction('deliver')} className="btn btn-primary btn-xs" style={{ marginLeft: 'auto' }}>
                      🚚 Toplu Teslim
                    </button>
                    <button onClick={() => setBatchAction('lost')} className="btn btn-ghost btn-xs" style={{ color: 'var(--red)' }}>
                      ✕ Toplu Kayıp
                    </button>
                  </>
                )}
                {batchAction === 'deliver' && (
                  <>
                    <div style={{ flexBasis: '100%' }}>
                      <LaundryCardPanel
                        action="delivery"
                        required={cardRequired}
                        room={{ item_id: [...selectedIds][0] }}
                        verifyCard={laundryApi.verifyCard}
                        value={laundryCard}
                        onChange={setLaundryCard}
                        resetKey={`batch-${block}-${room_no}`}
                        captureHid
                      />
                    </div>
                    <input className="form-input" value={batchInput} autoFocus
                      onChange={e => setBatchInput(e.target.value)}
                      placeholder="Teslim alan adı..."
                      style={{ flex: 1, minWidth: 120, height: 28, fontSize: 11 }} />
                    <button onClick={() => batchInput.trim() && batchDeliverMut.mutate(batchInput.trim())}
                      disabled={!batchInput.trim() || !cardReady || batchDeliverMut.isPending}
                      className="btn btn-primary btn-xs">✓ Teslim et</button>
                    <button onClick={() => { setBatchAction(null); setBatchInput('') }} className="btn btn-ghost btn-xs">İptal</button>
                  </>
                )}
                {batchAction === 'lost' && (
                  <>
                    <input className="form-input" value={batchInput} autoFocus
                      onChange={e => setBatchInput(e.target.value)}
                      placeholder="Kayıp notu (opsiyonel)..."
                      style={{ flex: 1, minWidth: 120, height: 28, fontSize: 11 }} />
                    <button onClick={() => batchLostMut.mutate(batchInput.trim() || null)}
                      disabled={batchLostMut.isPending}
                      className="btn btn-ghost btn-xs" style={{ color: 'var(--red)', borderColor: 'var(--red)' }}>
                      ✕ Kayıp işaretle
                    </button>
                    <button onClick={() => { setBatchAction(null); setBatchInput('') }} className="btn btn-ghost btn-xs">İptal</button>
                  </>
                )}
              </div>
            )}

            {isLoading && <div style={{ color: 'var(--text3)', fontSize: 11 }}>Yükleniyor…</div>}
            {!isLoading && items.length === 0 && (
              <div style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--text3)', textAlign: 'center', padding: 20 }}>
                Bu oda için kayıt yok
              </div>
            )}
            {!isLoading && items.length > 0 && filteredItems.length === 0 && (
              <div style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--text3)', textAlign: 'center', padding: 20 }}>
                Filtreye uyan kayıt yok
              </div>
            )}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {filteredItems.map(it => {
                const selected = selectedIds.has(it.id)
                const expanded = actionItem === it.id
                const isFinal = it.status === 'delivered' || it.status === 'lost'
                return (
                  <div key={it.id} style={{
                    background: selected ? 'rgba(240,165,0,0.10)' : 'var(--surface2)',
                    borderRadius: 6, padding: '8px 12px',
                    borderLeft: `3px solid ${STATUS_COLOR[it.status] || 'var(--border)'}`,
                    border: selected ? '1px solid rgba(240,165,0,0.4)' : '1px solid transparent',
                    cursor: batchMode || !isFinal ? 'pointer' : 'default',
                  }}
                  onClick={() => {
                    if (batchMode) toggleSelect(it.id)
                    else if (!isFinal) setActionItem(expanded ? null : it.id)
                  }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 3 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        {batchMode && (
                          <input type="checkbox" checked={selected} readOnly
                            style={{ width: 14, height: 14, accentColor: 'var(--accent)' }} />
                        )}
                        <span style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--blue)' }}>
                          {it.bag_no || `#${it.id}`}
                        </span>
                      </div>
                      <span style={{
                        fontFamily: 'var(--mono)', fontSize: 8, padding: '1px 6px', borderRadius: 3,
                        background: 'var(--surface)', color: STATUS_COLOR[it.status] || 'var(--text3)',
                        fontWeight: 700, letterSpacing: 1,
                      }}>
                        {STATUS_LABEL[it.status] || it.status}
                      </span>
                    </div>
                    <div style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--text)' }}>
                      {it.item_count} parça
                      {it.is_premium ? ' · 🟣' : ''}
                      {it.urgent ? ' · ⚡' : ''}
                      {it.needs_ironing ? ' · 🫧' : ''}
                      {it.file_count != null && it.file_count > 0 ? ` · ${it.file_count} file teslim` : ''}
                      {it.total_hours != null && ` · ${it.total_hours}s`}
                    </div>
                    {it.intake_name && (
                      <div style={{ fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--text2)', marginTop: 2 }}>
                        👤 <button onClick={(e) => { e.stopPropagation(); setPersonPanelName(it.intake_name) }}
                          style={{ background: 'none', border: 'none', color: 'var(--accent)', cursor: 'pointer', fontFamily: 'inherit', fontSize: 'inherit', padding: 0 }}>
                          {it.intake_name}
                        </button>
                      </div>
                    )}
                    {it.notes && (
                      <div style={{ fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--accent)', marginTop: 2, fontStyle: 'italic', whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                        📝 {it.notes}
                      </div>
                    )}
                    <div style={{ fontFamily: 'var(--mono)', fontSize: 8, color: 'var(--text3)', marginTop: 3 }}>
                      {new Date(it.created_at).toLocaleString('tr-TR', { day: '2-digit', month: 'short', year: '2-digit', hour: '2-digit', minute: '2-digit' })}
                      {it.delivered_at && ` → teslim ${new Date(it.delivered_at).toLocaleString('tr-TR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}`}
                    </div>

                    {/* Per-item action menu (Faz 3) */}
                    {expanded && !batchMode && (
                      <>
                        {it.status === 'ready' && (
                          <LaundryCardPanel
                            action="delivery"
                            required={cardRequired}
                            room={{ item_id: it.id }}
                            verifyCard={laundryApi.verifyCard}
                            value={laundryCard}
                            onChange={setLaundryCard}
                            resetKey={it.id}
                            captureHid
                          />
                        )}
                        <ItemActionMenu
                          item={it}
                          onAdvance={() => advance.mutate({ id: it.id })}
                          onDeliver={(name) => deliver.mutate({ id: it.id, delivered_to: name })}
                          onLost={(note) => markLost.mutate({ id: it.id, notes: note })}
                          onClose={() => setActionItem(null)}
                          deliverDisabled={!cardReady}
                          deliverDisabledMessage={cardMessage}
                        />
                      </>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
          </>)}
        </div>
      </div>

      {personPanelName && <PersonPanel name={personPanelName} onClose={() => setPersonPanelName(null)} />}
    </>
  )
}
