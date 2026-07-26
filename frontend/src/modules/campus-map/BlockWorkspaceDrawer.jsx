import { useEffect, useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import api from '../../shared/api/client.js'
import { blockColor } from '../../shared/blocks.js'
import { workspaceTabs } from './logic/campusWorkspace.js'
import BlockRoomManager from './BlockRoomManager.jsx'

const panel = {
  border: '1px solid var(--border)', borderRadius: 8, background: 'var(--surface2)', padding: 10,
}

const actionStyle = color => ({
  display: 'flex', alignItems: 'center', gap: 7, padding: '8px 9px',
  background: 'var(--surface2)', color: 'var(--text)', border: '1px solid var(--border)',
  borderLeft: `3px solid ${color}`, borderRadius: 6, cursor: 'pointer', textAlign: 'left',
  fontFamily: 'var(--mono)', fontSize: 9,
})

function Overview({ data, onTabChange, onNavigate, onQuickFault }) {
  const overview = data.overview || {}
  const permissions = data.permissions || {}
  const actions = [
    permissions.rooms && { id: 'rooms', label: 'Odaları ve kişileri aç', color: '#38bdf8', run: () => onTabChange('rooms') },
    permissions.rooms && { id: 'checkin', label: 'Bu bloğa check-in', color: '#16a34a', run: () => onNavigate(`/checkin?block=${data.block}`) },
    permissions.rooms && { id: 'checkout', label: 'Bu bloktan check-out', color: '#38bdf8', run: () => onNavigate(`/checkout?block=${data.block}`) },
    permissions.faults && { id: 'fault', label: 'Arıza bildir', color: '#dc2626', run: onQuickFault },
    permissions.faults && { id: 'fault-list', label: 'Blok arızalarını aç', color: '#ef4444', run: () => onTabChange('faults') },
    permissions.cleaning && { id: 'cleaning', label: 'Blok temizliğini aç', color: '#f59e0b', run: () => onTabChange('cleaning') },
    { id: 'history', label: 'Blok geçmişini aç', color: '#a78bfa', run: () => onNavigate(`/room-history?block=${data.block}`) },
  ].filter(Boolean)

  return (
    <>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(76px, 1fr))', gap: 6 }}>
        {[
          ['DOLULUK', `%${overview.occupancy_pct || 0}`, '#38bdf8'],
          ['BOŞ YATAK', Math.max(0, Number(overview.total_beds || 0) - Number(overview.occupied || 0)), '#16a34a'],
          ['AÇIK ARIZA', overview.open_faults || 0, overview.open_faults ? '#dc2626' : '#16a34a'],
          ['BOŞ ODA', overview.empty_rooms || 0, '#16a34a'],
          ['KARANTİNA', overview.quarantine || 0, overview.quarantine ? '#a855f7' : 'var(--text3)'],
          ['BAKIM', overview.maintenance || 0, overview.maintenance ? '#f59e0b' : 'var(--text3)'],
        ].map(([label, value, color]) => (
          <div key={label} style={panel}>
            <div style={{ fontFamily: 'var(--mono)', fontSize: 8, color: 'var(--text3)', letterSpacing: 1 }}>{label}</div>
            <strong style={{ display: 'block', marginTop: 3, fontFamily: 'var(--display)', fontSize: 20, color }}>{value}</strong>
          </div>
        ))}
      </div>
      <div style={{ ...panel, marginTop: 8 }}>
        <div style={{ fontFamily: 'var(--mono)', fontSize: 8, color: 'var(--text3)', letterSpacing: 1, marginBottom: 7 }}>
          BLOK İŞLEMLERİ
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(145px, 1fr))', gap: 5 }}>
          {actions.map(action => (
            <button key={action.id} type="button" onClick={action.run} style={actionStyle(action.color)}>
              <span>{action.label}</span><span style={{ marginLeft: 'auto' }}>›</span>
            </button>
          ))}
        </div>
      </div>
    </>
  )
}

function People({ rooms, onNavigate }) {
  const people = rooms.flatMap(room => (room.occupants || []).map(person => ({
    ...person, room_no: room.room_no, room_id: room.id,
  }))).sort((left, right) => left.full_name.localeCompare(right.full_name, 'tr'))
  if (!people.length) return <div style={{ ...panel, color: 'var(--text3)' }}>Bu blokta aktif yerleşim yok.</div>
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
      {people.map(person => (
        <button
          key={person.personnel_id}
          type="button"
          onClick={() => onNavigate(`/personnel/${person.personnel_id}`)}
          style={{ ...panel, display: 'flex', alignItems: 'center', gap: 8, color: 'var(--text)', cursor: 'pointer', textAlign: 'left' }}
        >
          <span style={{ width: 30, height: 30, borderRadius: '50%', display: 'grid', placeItems: 'center', background: 'rgba(56,189,248,.12)', color: '#38bdf8' }}>
            {person.full_name.slice(0, 1)}
          </span>
          <span style={{ flex: 1 }}>
            <strong style={{ display: 'block', fontSize: 11 }}>{person.full_name}</strong>
            <span style={{ display: 'block', fontSize: 9, color: 'var(--text3)' }}>{person.company || 'Şirket yok'}</span>
          </span>
          <span style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--accent)' }}>ODA {person.room_no}</span>
        </button>
      ))}
    </div>
  )
}

function Faults({ faults, onQuickFault, onNavigate, block }) {
  return (
    <>
      <div style={{ display: 'flex', gap: 6, marginBottom: 8 }}>
        <button type="button" onClick={onQuickFault} style={actionStyle('#dc2626')}>＋ ARIZA BİLDİR</button>
        <button type="button" onClick={() => onNavigate(`/maintenance?block=${block}`)} style={actionStyle('#ef4444')}>TÜMÜNÜ AÇ ›</button>
      </div>
      {faults.length === 0 ? <div style={{ ...panel, color: '#16a34a' }}>✓ Açık arıza yok.</div> : faults.map(fault => (
        <div key={fault.id} style={{ ...panel, marginBottom: 6, borderLeft: `3px solid ${fault.priority === 'high' ? '#dc2626' : '#f59e0b'}` }}>
          <div style={{ display: 'flex', gap: 6 }}>
            <strong style={{ fontSize: 10 }}>{fault.location}</strong>
            <span style={{ marginLeft: 'auto', fontFamily: 'var(--mono)', fontSize: 8, color: 'var(--text3)' }}>{fault.status}</span>
          </div>
          <div style={{ fontSize: 10, color: 'var(--text2)', marginTop: 3 }}>{fault.description}</div>
          <div style={{ fontSize: 9, color: 'var(--text3)', marginTop: 4 }}>{fault.technician_name || 'Teknisyen atanmamış'}</div>
        </div>
      ))}
    </>
  )
}

function Cleaning({ cleaning, onNavigate, block }) {
  const pct = cleaning?.pct || 0
  return (
    <>
      <div style={panel}>
        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
          <strong style={{ fontFamily: 'var(--display)', fontSize: 22, color: '#16a34a' }}>%{pct}</strong>
          <span style={{ fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--text3)' }}>{cleaning?.done || 0}/{cleaning?.total || 0} tamam</span>
        </div>
        <div style={{ height: 7, borderRadius: 4, background: 'var(--surface3)', overflow: 'hidden', marginTop: 8 }}>
          <div style={{ height: '100%', width: `${pct}%`, background: '#16a34a' }} />
        </div>
        <div style={{ display: 'flex', gap: 12, marginTop: 8, fontSize: 10, color: 'var(--text2)' }}>
          <span>⏳ {cleaning?.pending || 0} bekliyor</span>
          <span>↷ {cleaning?.skipped || 0} atlandı</span>
        </div>
      </div>
      <button type="button" onClick={() => onNavigate(`/housekeeping?block=${block}`)} style={{ ...actionStyle('#f59e0b'), width: '100%', marginTop: 8 }}>
        Temizlik görevlerini yönet <span style={{ marginLeft: 'auto' }}>›</span>
      </button>
    </>
  )
}

export default function BlockWorkspaceDrawer({
  block,
  tab,
  selectedRoomId,
  onTabChange,
  onRoomChange,
  onClose,
  onNavigate,
  onQuickFault,
  role,
  isNarrow = false,
}) {
  const [width, setWidth] = useState(470)
  const [resizing, setResizing] = useState(false)
  const query = useQuery({
    queryKey: ['campus-block-workspace', block],
    queryFn: () => api.get(`/campus-map/block/${encodeURIComponent(block)}/workspace`).then(response => response.data),
    enabled: Boolean(block),
    staleTime: 20_000,
  })

  useEffect(() => {
    if (!resizing) return undefined
    const move = event => setWidth(Math.max(360, Math.min(620, window.innerWidth - event.clientX - 18)))
    const stop = () => setResizing(false)
    window.addEventListener('mousemove', move)
    window.addEventListener('mouseup', stop)
    return () => {
      window.removeEventListener('mousemove', move)
      window.removeEventListener('mouseup', stop)
    }
  }, [resizing])

  const tabs = useMemo(() => workspaceTabs(query.data?.permissions || {}), [query.data?.permissions])
  useEffect(() => {
    if (query.data && tabs.length && !tabs.some(item => item.id === tab)) onTabChange('overview')
  }, [onTabChange, query.data, tab, tabs])

  const data = query.data
  const rooms = data?.rooms || []
  const currentTab = tabs.some(item => item.id === tab) ? tab : 'overview'
  const generatedAt = data?.generated_at ? new Date(data.generated_at).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' }) : '—'
  const partial = data && tabs.some(item => (
    (item.id === 'rooms' || item.id === 'people') && !Array.isArray(data.rooms)
  ))

  return (
    <aside
      aria-label={`${block} blok çalışma alanı`}
      style={{
        width: isNarrow ? '100%' : width, minWidth: isNarrow ? 0 : 360, maxWidth: '100%',
        background: 'var(--surface)', border: '1px solid var(--border)',
        borderRadius: isNarrow ? '14px 14px 8px 8px' : 10,
        position: 'relative', overflow: 'hidden', display: 'flex', flexDirection: 'column',
        maxHeight: isNarrow ? '72vh' : 'calc(100vh - 40px)', alignSelf: 'stretch',
      }}
    >
      {!isNarrow && (
        <button
          type="button"
          aria-label="Çalışma alanını yeniden boyutlandır"
          onMouseDown={() => setResizing(true)}
          style={{
            position: 'absolute', left: 0, top: 0, bottom: 0, width: 7, zIndex: 5,
            border: 0, background: resizing ? 'var(--accent)' : 'transparent', cursor: 'ew-resize',
          }}
        />
      )}
      <div style={{ padding: '12px 14px 9px', borderBottom: '1px solid var(--border)' }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
          <div>
            <strong style={{ display: 'block', fontFamily: 'var(--display)', fontSize: 24, letterSpacing: 2, color: blockColor(block) }}>{block}</strong>
            <span style={{ fontFamily: 'var(--mono)', fontSize: 8, color: 'var(--text3)', letterSpacing: 1 }}>
              BLOK ÇALIŞMA ALANI · {generatedAt}
            </span>
          </div>
          <button type="button" onClick={() => query.refetch()} disabled={query.isFetching} style={{ ...actionStyle('#38bdf8'), marginLeft: 'auto' }}>
            {query.isFetching ? 'YENİLENİYOR' : '↻ YENİLE'}
          </button>
          <button type="button" onClick={onClose} aria-label="Çalışma alanını kapat" style={{
            border: '1px solid var(--border)', borderRadius: 6, background: 'transparent',
            color: 'var(--text3)', padding: '6px 9px', cursor: 'pointer',
          }}>✕</button>
        </div>
      </div>

      {query.isPending ? (
        <div style={{ padding: 14 }}>
          {[1, 2, 3, 4].map(item => <div key={item} style={{ height: 46, borderRadius: 7, background: 'var(--surface2)', marginBottom: 7, opacity: .7 }} />)}
        </div>
      ) : query.isError ? (
        <div style={{ margin: 14, ...panel, borderColor: '#dc2626' }}>
          <strong style={{ display: 'block', color: '#dc2626', marginBottom: 5 }}>Blok verisi alınamadı.</strong>
          <button type="button" onClick={() => query.refetch()} style={actionStyle('#dc2626')}>TEKRAR DENE</button>
        </div>
      ) : (
        <>
          {(partial || data?.freshness?.status === 'stale') && (
            <div style={{ margin: '8px 12px 0', padding: 7, border: '1px solid #f59e0b', borderRadius: 6, color: '#f59e0b', fontSize: 9 }}>
              ⚠ Bazı blok verileri eksik veya güncel değil.
            </div>
          )}
          <div role="tablist" aria-label="Blok çalışma alanı bölümleri" style={{
            display: 'flex', gap: 3, padding: '8px 10px', borderBottom: '1px solid var(--border)', overflowX: 'auto',
          }}>
            {tabs.map(item => (
              <button
                key={item.id}
                type="button"
                role="tab"
                aria-selected={currentTab === item.id}
                onClick={() => onTabChange(item.id)}
                style={{
                  flexShrink: 0, border: 0, borderRadius: 5, padding: '6px 8px', cursor: 'pointer',
                  background: currentTab === item.id ? 'var(--accent)' : 'var(--surface2)',
                  color: currentTab === item.id ? '#000' : 'var(--text2)',
                  fontFamily: 'var(--mono)', fontSize: 8, letterSpacing: .5,
                }}
              >{item.label.toUpperCase()}</button>
            ))}
          </div>
          <div style={{ padding: 12, overflowY: 'auto', flex: 1 }}>
            {currentTab === 'overview' && <Overview data={data} onTabChange={onTabChange} onNavigate={onNavigate} onQuickFault={onQuickFault} />}
            {currentTab === 'rooms' && (
              <BlockRoomManager
                block={block}
                rooms={rooms}
                selectedRoomId={selectedRoomId}
                onRoomChange={onRoomChange}
                onNavigate={onNavigate}
                canEditRoom={role === 'campus_manager'}
                onDataChanged={() => query.refetch()}
              />
            )}
            {currentTab === 'people' && <People rooms={rooms} onNavigate={onNavigate} />}
            {currentTab === 'faults' && <Faults faults={data.faults || []} onQuickFault={onQuickFault} onNavigate={onNavigate} block={block} />}
            {currentTab === 'cleaning' && <Cleaning cleaning={data.cleaning} onNavigate={onNavigate} block={block} />}
            {currentTab === 'contact' && (
              <div>
                <div style={{ ...panel, color: 'var(--text2)', fontSize: 10, marginBottom: 8 }}>
                  Blok sakinleri için iletişim ekranını seçili blok bağlamıyla açın.
                </div>
                <button type="button" onClick={() => onNavigate(`/whatsapp?block=${block}`)} style={{ ...actionStyle('#22c55e'), width: '100%' }}>
                  ☎ {block} iletişim merkezini aç <span style={{ marginLeft: 'auto' }}>›</span>
                </button>
              </div>
            )}
            {currentTab === 'activity' && (
              <div>
                <div style={{ ...panel, color: 'var(--text2)', fontSize: 10, marginBottom: 8 }}>
                  Oda hareketleri, yerleşim geçmişi ve blok değişiklikleri seçili bağlamla açılır.
                </div>
                <button type="button" onClick={() => onNavigate(`/room-history?block=${block}`)} style={{ ...actionStyle('#a78bfa'), width: '100%' }}>
                  ⊙ {block} aktivite geçmişini aç <span style={{ marginLeft: 'auto' }}>›</span>
                </button>
              </div>
            )}
          </div>
        </>
      )}
    </aside>
  )
}
