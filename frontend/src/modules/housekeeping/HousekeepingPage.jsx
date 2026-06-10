// Housekeeping orkestratörü: blok-tipi / blok / kat seçicileri, günlük görev +
// DND + oda query'leri ve görev aksiyon mutation'ları (oluştur / tamamla / atla /
// geri al / katı tamamla) optimistic-update ile. Sekme içerikleri ayrı bileşenlerde.
import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import api from '../../shared/api/client.js'
import HelpHint from '../../shared/components/HelpHint.jsx'
import { SkeletonTable } from '../../shared/components/Skeleton.jsx'
import { exportRowsToCsv } from '../../shared/utils/exportData.js'
import { BLOCKS_BY_TYPE, BLOCK_BY_NAME, getFloorLabel } from '../../shared/blocks.js'
import { TODAY, roomNoFromQr, ProgressStrip } from './shared.jsx'
import OrtakAlanCard from './OrtakAlanCard.jsx'
import BlockFloorView from './BlockFloorView.jsx'
import RoomDetailPanel from './RoomDetailPanel.jsx'
import StaffSection from './StaffSection.jsx'

export default function HousekeepingPage() {
  const qc = useQueryClient()
  const [blockType, setBlockType]   = useState('M')
  const [block, setBlock]           = useState('M1')
  const [floor, setFloor]           = useState(1)
  const [selectedRoomNo, setSelected] = useState(null)
  const [uncleanedOnly, setUncleanedOnly] = useState(false)

  const cfg = BLOCK_BY_NAME[block]
  const isM = cfg?.type === 'M'

  const { data: tasks = [], isLoading } = useQuery({
    queryKey: ['cleaning-tasks', TODAY, uncleanedOnly],
    queryFn: () => api.get(`/housekeeping/tasks?date=${TODAY}${uncleanedOnly ? '&uncleaned=true' : ''}`).then(r => r.data),
    refetchInterval: 30000,
  })

  const { data: dndRooms = [] } = useQuery({
    queryKey: ['dnd-rooms'],
    queryFn: () => api.get('/housekeeping/dnd-rooms').then(r => r.data),
    refetchInterval: 15000,
  })

  const { data: blockRooms = [] } = useQuery({
    queryKey: ['capacity-rooms', block],
    queryFn: () => api.get(`/capacity/rooms?block=${block}`).then(r => r.data),
    refetchInterval: 15000,
  })

  const inv = () => qc.invalidateQueries({ queryKey: ['cleaning-tasks'] })

  const generateTasks = useMutation({ mutationFn: () => api.post('/housekeeping/tasks/generate-daily'), onSuccess: inv })

  // Optimistic update yardımcısı: cache'deki cleaning-tasks listelerini in-place günceller,
  // hata olursa snapshot ile geri alır. Mutation pending iken UI anında tepki verir.
  const optimisticTaskUpdate = (updater) => ({
    onMutate: async (vars) => {
      await qc.cancelQueries({ queryKey: ['cleaning-tasks'] })
      const snapshots = qc.getQueriesData({ queryKey: ['cleaning-tasks'] })
      qc.setQueriesData({ queryKey: ['cleaning-tasks'] }, (old) => {
        if (!Array.isArray(old)) return old
        return old.map(t => updater(t, vars))
      })
      return { snapshots }
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.snapshots) for (const [key, val] of ctx.snapshots) qc.setQueryData(key, val)
    },
    onSettled: inv,
  })

  const completeTask = useMutation({
    mutationFn: ({ id, checklist }) => api.post(`/housekeeping/tasks/${id}/complete`, { checklist }),
    ...optimisticTaskUpdate((t, vars) =>
      t.id === vars.id ? { ...t, completed_at: new Date().toISOString(), skipped: 0 } : t
    ),
    onSuccess: () => setSelected(null),
  })

  const uncompleteTask = useMutation({
    mutationFn: (id) => api.patch(`/housekeeping/tasks/${id}/uncomplete`),
    ...optimisticTaskUpdate((t, id) =>
      t.id === id ? { ...t, completed_at: null } : t
    ),
  })

  const skipTask = useMutation({
    mutationFn: ({ id, reason, undo }) => undo
      ? api.patch(`/housekeeping/tasks/${id}/unskip`)
      : api.patch(`/housekeeping/tasks/${id}/skip`, { reason }),
    ...optimisticTaskUpdate((t, vars) =>
      t.id === vars.id
        ? { ...t, skipped: vars.undo ? 0 : 1, skip_reason: vars.undo ? null : vars.reason }
        : t
    ),
  })

  const completeFloor = useMutation({
    mutationFn: () => api.post('/housekeeping/tasks/complete-floor', { block, floor: String(floor), date: TODAY }),
    onSuccess: inv,
  })

  const blockFloorTasks = tasks.filter(t => t.block === block && t.floor === floor)
  const bDone    = blockFloorTasks.filter(t => t.completed_at).length
  const bSkipped = blockFloorTasks.filter(t => t.skipped).length
  const bTotal   = blockFloorTasks.length
  const allDone  = bTotal > 0 && (bDone + bSkipped) === bTotal

  const selectedTask = selectedRoomNo
    ? tasks.find(t => t.block === block && t.floor === floor && t.task_type === 'room' && roomNoFromQr(t.qr_location) === selectedRoomNo)
    : null

  const commonTask = isM
    ? tasks.find(t => t.block === block && t.floor === floor && t.task_type === 'common_area')
    : null

  return (
    <div className="fade-up" style={{ position: 'relative', zIndex: 1 }}>
      {/* Header */}
      <div className="page-header" style={{ marginBottom: '20px', display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', flexWrap: 'wrap', gap: '8px' }}>
        <div>
          <h1 style={{ fontSize: '30px', letterSpacing: '4px', color: 'var(--text)' }}>
            HOUSEKEEPING<HelpHint topic="housekeeping" title="TEMİZLİK" />
          </h1>
          <p style={{ fontFamily: 'var(--mono)', fontSize: '10px', color: 'var(--text3)', marginTop: '4px', letterSpacing: '1px' }}>
            GÜNLÜK TEMİZLİK YÖNETİMİ
          </p>
        </div>
        {dndRooms.length > 0 && <span className="badge badge-amber">🚫 {dndRooms.length} DND ODA</span>}
        {tasks.length > 0 && (
          <button className="btn btn-ghost btn-sm" onClick={() => exportRowsToCsv([
            { key: 'block', label: 'BLOK' },
            { key: 'floor', label: 'KAT' },
            { key: 'room_no', label: 'ODA' },
            { key: 'task_type', label: 'TİP' },
            { key: 'assigned_to_name', label: 'SORUMLU' },
            { key: 'completed_at', label: 'TAMAMLANMA' },
            { key: 'skipped', label: 'ATLANDI' },
            { key: 'notes', label: 'NOTLAR' },
          ], tasks, `temizlik_${TODAY}.csv`)}>↓ CSV</button>
        )}
      </div>

      {/* Progress */}
      {isLoading
        ? <SkeletonTable rows={4} cols={5} />
        : <ProgressStrip tasks={tasks} onGenerate={() => generateTasks.mutate()} generating={generateTasks.isPending} />
      }

      {/* Block type switcher (M / S / Y) + Block + Floor selectors */}
      <div style={{ display: 'flex', gap: '10px', alignItems: 'center', marginBottom: '16px', flexWrap: 'wrap' }}>
        <div style={{
          display: 'flex', background: 'var(--surface2)', borderRadius: '8px',
          padding: '3px', border: '1px solid var(--border)',
        }}>
          {['M', 'S', 'Y'].map(t => (
            <button
              key={t}
              onClick={() => {
                setBlockType(t)
                const firstBlock = BLOCKS_BY_TYPE[t][0]
                setBlock(firstBlock)
                setFloor(1)
                setSelected(null)
              }}
              style={{
                padding: '6px 18px', borderRadius: '6px', border: 'none', cursor: 'pointer',
                fontFamily: 'var(--display)', fontSize: '13px', fontWeight: 700, letterSpacing: '2px',
                transition: 'all 0.15s',
                background: blockType === t ? 'var(--accent)' : 'transparent',
                color: blockType === t ? '#000' : 'var(--text2)',
              }}
            >
              {t} BLOK
            </button>
          ))}
        </div>
        <div style={{ display: 'flex', gap: '5px', flexWrap: 'wrap' }}>
          {BLOCKS_BY_TYPE[blockType].map(b => {
            const bT  = tasks.filter(t => t.block === b)
            const bD  = bT.filter(t => t.completed_at).length
            const bSk = bT.filter(t => t.skipped).length
            const ok  = bT.length > 0 && (bD + bSk) === bT.length
            return (
              <button key={b}
                onClick={() => { setBlock(b); setFloor(1); setSelected(null) }}
                className={`filter-chip${block === b ? ' active' : ''}`}
                style={{ fontFamily: 'var(--display)', fontSize: '13px', letterSpacing: '1px' }}>
                {b}{ok && <span style={{ marginLeft: '4px', fontSize: '9px', color: 'var(--green)' }}>✓</span>}
              </button>
            )
          })}
        </div>
        {(() => {
          const floorList = Array.from({ length: cfg?.floors ?? 0 }, (_, i) => i + 1)
          if (floorList.length <= 1) return null
          return (
            <div style={{ display: 'flex', gap: '5px' }}>
              {floorList.map(f => (
                <button key={f} onClick={() => { setFloor(f); setSelected(null) }}
                  className={`filter-chip${floor === f ? ' active' : ''}`}>
                  KAT {f}
                  <span style={{ fontFamily: 'var(--mono)', fontSize: '8px', opacity: 0.6, marginLeft: '4px' }}>
                    {getFloorLabel(block, f)}
                  </span>
                </button>
              ))}
            </div>
          )
        })()}
        <button
          onClick={() => setUncleanedOnly(v => !v)}
          className={`filter-chip${uncleanedOnly ? ' active' : ''}`}
          style={{ background: uncleanedOnly ? 'var(--red)' : undefined, borderColor: uncleanedOnly ? 'var(--red)' : undefined, color: uncleanedOnly ? '#fff' : undefined }}
        >
          {uncleanedOnly ? '✓ ' : ''}Temizlenmemiş
        </button>
        {/* Task stats summary */}
        {tasks.length > 0 && (() => {
          const done = tasks.filter(t => t.completed_at).length
          const skipped = tasks.filter(t => t.skipped).length
          const pending = tasks.length - done - skipped
          const pct = Math.round((done / tasks.length) * 100)
          return (
            <div style={{ display: 'flex', gap: '8px', alignItems: 'center', marginLeft: '8px' }}>
              <div style={{ width: '60px', height: '6px', background: 'var(--border)', borderRadius: '3px', overflow: 'hidden' }}>
                <div style={{ width: `${pct}%`, height: '100%', background: 'var(--green)', borderRadius: '3px', transition: 'width .4s' }} />
              </div>
              <span style={{ fontFamily: 'var(--mono)', fontSize: '9px', color: 'var(--text3)' }}>
                %{pct} · {done}✓ {pending > 0 ? `${pending}◻` : ''} {skipped > 0 ? `${skipped}⊘` : ''}
              </span>
            </div>
          )
        })()}
        <div style={{ marginLeft: 'auto', display: 'flex', gap: '10px', alignItems: 'center' }}>
          {bTotal > 0 && (
            <>
              <span style={{ fontFamily: 'var(--mono)', fontSize: '9px', color: allDone ? 'var(--green)' : 'var(--text3)' }}>
                {bDone}/{bTotal}{bSkipped > 0 && ` · ${bSkipped} atlandı`}
              </span>
              {!allDone
                ? <button className="btn btn-primary btn-sm" onClick={() => completeFloor.mutate()} disabled={completeFloor.isPending}>
                    {completeFloor.isPending ? '...' : '✓ KATI TAMAMLA'}
                  </button>
                : <span className="badge badge-green">✓ KAT TAMAM</span>
              }
            </>
          )}
        </div>
      </div>

      {/* Main panel */}
      <div className="panel">
        <div style={{ height: '2px', background: isM ? 'linear-gradient(90deg,var(--blue),var(--purple))' : 'linear-gradient(90deg,var(--purple),var(--teal))' }} />
        <div className="panel-header">
          <div>
            <div className="panel-title">{block} BLOK — KAT {floor}</div>
            <div className="panel-subtitle">
              {isM
                ? `ORTAK ALANLAR + ODA TEMİZLİĞİ · ${floor===1?'ODA 101–130':'ODA 201–230'}`
                : `ODA TEMİZLİĞİ · 🚿 HER ODADA ÖZEL BANYO + TUVALET · ${floor===1?'ODA 101–124':'ODA 201–224'}`}
            </div>
          </div>
          <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
            <span className={`tag tag-${isM ? 'm' : 's'}`}>{isM ? 'M' : 'S'}</span>
            {!isM && <span style={{ fontFamily: 'var(--mono)', fontSize: '9px', color: 'var(--teal)', background: 'rgba(26,188,156,.1)', border: '1px solid rgba(26,188,156,.3)', borderRadius: '4px', padding: '2px 7px' }}>🚿 ÖZEL BANYO</span>}
            {block === 'S2' && floor === 2 && <span className="tag tag-exc">4K</span>}
            {selectedRoomNo && <span style={{ fontFamily: 'var(--mono)', fontSize: '9px', color: 'var(--accent)', letterSpacing: '1px' }}>ODA {selectedRoomNo} SEÇİLİ</span>}
          </div>
        </div>

        {/* Floor staff section */}
        <StaffSection block={block} floor={floor} />

        <div className="panel-body">
          {isM && (
            <OrtakAlanCard
              task={commonTask}
              block={block}
              floor={floor}
              onComplete={(id, cl) => completeTask.mutate({ id, checklist: cl })}
              onUncomplete={(id) => uncompleteTask.mutate(id)}
              onSkip={(id, reason, undo) => skipTask.mutate({ id, reason, undo })}
            />
          )}
          {!isLoading && (
            <BlockFloorView
              key={`${block}-${floor}`}
              block={block} floor={floor}
              tasks={tasks} dndRooms={dndRooms} blockRooms={blockRooms}
              selectedRoomNo={selectedRoomNo} onSelect={setSelected}
            />
          )}
        </div>
      </div>

      {/* Room detail panel */}
      {selectedRoomNo && (
        <RoomDetailPanel
          key={`${block}-${floor}-${selectedRoomNo}`}
          block={block} floor={floor} roomNo={selectedRoomNo}
          task={selectedTask} isPrivateBath={!isM}
          onComplete={(id, cl) => completeTask.mutate({ id, checklist: cl })}
          onUncomplete={(id) => uncompleteTask.mutate(id)}
          onSkip={(id, reason, undo) => skipTask.mutate({ id, reason, undo })}
          onClose={() => setSelected(null)}
          onInvalidateRooms={() => qc.invalidateQueries(['capacity-rooms', block])}
        />
      )}
    </div>
  )
}
