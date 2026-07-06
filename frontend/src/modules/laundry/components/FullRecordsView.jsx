import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { laundryApi } from '../api.js'
import { CLOTHING_ICONS } from './NewItemModal.jsx'
import { SkeletonTable } from '../../../shared/components/Skeleton.jsx'
import AllRecordsTab from './AllRecordsTab.jsx'
import IroningQueuePanel from './IroningQueuePanel.jsx'

// ── FullRecordsView ────────────────────────────────────────────
export default function FullRecordsView() {
  const [recordsTab, setRecordsTab] = useState('all')
  const [status, setStatus] = useState('all')
  const [search, setSearch] = useState('')
  const [dateFrom, setDateFrom] = useState('')

  const STATUS_COLORS = { dirty: 'var(--accent)', washing: 'var(--blue)', ready: 'var(--green)', delivered: 'var(--teal)', lost: 'var(--red)' }
  const STATUS_LABELS = { dirty: 'Sepette', washing: 'Yıkanıyor', ready: 'Rafta', delivered: 'Teslim', lost: 'Kayıp' }

  const { data: items = [], isLoading } = useQuery({
    queryKey: ['laundry-all-records', status, search, dateFrom],
    queryFn: () => {
      const params = {}
      if (status !== 'all') params.status = status
      if (search) params.search = search
      if (dateFrom) params.from = dateFrom
      return laundryApi.getItems(status === 'delivered' ? { status: 'delivered', include_delivered: '1' } : params)
    },
    refetchInterval: 30000,
  })

  const { data: ironingItems = [] } = useQuery({
    queryKey: ['ironing-queue'],
    queryFn: () => laundryApi.getItems({ status: 'ironing' }),
    staleTime: 30_000,
    gcTime: 300_000,
    refetchInterval: 60_000,
  })
  const ironingCount = ironingItems.length

  return (
    <div>
      {/* Tab nav */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 16, borderBottom: '1px solid var(--border)', paddingBottom: 0 }}>
        {[
          { key: 'all', label: '★ Tümü' },
          { key: 'filtered', label: '≡ Filtrele' },
          {
            key: 'ironing',
            label: ironingCount > 0
              ? <>Ütü Kuyruğu <span style={{
                  background: 'var(--red)', color: '#fff',
                  borderRadius: 10, padding: '0px 6px', fontSize: 9,
                  fontFamily: 'var(--mono)', marginLeft: 4, verticalAlign: 'middle',
                }}>{ironingCount}</span></>
              : 'Ütü Kuyruğu',
          },
        ].map(t => (
          <button
            key={t.key}
            type="button"
            onClick={() => setRecordsTab(t.key)}
            style={{
              padding: '8px 16px', background: 'none', border: 'none', cursor: 'pointer',
              fontFamily: 'var(--mono)', fontSize: 10, letterSpacing: 1,
              color: recordsTab === t.key ? 'var(--accent)' : 'var(--text3)',
              borderBottom: recordsTab === t.key ? '2px solid var(--accent)' : '2px solid transparent',
              marginBottom: -1,
            }}
          >
            {t.label}
          </button>
        ))}
      </div>

      {recordsTab === 'all' ? (
        <AllRecordsTab />
      ) : recordsTab === 'ironing' ? (
        <IroningQueuePanel />
      ) : (
        <>
      {/* Filters */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 14, flexWrap: 'wrap', alignItems: 'center' }}>
        <input
          className="form-input"
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Oda, isim, not..."
          style={{ flex: '1 1 180px', minWidth: 140 }}
        />
        <input
          type="date"
          className="form-input"
          value={dateFrom}
          onChange={e => setDateFrom(e.target.value)}
          style={{ width: 140 }}
        />
        <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
          {[
            { key: 'all', label: 'Aktif' },
            { key: 'dirty', label: 'Sepet' },
            { key: 'washing', label: 'Yıkama' },
            { key: 'ready', label: 'Hazır' },
            { key: 'delivered', label: 'Teslim' },
            { key: 'lost', label: 'Kayıp' },
          ].map(f => (
            <button key={f.key}
              className={`filter-chip ${status === f.key ? 'active' : ''}`}
              onClick={() => setStatus(f.key)}
              style={{ fontSize: 9 }}
            >{f.label}</button>
          ))}
        </div>
      </div>

      {/* Records table */}
      {isLoading ? (
        <SkeletonTable rows={5} cols={5} />
      ) : items.length === 0 ? (
        <div className="panel" style={{ padding: '32px', textAlign: 'center' }}>
          <div style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--text3)' }}>Kayıt bulunamadı</div>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {items.map(item => {
            let cl = []
            try { cl = item.clothing_items ? JSON.parse(item.clothing_items) : [] } catch {}
            return (
              <div key={item.id} style={{
                background: 'var(--surface)', border: '1px solid var(--border)',
                borderLeft: `3px solid ${STATUS_COLORS[item.status] || 'var(--border)'}`,
                borderRadius: 8, padding: '12px 16px',
              }}>
                {/* Row 1: Room + Status + Date */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <span style={{ fontFamily: 'var(--display)', fontSize: 16, letterSpacing: 2, color: 'var(--text)' }}>
                      {item.block} · {item.room_no}
                    </span>
                    {item.urgent === 1 && (
                      <span style={{ fontFamily: 'var(--mono)', fontSize: 8, color: 'var(--red)', background: 'rgba(231,76,60,0.1)', padding: '2px 6px', borderRadius: 4 }}>ACİL</span>
                    )}
                    <span className={`badge badge-${item.status === 'delivered' ? 'green' : item.status === 'lost' ? 'red' : item.status === 'ready' ? 'blue' : 'gray'}`} style={{ fontSize: 8 }}>
                      {STATUS_LABELS[item.status] || item.status}
                    </span>
                  </div>
                  <span style={{ fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--text3)' }}>
                    {new Date(item.created_at).toLocaleString('tr-TR', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                  </span>
                </div>

                {/* Row 2: Who gave + who entered + item count */}
                <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', marginBottom: cl.length > 0 ? 6 : 0 }}>
                  {item.intake_name && (
                    <span style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--text2)' }}>
                      👤 Teslim eden: <strong style={{ color: 'var(--text)' }}>{item.intake_name}</strong>
                    </span>
                  )}
                  {item.occupant_name && (
                    <span style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--text2)' }}>
                      🏠 Oda sakini: <strong style={{ color: 'var(--text)' }}>{item.occupant_name}</strong>
                    </span>
                  )}
                  {item.created_by_name && (
                    <span style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--text3)' }}>
                      Kaydeden: {item.created_by_name}
                    </span>
                  )}
                  <span style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--text3)' }}>
                    {item.item_count} parça
                  </span>
                  {item.phone_number && (
                    <a href={`https://wa.me/${item.phone_number.replace(/\D/g,'').replace(/^0/,'90')}`}
                      target="_blank" rel="noreferrer"
                      style={{ fontFamily: 'var(--mono)', fontSize: 9, color: '#25D366', textDecoration: 'none' }}>
                      📱 {item.phone_number}
                    </a>
                  )}
                </div>

                {/* Row 3: Clothing details */}
                {cl.length > 0 && (
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginBottom: item.notes ? 6 : 0 }}>
                    {cl.map((c, i) => (
                      <span key={i} style={{
                        fontFamily: 'var(--mono)', fontSize: 9, padding: '2px 8px',
                        background: 'var(--surface2)', border: '1px solid var(--border)',
                        borderRadius: 12, color: 'var(--text2)',
                      }}>
                        {CLOTHING_ICONS[c.type] || ''} {c.qty}× {c.type}{c.color ? ` (${c.color})` : ''}
                      </span>
                    ))}
                  </div>
                )}

                {/* Row 4: Notes */}
                {item.notes && (
                  <div style={{ fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--text3)', fontStyle: 'italic', marginTop: 4 }}>
                    📝 {item.notes}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
        </>
      )}
    </div>
  )
}
