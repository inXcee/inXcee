import { useState, useMemo, useEffect, useRef } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { laundryApi } from './api.js'
import HelpHint from '../../shared/components/HelpHint.jsx'
import LaundryReport from './LaundryReport.jsx'
import LaundrySettings from './LaundrySettings.jsx'
import { useLaundrySSE } from '../../shared/hooks/useLaundrySSE.js'
import { confirmDialog } from '../../shared/components/ConfirmDialog.jsx'
import { inputDialog } from '../../shared/components/InputDialog.jsx'
import {
  DndContext,
  PointerSensor,
  useSensor,
  useSensors,
  DragOverlay,
} from '@dnd-kit/core'

import { useUndoStore }   from '../../shared/store/useUndoStore.js'
import { useToastStore }  from '../../shared/store/toastStore.js'
import UndoPanel          from './components/UndoPanel.jsx'
import SupplyWidget       from './components/SupplyWidget.jsx'
import MachineStrip       from './components/MachineStrip.jsx'
import SlaAlert           from './components/SlaAlert.jsx'
import ItemCard           from './components/ItemCard.jsx'
import NewItemModal from './components/NewItemModal.jsx'
import RoomsSection from './components/RoomsSection.jsx'
import DeliveryModal      from './components/DeliveryModal.jsx'
import DamageModal        from './components/DamageModal.jsx'
import MachineManagerPanel from './components/MachineManagerPanel.jsx'
import PersonPanel         from './components/PersonPanel.jsx'
import FoundModal          from './components/FoundModal.jsx'
import BatchAssignModal         from './components/BatchAssignModal.jsx'
import ItemVerificationModal    from './components/ItemVerificationModal.jsx'
import ArchiveTable             from './components/ArchiveTable.jsx'
import ArchiveDetailPanel       from './components/ArchiveDetailPanel.jsx'
import LaundryChat              from './components/LaundryChat.jsx'
import PremiumSearchPanel       from './components/PremiumSearchPanel.jsx'
import GarmentScanModal         from './components/GarmentScanModal.jsx'
import QuickNotes              from './components/QuickNotes.jsx'
import DeliveredTodaySection   from './components/DeliveredTodaySection.jsx'
import QuickAdd                from './components/QuickAdd.jsx'
import FullRecordsView         from './components/FullRecordsView.jsx'
import { KanbanCard, KanbanCol } from './components/KanbanBoard.jsx'

// ── Filter config ──────────────────────────────────────────────
const FILTERS = [
  { key: 'all',     label: 'Tümü',    dot: null },
  { key: 'dirty',   label: 'Sepet',   dot: 'var(--accent)' },
  { key: 'washing', label: 'Yıkama',  dot: 'var(--blue)' },
  { key: 'ready',   label: 'Hazır',   dot: 'var(--green)' },
  { key: 'urgent',  label: 'Acil',    dot: 'var(--red)' },
  { key: 'sla',     label: 'SLA',     dot: 'var(--red)' },
  { key: 'lost',    label: 'Kayıp',   dot: 'var(--text3)' },
]

// ── LaundryHub ─────────────────────────────────────────────────
export default function LaundryHub({ defaultView = 'kanban' }) {
  useLaundrySSE()

  const qc = useQueryClient()

  const [section,        setSection]        = useState('hub') // 'hub' | 'records' | 'reports' | 'settings'
  const [view,           setView]           = useState(defaultView)
  const [filter,         setFilter]         = useState('all')
  const [search,         setSearch]         = useState('')
  const [showNew,        setShowNew]        = useState(false)
  const [newRoomPrefill, setNewRoomPrefill] = useState(null) // { block, room_no } | null
  const [deliverItem,    setDeliverItem]    = useState(null)
  const [damageItem,     setDamageItem]     = useState(null)
  const [showMachines,   setShowMachines]   = useState(true)
  const [showMgr,        setShowMgr]        = useState(false)
  const [batchMode,      setBatchMode]      = useState(false)
  const [selectedIds,    setSelectedIds]    = useState(new Set())
  const [showBatchAssign, setShowBatchAssign] = useState(false)
  const [verificationTarget, setVerificationTarget] = useState(null)
  const [archiveSelectedItem, setArchiveSelectedItem] = useState(null)
  const [groupByRoom,    setGroupByRoom]    = useState(
    () => localStorage.getItem('laundry_group_by_room') === '1'
  )
  const [personPanelName, setPersonPanelName] = useState(null)
  const [foundItem,      setFoundItem]      = useState(null)
  const [activeItem,     setActiveItem]     = useState(null)
  const [overCol,        setOverCol]        = useState(null)
  const [showQuickAdd,   setShowQuickAdd]   = useState(false)
  const [showScanModal,  setShowScanModal]  = useState(false)
  const [filterBlock,    setFilterBlock]    = useState('all')  // 'all' | 'A' | 'B' | 'S2'
  const [filterUrgent,   setFilterUrgent]   = useState(false)
  const [undoPanelOpen,  setUndoPanelOpen]  = useState(false)

  const pushUndo   = useUndoStore(s => s.push)
  const removeUndo = useUndoStore(s => s.remove)
  const addToast   = useToastStore(s => s.addToast)

  useEffect(() => {
    const handler = (e) => {
      if (e.detail?.action === 'open-new-laundry') setShowNew(true)
    }
    window.addEventListener('yys:open-modal', handler)
    return () => window.removeEventListener('yys:open-modal', handler)
  }, [])

  useEffect(() => {
    const handleKey = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !e.shiftKey) {
        e.preventDefault()
        setUndoPanelOpen(prev => !prev)
      }
    }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [])

  const sensors = useSensors(useSensor(PointerSensor, {
    activationConstraint: { distance: 8 },
  }))

  const STATUS_TR = { washing: 'Yıkamaya atandı', ironing: 'Ütüye alındı', ready: 'Rafa alındı', delivered: 'Teslim edildi' }

  const advanceWithUndo = (item, extra = {}) => {
    const prevStatus = item.status
    return laundryApi.advanceItem(item.id, extra)
      .then(newItem => {
        qc.invalidateQueries({ queryKey: ['laundry-items'] })
        const label = `Oda ${newItem.room_no} — ${STATUS_TR[newItem.status] || newItem.status}`
        const entryId = pushUndo({
          label,
          undo: async () => {
            await laundryApi.revertItem(item.id, prevStatus)
            qc.invalidateQueries({ queryKey: ['laundry-items'] })
          },
        })
        addToast(label, 'success', async () => {
          try {
            await laundryApi.revertItem(item.id, prevStatus)
            qc.invalidateQueries({ queryKey: ['laundry-items'] })
            removeUndo(entryId)
            addToast('Geri alındı', 'info')
          } catch (err) {
            addToast(err?.response?.data?.error || 'Geri alma başarısız', 'error')
          }
        })
        return newItem
      })
      .catch(err => {
        addToast(err?.response?.data?.message || 'İşlem başarısız', 'error')
      })
  }

  const handleDragStart = ({ active }) => {
    setActiveItem(active.data.current.item)
  }

  const handleDragOver = ({ over }) => {
    setOverCol(over?.id || null)
  }

  const handleDragEnd = ({ active, over }) => {
    setActiveItem(null); setOverCol(null)
    if (!over) return
    const item = active.data.current.item
    const targetStatus = over.id
    if (item.status === targetStatus) return

    const FORWARD = { dirty: 'washing', washing: 'ready', ironing: 'ready' }
    const BACKWARD = { washing: ['dirty'], ready: ['washing', 'dirty'], ironing: ['washing', 'dirty'] }

    // Özel durum: ütü gereken item washing → ironing sütununa sürüklenebilir
    if (item.status === 'washing' && targetStatus === 'ironing' && item.needs_ironing) {
      if (item.clothing_items) {
        setVerificationTarget({ item, stage: 'washing_to_ready' })
      } else {
        advanceWithUndo(item, {})
      }
      return
    }

    if (FORWARD[item.status] === targetStatus) {
      // İleri geçiş
      if (item.status === 'dirty') {
        const idleMachine = machines.find(m => m.status === 'idle')
        if (!idleMachine) { addToast('Boş makine yok — kart butonunu kullan', 'warning'); return }
        advanceWithUndo(item, { machine_id: idleMachine.id })
      } else if ((item.status === 'washing' && !item.needs_ironing) || item.status === 'ironing') {
        // Doğrulama gereken geçiş: washing→ready veya ironing→ready
        if (item.clothing_items) {
          const stage = item.status === 'washing' ? 'washing_to_ready' : 'ironing_to_ready'
          setVerificationTarget({ item, stage })
        } else {
          advanceWithUndo(item, {})
        }
      } else {
        advanceWithUndo(item, {})
      }
    } else if (BACKWARD[item.status]?.includes(targetStatus)) {
      // Geri geçiş
      laundryApi.revertItem(item.id, targetStatus)
        .then(() => qc.invalidateQueries({ queryKey: ['laundry-items'] }))
        .catch(err => addToast(err?.response?.data?.message || 'Geri alma başarısız', 'error'))
    }
  }

  const { data: allItems = [] } = useQuery({
    queryKey: ['laundry-items', 'all'],
    queryFn: () => laundryApi.getItems({}),
    refetchInterval: 20000,
    placeholderData: (prev) => prev,
  })
  const { data: machines = [] } = useQuery({
    queryKey: ['laundry-machines'],
    queryFn: laundryApi.getMachines,
    refetchInterval: 15000,
  })
  const { data: violations = [] } = useQuery({
    queryKey: ['laundry-sla'],
    queryFn: laundryApi.getSlaViolations,
    refetchInterval: 60000,
  })
  const { data: preWarnings = [] } = useQuery({
    queryKey: ['laundry-sla-pre-warnings'],
    queryFn: laundryApi.getSlaPreWarnings,
    refetchInterval: 60_000,
  })
  const { data: stats } = useQuery({
    queryKey: ['laundry-stats'],
    queryFn: () => laundryApi.getStats({}),
    refetchInterval: 60000,
  })
  const { data: laundrySettings = {} } = useQuery({
    queryKey: ['laundry-settings'],
    queryFn: laundryApi.getLaundrySettings,
    staleTime: 30_000,
  })
  const { data: chatMessages = [] } = useQuery({
    queryKey: ['laundry-messages'],
    queryFn: laundryApi.getMessages,
    refetchInterval: 30_000,
  })
  const unreadMsgCount = useMemo(() => {
    const lastSeen = parseInt(localStorage.getItem('laundry_last_seen_msg') || '0')
    return chatMessages.filter(m => m.id > lastSeen).length
  }, [chatMessages])

  // Filtered items for both views
  const { data: listItems = [], isLoading } = useQuery({
    queryKey: ['laundry-items', filter, search],
    queryFn: () => {
      const params = {}
      if (filter === 'urgent') params.urgent = '1'
      else if (filter === 'sla') params.sla_only = '1'
      else if (filter !== 'all') params.status = filter
      if (search) params.search = search
      return laundryApi.getItems(params)
    },
    refetchInterval: 20000,
    placeholderData: (prev) => prev,
  })

  // Kanban: always use allItems filtered by status (no extra filter applied)
  const kanbanItems = useMemo(() => {
    let list = allItems
    if (search) {
      const q = search.toLowerCase()
      list = list.filter(i =>
        `${i.block} ${i.room_no} ${i.notes || ''} ${i.occupant_name || ''}`.toLowerCase().includes(q)
      )
    }
    if (filterBlock !== 'all') {
      list = list.filter(i => i.block === filterBlock)
    }
    if (filterUrgent) {
      list = list.filter(i => !!i.urgent)
    }
    return list
  }, [allItems, search, filterBlock, filterUrgent])

  const pending = kanbanItems.filter(i => i.status === 'pending_collection')
  const dirty   = kanbanItems.filter(i => i.status === 'dirty')
  const washing = kanbanItems.filter(i => i.status === 'washing')
  const ironing = kanbanItems.filter(i => i.status === 'ironing')
  const ready   = kanbanItems.filter(i => i.status === 'ready')
  const lost    = allItems.filter(i => i.status === 'lost')

  const colEmptyLabel = (filterBlock !== 'all' || filterUrgent || !!search.trim()) ? 'filtre sonucu boş' : 'boş'

  const counts = {
    pending: allItems.filter(i => i.status === 'pending_collection').length,
    dirty:   allItems.filter(i => i.status === 'dirty').length,
    washing: allItems.filter(i => i.status === 'washing').length,
    ironing: allItems.filter(i => i.status === 'ironing').length,
    ready:   allItems.filter(i => i.status === 'ready').length,
    sla:     violations.length,
    lost:    allItems.filter(i => i.status === 'lost').length,
  }
  const activeTotal = counts.pending + counts.dirty + counts.washing + counts.ironing + counts.ready

  const toggleSelect = (id) => {
    setSelectedIds(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  const selectBlock = (blockItems) => {
    setSelectedIds(prev => {
      const next = new Set(prev)
      const allSelected = blockItems.every(item => prev.has(item.id))
      if (allSelected) blockItems.forEach(item => next.delete(item.id))
      else blockItems.forEach(item => next.add(item.id))
      return next
    })
  }

  const handleBatchDeliver = async () => {
    const name = await inputDialog({
      title: 'Toplu Teslim',
      body: `${selectedIds.size} kaydı kime teslim ediyorsunuz?`,
      placeholder: 'Alıcı adı',
    })
    if (!name) return
    laundryApi.batchDeliver({ item_ids: [...selectedIds], delivered_to: name })
      .then(() => {
        qc.invalidateQueries({ queryKey: ['laundry-items'] })
        setSelectedIds(new Set())
        setBatchMode(false)
        addToast(`${selectedIds.size} kayıt teslim edildi`, 'success')
      })
      .catch(err => addToast(err?.response?.data?.error || 'Toplu teslim başarısız', 'error'))
  }

  const handleBatchLost = async () => {
    const ok = await confirmDialog({
      title: 'Kayıp İşaretle',
      body: `${selectedIds.size} kaydı kayıp işaretlemek istediğinize emin misiniz?`,
      danger: true,
    })
    if (!ok) return
    laundryApi.batchLost([...selectedIds], null)
      .then(() => {
        qc.invalidateQueries({ queryKey: ['laundry-items'] })
        setSelectedIds(new Set())
        setBatchMode(false)
        addToast(`${selectedIds.size} kayıt kayıp olarak işaretlendi`, 'success')
      })
      .catch(err => addToast(err?.response?.data?.error || 'Toplu kayıp işaretleme başarısız', 'error'))
  }

  const toggleGroupByRoom = () => {
    setGroupByRoom(v => {
      localStorage.setItem('laundry_group_by_room', v ? '0' : '1')
      return !v
    })
  }

  const washedTodayColor = useMemo(() => {
    const goal = parseInt(laundrySettings.daily_goal || '50')
    const val = stats?.washed_today?.count ?? 0
    return val >= goal ? 'var(--green)' : 'var(--blue)'
  }, [stats?.washed_today?.count, laundrySettings.daily_goal])

  const today = new Date().toLocaleDateString('tr-TR', { day: '2-digit', month: 'long', year: 'numeric' })

  return (
    <div style={{ maxWidth: view === 'kanban' ? 1600 : 1000, position: 'relative', zIndex: 1 }} className="fade-up">

      {/* ── HEADER ── */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 }}>
        <div>
          <h1 style={{ fontFamily: 'var(--display)', fontSize: 36, letterSpacing: 5, color: 'var(--text)', lineHeight: 1, marginBottom: 8 }}>
            ÇAMAŞIRHANE<HelpHint topic="laundry" title="ÇAMAŞIRHANE" />
          </h1>
          {/* Section tabs */}
          <div style={{ display: 'flex', gap: 4 }}>
            {[
              { key: 'hub',      label: '⊞ Kontrol' },
              { key: 'rooms',    label: '▦ Odalar' },
              { key: 'records',  label: '≡ Kayıtlar' },
              { key: 'archive',       label: '▣ Arşiv' },
              { key: 'premium-search', label: '◎ Kıyafet Listesi' },
              { key: 'reports',       label: '◈ Raporlar' },
              { key: 'settings', label: '⚙ Ayarlar' },
            ].map(s => (
              <button key={s.key}
                onClick={() => setSection(s.key)}
                style={{
                  padding: '4px 12px', borderRadius: 6, cursor: 'pointer',
                  fontFamily: 'var(--mono)', fontSize: 11, letterSpacing: 1,
                  background: section === s.key ? 'rgba(240,165,0,0.12)' : 'transparent',
                  border: `1px solid ${section === s.key ? 'rgba(240,165,0,0.3)' : 'var(--border)'}`,
                  color: section === s.key ? 'var(--accent)' : 'var(--text3)',
                  transition: 'all 0.15s',
                  display: 'flex', alignItems: 'center', gap: 5, position: 'relative',
                }}
              >
                {s.label}
                {s.key === 'hub' && unreadMsgCount > 0 && section !== 'hub' && (
                  <span style={{
                    background: 'var(--red)', color: '#fff',
                    fontFamily: 'var(--mono)', fontSize: 7, fontWeight: 700,
                    padding: '1px 4px', borderRadius: 4, lineHeight: 1.4,
                  }}>{unreadMsgCount}</span>
                )}
              </button>
            ))}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          {section === 'hub' && (
            <>
              <button className="btn btn-ghost btn-xs"
                onClick={() => setShowQuickAdd(s => !s)}
                style={{
                  border: `1px solid ${showQuickAdd ? 'rgba(240,165,0,0.3)' : 'var(--border)'}`,
                  color: showQuickAdd ? 'var(--accent)' : 'var(--text3)',
                }}
              >
                ⚡ Hızlı Ekle
              </button>
              <button className="btn btn-ghost btn-xs"
                onClick={() => setShowScanModal(true)}
                style={{ border: '1px solid var(--border)', color: 'var(--text3)' }}
              >
                ⊡ Oda Tara
              </button>
              <button className="btn btn-primary" onClick={() => setShowNew(true)} style={{ letterSpacing: 1 }}>
                + Yeni Kayıt
              </button>
            </>
          )}
        </div>
      </div>

      {section === 'hub' && (<>

      {showQuickAdd && <QuickAdd onClose={() => setShowQuickAdd(false)} />}

      {/* ── SLA ── */}
      <SlaAlert violations={violations} preWarnings={preWarnings} />

      {/* ── KPI STRIP ── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: 8, marginBottom: 16 }}>
        {[
          { label: 'Sepette',      value: counts.dirty,                         color: 'var(--accent)', sub: activeTotal > 0 ? (counts.dirty / activeTotal) * 100 : 0 },
          { label: 'Yıkaniyor',    value: counts.washing,                       color: 'var(--blue)',   sub: activeTotal > 0 ? (counts.washing / activeTotal) * 100 : 0 },
          { label: 'Rafta Hazır',  value: counts.ready,                         color: 'var(--green)',  sub: activeTotal > 0 ? (counts.ready / activeTotal) * 100 : 0 },
          { label: 'SLA İhlali',   value: violations.length,                    color: 'var(--red)',    sub: null },
          { label: 'Bugün Teslim', value: stats?.delivered_today?.count ?? 0,   color: 'var(--teal)',   sub: null },
          {
            label: 'Bugün Yıkamaya',
            value: stats?.washed_today?.count ?? 0,
            color: washedTodayColor,
            sub: null,
          },
        ].map(s => (
          <div key={s.label} style={{
            background: 'var(--surface)', border: '1px solid var(--border)',
            borderTop: `2px solid ${s.color}`, borderRadius: 10,
            padding: '14px 14px 12px', position: 'relative', overflow: 'hidden',
            transition: 'transform 0.15s',
          }}
            onMouseEnter={e => e.currentTarget.style.transform = 'translateY(-2px)'}
            onMouseLeave={e => e.currentTarget.style.transform = ''}
          >
            <div style={{ position: 'absolute', top: -20, right: -20, width: 70, height: 70, borderRadius: '50%', background: s.color, opacity: 0.04 }} />
            <div style={{ fontFamily: 'var(--display)', fontSize: 52, letterSpacing: 2, color: s.color, lineHeight: 1, marginBottom: 6 }}>
              {s.value}
            </div>
            <div style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: 2 }}>
              {s.label}
            </div>
            {s.sub != null && (
              <div style={{ marginTop: 8, height: 2, background: 'var(--border)', borderRadius: 1, overflow: 'hidden' }}>
                <div style={{ height: '100%', width: `${Math.min(100, s.sub)}%`, background: s.color, opacity: 0.6, borderRadius: 1, transition: 'width 0.8s ease' }} />
              </div>
            )}
          </div>
        ))}
      </div>

      {/* ── NOTLAR ── */}
      <QuickNotes />

      {/* ── MAKİNELER ── */}
      <div style={{ marginBottom: 14 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: showMachines ? 10 : 0 }}>
          <button onClick={() => setShowMachines(s => !s)} style={{
            display: 'flex', alignItems: 'center', gap: 6,
            background: 'none', border: 'none', cursor: 'pointer',
            fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--text3)', letterSpacing: 2, padding: 0,
          }}>
            <span style={{ transition: 'transform 0.2s', display: 'inline-block', transform: showMachines ? 'rotate(90deg)' : '' }}>›</span>
            MAKİNELER
          </button>
          {machines.filter(m => m.status === 'running').length > 0 && (
            <span style={{ fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--accent)' }}>
              {machines.filter(m => m.status === 'running').length} çalışıyor
            </span>
          )}
          {machines.filter(m => m.status === 'done').length > 0 && (
            <span style={{ fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--red)' }}>
              · {machines.filter(m => m.status === 'done').length} bekleniyor
            </span>
          )}
          <div style={{ flex: 1, height: 1, background: 'var(--border)' }} />
          <button onClick={() => setShowMgr(true)} style={{
            padding: '4px 10px', borderRadius: 6, cursor: 'pointer',
            background: 'transparent', border: '1px solid var(--border)',
            color: 'var(--text3)', fontFamily: 'var(--mono)', fontSize: 8, letterSpacing: 1,
          }}>
            Yönet
          </button>
        </div>
        {showMachines && <MachineStrip machines={machines} hideHeader />}
        <SupplyWidget onNavigateSettings={() => setSection('settings')} />
      </div>

      {/* ── TOOLBAR: SEARCH + FILTERS + VIEW TOGGLE ── */}
      <div style={{
        display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap', alignItems: 'center',
        position: 'sticky', top: 0, zIndex: 10,
        background: 'var(--bg)', paddingTop: 6, paddingBottom: 6,
      }}>
        <input
          className="form-input"
          style={{ width: 200, padding: '6px 11px', fontSize: 11 }}
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Ara (oda, kişi, not)…"
        />

        {view === 'kanban' && (<>
          {/* Blok filtresi */}
          <select
            value={filterBlock}
            onChange={e => setFilterBlock(e.target.value)}
            className="form-input"
            style={{ width: 110, padding: '6px 8px', fontSize: 11, cursor: 'pointer' }}
          >
            <option value="all">Tüm Bloklar</option>
            <option value="A">A Blok</option>
            <option value="B">B Blok</option>
            <option value="S2">S2</option>
          </select>

          {/* Acil toggle */}
          <button
            onClick={() => setFilterUrgent(v => !v)}
            className="btn btn-ghost btn-xs"
            aria-pressed={filterUrgent}
            style={{
              border: `1px solid ${filterUrgent ? 'rgba(231,76,60,0.6)' : 'var(--border)'}`,
              background: filterUrgent ? 'rgba(231,76,60,0.12)' : 'transparent',
              color: filterUrgent ? 'var(--red)' : 'var(--text3)',
              fontWeight: filterUrgent ? 700 : 400,
            }}
          >
            <span aria-hidden="true">⚠</span> Acil
          </button>

          {/* Aktif filtre badge */}
          {(filterBlock !== 'all' || filterUrgent || !!search.trim()) && (
            <span style={{
              fontSize: 9, fontFamily: 'var(--mono)', letterSpacing: 1,
              color: 'var(--accent)', textTransform: 'uppercase', opacity: 0.8,
              alignSelf: 'center',
            }}>
              Filtre aktif
            </span>
          )}
        </>)}

        <div style={{ display: 'flex', gap: 4, flex: 1, overflowX: 'auto' }}>
          {FILTERS.map(f => {
            const cnt = f.key === 'all' ? null
              : f.key === 'sla' ? violations.length
              : counts[f.key] > 0 ? counts[f.key] : null
            return (
              <button key={f.key}
                className={`filter-chip ${filter === f.key ? 'active' : ''}`}
                onClick={() => {
                  setFilter(f.key)
                  if (view === 'kanban' && f.key !== 'all') setView('liste')
                }}
                style={{ display: 'flex', alignItems: 'center', gap: 5, whiteSpace: 'nowrap' }}
              >
                {f.dot && (
                  <span style={{ width: 5, height: 5, borderRadius: '50%', background: filter === f.key ? f.dot : 'var(--text3)', flexShrink: 0 }} />
                )}
                {f.label}
                {cnt != null && cnt > 0 && (
                  <span style={{
                    background: filter === f.key ? f.dot + '33' : 'var(--surface3)',
                    color: filter === f.key ? f.dot : 'var(--text3)',
                    borderRadius: 10, padding: '0 5px', fontSize: 9, fontWeight: 700,
                  }}>{cnt}</span>
                )}
              </button>
            )
          })}
        </div>
        {search && (
          <button className="btn btn-ghost btn-xs" onClick={() => setSearch('')}>✕</button>
        )}
        {/* View toggle */}
        <div style={{ display: 'flex', gap: 0, background: 'var(--surface2)', borderRadius: 8, border: '1px solid var(--border)', overflow: 'hidden', flexShrink: 0 }}>
          {[
            { key: 'kanban', label: '⊞' },
            { key: 'liste',  label: '≡' },
          ].map(v => (
            <button key={v.key}
              onClick={() => setView(v.key)}
              style={{
                padding: '6px 12px', cursor: 'pointer', border: 'none',
                background: view === v.key ? 'var(--accent)' : 'transparent',
                color: view === v.key ? '#000' : 'var(--text3)',
                fontFamily: 'var(--mono)', fontSize: 13,
                transition: 'all 0.15s',
              }}
            >
              {v.label}
            </button>
          ))}
        </div>
        {/* Batch mode */}
        {view === 'liste' && (
          <>
            {batchMode && selectedIds.size > 0 && (
              <>
                <button className="btn btn-sm" style={{ background: 'var(--blue)', color: '#fff' }} onClick={() => setShowBatchAssign(true)}>
                  Makineye Ata ({selectedIds.size})
                </button>
                <button className="btn btn-sm" style={{ background: 'var(--green)', color: '#000' }} onClick={handleBatchDeliver}>
                  Teslim ({selectedIds.size})
                </button>
                <button className="btn btn-sm" style={{ background: 'rgba(231,76,60,0.15)', color: 'var(--red)', border: '1px solid rgba(231,76,60,0.3)' }} onClick={handleBatchLost}>
                  Kayıp ({selectedIds.size})
                </button>
              </>
            )}
            <button className="btn btn-ghost btn-sm" onClick={() => { setBatchMode(!batchMode); setSelectedIds(new Set()) }}>
              {batchMode ? 'İptal' : 'Toplu'}
            </button>
          </>
        )}
        {/* Kanban oda gruplama */}
        {view === 'kanban' && (
          <button
            className="btn btn-ghost btn-sm"
            style={{ background: groupByRoom ? 'var(--accent)' : undefined, color: groupByRoom ? '#000' : undefined }}
            onClick={toggleGroupByRoom}
          >
            Odaya Göre
          </button>
        )}
      </div>

      {/* ── CONTENT ── */}
      {view === 'kanban' ? (
        <>
        <DndContext
          sensors={sensors}
          onDragStart={handleDragStart}
          onDragOver={handleDragOver}
          onDragEnd={handleDragEnd}
        >
          <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start', overflowX: 'auto', paddingBottom: 4 }}>
            <KanbanCol title="BEKLİYOR"     color="#0369a1"       items={pending} colStatus="pending_collection" isOver={false} machines={machines} onDeliver={setDeliverItem} onDamage={setDamageItem} onPersonClick={setPersonPanelName} onFound={setFoundItem} groupByRoom={groupByRoom} emptyLabel={colEmptyLabel} />
            <KanbanCol title="KİRLİ SEPET"  color="var(--accent)" items={dirty}   colStatus="dirty"   isOver={overCol === 'dirty'}   machines={machines} onDeliver={setDeliverItem} onDamage={setDamageItem} onPersonClick={setPersonPanelName} onFound={setFoundItem} groupByRoom={groupByRoom} emptyLabel={colEmptyLabel} />
            <KanbanCol title="YIKANIYOR"    color="var(--blue)"   items={washing} colStatus="washing" isOver={overCol === 'washing'} machines={machines} onDeliver={setDeliverItem} onDamage={setDamageItem} onPersonClick={setPersonPanelName} onFound={setFoundItem} groupByRoom={groupByRoom} emptyLabel={colEmptyLabel} />
            <KanbanCol title="ÜTÜDE" color="#6366f1" items={ironing} colStatus="ironing" isOver={overCol === 'ironing'} machines={machines} onDeliver={setDeliverItem} onDamage={setDamageItem} onPersonClick={setPersonPanelName} onFound={setFoundItem} groupByRoom={groupByRoom} emptyLabel={colEmptyLabel} />
            <KanbanCol title="RAFTA HAZIR"  color="var(--green)"  items={ready}   colStatus="ready"   isOver={overCol === 'ready'}   machines={machines} onDeliver={setDeliverItem} onDamage={setDamageItem} onPersonClick={setPersonPanelName} onFound={setFoundItem} groupByRoom={groupByRoom} batchMode={batchMode} selectedIds={selectedIds} onSelect={toggleSelect} onSelectBlock={selectBlock} emptyLabel={colEmptyLabel} />
          </div>
          <DragOverlay dropAnimation={null}>
            {activeItem ? (
              <div style={{ pointerEvents: 'none', opacity: 0.95, boxShadow: '0 16px 48px rgba(0,0,0,0.45)', cursor: 'grabbing', borderRadius: 8 }}>
                <KanbanCard item={activeItem} machines={machines} onDeliver={() => {}} onDamage={() => {}} onPersonClick={() => {}} onFound={() => {}} />
              </div>
            ) : null}
          </DragOverlay>
          {lost.length > 0 && (
            <div style={{ marginTop: 16 }}>
              <div style={{
                fontFamily: 'var(--mono)', fontSize: 9, letterSpacing: 2, color: 'var(--red)',
                marginBottom: 8, display: 'flex', alignItems: 'center', gap: 8,
              }}>
                <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--red)', display: 'inline-block' }} />
                KAYIP ({lost.length})
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                {lost.map(item => (
                  <div key={item.id} style={{
                    flex: '0 0 calc(33% - 6px)', minWidth: 200,
                    background: 'var(--surface)', border: '1px solid rgba(231,76,60,0.25)',
                    borderTop: '2px solid var(--red)', borderRadius: 8, padding: '10px 12px',
                  }}>
                    <div style={{ fontFamily: 'var(--display)', fontSize: 14, letterSpacing: 2, color: 'var(--red)', marginBottom: 4 }}>
                      {item.block} · {item.room_no}
                    </div>
                    <div style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--text2)', marginBottom: 4 }}>
                      {item.item_count} parça {item.occupant_name ? `· ${item.occupant_name}` : ''}
                    </div>
                    <div style={{ fontFamily: 'var(--mono)', fontSize: 8, color: 'var(--text3)', marginBottom: 8 }}>
                      {new Date(item.created_at).toLocaleDateString('tr-TR')}
                      {item.intake_name ? ` · ${item.intake_name}` : ''}
                    </div>
                    <button
                      className="btn btn-xs"
                      style={{ background: 'rgba(39,201,106,0.12)', color: 'var(--green)', border: '1px solid rgba(39,201,106,0.25)', fontSize: 9 }}
                      onClick={() => setFoundItem(item)}
                    >
                      ✓ Bulundu →
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </DndContext>
        <DeliveredTodaySection />
        </>
      ) : (
        <div>
          {isLoading ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {[1, 2, 3].map(i => (
                <div key={i} style={{ height: 100, background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, opacity: 0.4 - i * 0.1 }} />
              ))}
            </div>
          ) : listItems.length === 0 ? (
            <div className="panel" style={{ padding: '48px 24px', textAlign: 'center' }}>
              <div style={{ fontSize: 32, marginBottom: 12 }}>🧺</div>
              <div style={{ fontFamily: 'var(--display)', fontSize: 18, letterSpacing: 3, color: 'var(--text2)', marginBottom: 8 }}>
                {filter !== 'all' ? 'SONUÇ YOK' : 'KAYIT YOK'}
              </div>
              <div style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--text3)' }}>
                {filter !== 'all' ? 'Bu filtre için kayıt yok' : 'Henüz kayıt oluşturulmamış'}
              </div>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {listItems.map((item, idx) => (
                <div key={item.id} className={`fade-up-${Math.min(idx, 4)}`}>
                  <ItemCard
                    item={item}
                    machines={machines}
                    onDeliver={setDeliverItem}
                    onDamage={setDamageItem}
                    selected={selectedIds.has(item.id)}
                    onSelect={batchMode ? toggleSelect : undefined}
                    onPersonClick={setPersonPanelName}
                    onFound={setFoundItem}
                  />
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── MESAJLAŞMA ── */}
      <LaundryChat />

      </>)}

      {section === 'rooms'    && <RoomsSection onOpenNewRecordForRoom={(r) => { setNewRoomPrefill(r); setShowNew(true) }} />}
      {section === 'records'  && <FullRecordsView />}
      {section === 'archive'  && (
        <div style={{ position: 'relative' }}>
          <ArchiveTable onSelectItem={setArchiveSelectedItem} />
          {archiveSelectedItem && (
            <ArchiveDetailPanel item={archiveSelectedItem} onClose={() => setArchiveSelectedItem(null)} />
          )}
        </div>
      )}
      {section === 'premium-search' && <PremiumSearchPanel />}
      {section === 'reports'  && <LaundryReport />}
      {section === 'settings' && <LaundrySettings />}

      {/* ── MODALS ── */}
      {showScanModal && <GarmentScanModal onClose={() => setShowScanModal(false)} />}
      {showNew      && <NewItemModal roomPrefill={newRoomPrefill} onClose={() => { setShowNew(false); setNewRoomPrefill(null) }} />}
      {deliverItem  && <DeliveryModal item={deliverItem} onClose={() => setDeliverItem(null)} />}
      {damageItem   && <DamageModal   item={damageItem}  onClose={() => setDamageItem(null)} />}
      {showMgr      && <MachineManagerPanel machines={machines} onClose={() => setShowMgr(false)} />}
      {personPanelName && <PersonPanel name={personPanelName} onClose={() => setPersonPanelName(null)} />}
      {foundItem && <FoundModal item={foundItem} onClose={() => setFoundItem(null)} />}
      {showBatchAssign && (
        <BatchAssignModal
          selectedIds={selectedIds}
          onClose={() => setShowBatchAssign(false)}
          onSuccess={() => { setShowBatchAssign(false); setSelectedIds(new Set()); setBatchMode(false) }}
        />
      )}
      {verificationTarget && (
        <ItemVerificationModal
          item={verificationTarget.item}
          stage={verificationTarget.stage}
          onClose={() => setVerificationTarget(null)}
          onSuccess={() => {
            const { item } = verificationTarget
            setVerificationTarget(null)
            advanceWithUndo(item, {})
          }}
        />
      )}

      {undoPanelOpen && <UndoPanel onClose={() => setUndoPanelOpen(false)} />}

      <button
        onClick={() => setUndoPanelOpen(prev => !prev)}
        title="Son İşlemler (Ctrl+Z)"
        style={{
          position: 'fixed', bottom: 24, right: 24, zIndex: 9998,
          width: 40, height: 40, borderRadius: '50%',
          background: 'var(--surface2)', border: '1px solid var(--border)',
          boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
          cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 16, color: 'var(--text2)',
        }}
      >
        ↩
      </button>
    </div>
  )
}
