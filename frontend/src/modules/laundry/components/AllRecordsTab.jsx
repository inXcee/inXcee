import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { laundryApi } from '../api.js'
import { CLOTHING_ICONS } from './NewItemModal.jsx'
import { parseColors, colorHex } from './ColorPatternPicker.jsx'
import { SkeletonTable } from '../../../shared/components/Skeleton.jsx'

const STATUS_LABELS = {
  dirty: 'Sepette', washing: 'Yıkanıyor', ironing: 'Ütüde',
  ready: 'Rafta', delivered: 'Teslim', lost: 'Kayıp',
}
const STATUS_COLORS = {
  dirty: 'var(--accent)', washing: 'var(--blue)', ironing: '#6366f1',
  ready: 'var(--green)', delivered: 'var(--teal)', lost: 'var(--red)',
}

const PG_STATUS_LABELS = { received: 'Alındı', ironing: 'Ütüde', ready: 'Hazır', delivered: 'Teslim', lost: 'Kayıp' }
const PG_STATUS_COLORS = { received: '#f59e0b', ironing: '#6366f1', ready: '#10b981', delivered: '#64748b', lost: '#ef4444' }

function formatDuration(item) {
  const start = new Date(item.created_at)
  const end = (item.status === 'delivered' || item.status === 'lost')
    ? new Date(item.updated_at ?? item.created_at)
    : new Date()
  const ms = Math.max(0, end - start)
  const hours = Math.floor(ms / 3600000)
  const mins = Math.floor((ms % 3600000) / 60000)
  return hours > 0 ? `${hours}s ${mins}dk` : `${mins}dk`
}

function PremiumAccordion({ itemId }) {
  const { data: garments = [], isLoading } = useQuery({
    queryKey: ['premium-garments', itemId],
    queryFn: () => laundryApi.getPremiumGarments(itemId),
    staleTime: 10_000,
  })

  if (isLoading) return <SkeletonTable rows={3} cols={3} />

  return (
    <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 4 }}>
      {garments.map(g => {
        const pgColor = PG_STATUS_COLORS[g.status] || '#64748b'
        return (
          <div key={g.id} style={{
            display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap',
            padding: '6px 10px', background: 'var(--surface)',
            border: '1px solid var(--border)', borderRadius: 6,
          }}>
            <span style={{ fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--accent)', fontWeight: 600 }}>
              {g.garment_code}
            </span>
            <span style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--text)' }}>
              {g.garment_type}
            </span>
            {g.brand && (
              <span style={{ fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--text3)' }}>{g.brand}</span>
            )}
            {g.model && (
              <span style={{ fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--text3)' }}>{g.model}</span>
            )}
            {g.size && (
              <span style={{
                fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--text2)',
                background: 'var(--surface2)', padding: '1px 6px', borderRadius: 4,
                border: '1px solid var(--border)',
              }}>{g.size}</span>
            )}
            {g.color && (
              <span style={{ display: 'flex', gap: 3, alignItems: 'center' }}>
                {parseColors(g.color).map((c, i) => (
                  <span key={i} style={{
                    width: 10, height: 10, borderRadius: '50%',
                    background: colorHex(c), border: '1px solid rgba(0,0,0,0.15)',
                    display: 'inline-block', flexShrink: 0,
                  }} title={c} />
                ))}
              </span>
            )}
            {g.pattern && (
              <span style={{
                fontFamily: 'var(--mono)', fontSize: 9, color: '#7c3aed',
                background: 'rgba(124,58,237,0.08)', padding: '1px 5px', borderRadius: 3,
              }}>{g.pattern}</span>
            )}
            <span style={{
              marginLeft: 'auto', padding: '2px 7px', borderRadius: 4, fontSize: 9,
              fontFamily: 'var(--mono)', background: pgColor + '18',
              border: `1px solid ${pgColor}30`, color: pgColor, flexShrink: 0,
            }}>
              {PG_STATUS_LABELS[g.status] || g.status}
            </span>
          </div>
        )
      })}
    </div>
  )
}

export default function AllRecordsTab() {
  const [statusFilter, setStatusFilter] = useState('all')
  const [search, setSearch] = useState('')
  const [expandedId, setExpandedId] = useState(null)

  const { data: rawItems = [], isLoading } = useQuery({
    queryKey: ['laundry-records-tab-all', statusFilter, search],
    queryFn: () => {
      const params = {}
      if (statusFilter !== 'all') params.status = statusFilter
      if (search) params.search = search
      return laundryApi.getItems(params)
    },
    refetchInterval: 30_000,
  })

  // Sort newest first (listItemsQuery sorts by updated_at ASC for kanban — override here)
  const items = [...rawItems].sort((a, b) => new Date(b.created_at) - new Date(a.created_at))

  return (
    <div>
      {/* Filter bar */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 14, flexWrap: 'wrap', alignItems: 'center' }}>
        <input
          className="form-input"
          value={search}
          onChange={e => { setSearch(e.target.value); setExpandedId(null) }}
          placeholder="Oda no veya isim..."
          style={{ flex: '1 1 180px', minWidth: 140 }}
        />
        <select
          className="form-input"
          value={statusFilter}
          onChange={e => { setStatusFilter(e.target.value); setExpandedId(null) }}
          style={{ width: 150 }}
        >
          <option value="all">Tüm Aktif</option>
          {Object.entries(STATUS_LABELS).map(([k, v]) => (
            <option key={k} value={k}>{v}</option>
          ))}
        </select>
      </div>

      {/* List */}
      {isLoading ? (
        <SkeletonTable rows={5} cols={4} />
      ) : items.length === 0 ? (
        <div className="panel" style={{ padding: '32px', textAlign: 'center' }}>
          <div style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--text3)' }}>Kayıt bulunamadı</div>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {items.map(item => {
            let cl = []
            try { cl = item.clothing_items ? JSON.parse(item.clothing_items) : [] } catch {}
            const isPremium = (item.premium_garment_count || 0) > 0
            const isExpanded = expandedId === item.id
            const statusColor = STATUS_COLORS[item.status] || 'var(--border)'

            return (
              <div key={item.id} style={{
                background: 'var(--surface)',
                border: `1px solid ${isPremium ? 'rgba(245,158,11,0.25)' : 'var(--border)'}`,
                borderLeft: `3px solid ${statusColor}`,
                borderRadius: 8, padding: '12px 16px',
              }}>
                {/* Line 1: Room · Person · Count · Status · Duration */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: cl.length > 0 ? 6 : 0 }}>
                  <span style={{ fontFamily: 'var(--display)', fontSize: 15, letterSpacing: 2, color: 'var(--text)' }}>
                    {item.block} · {item.room_no}
                  </span>
                  {isPremium && (
                    <span style={{ color: '#f59e0b', fontSize: 13, lineHeight: 1 }} title="Premium parça içeriyor">★</span>
                  )}
                  {item.intake_name && (
                    <span style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--text2)' }}>
                      {item.intake_name}
                    </span>
                  )}
                  <span style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--text3)' }}>
                    {item.item_count} parça
                  </span>
                  <span style={{
                    padding: '2px 8px', borderRadius: 4, fontSize: 9, fontFamily: 'var(--mono)',
                    background: statusColor + '18', border: `1px solid ${statusColor}30`, color: statusColor,
                  }}>
                    {STATUS_LABELS[item.status] || item.status}
                  </span>
                  <span style={{
                    fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--text3)', marginLeft: 'auto',
                  }}>
                    {formatDuration(item)}
                  </span>
                </div>

                {/* Line 2: Clothing types */}
                {cl.length > 0 && (
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginBottom: isPremium ? 6 : 0 }}>
                    {cl.map((c, i) => (
                      <span key={i} style={{
                        fontFamily: 'var(--mono)', fontSize: 9, padding: '2px 8px',
                        background: 'var(--surface2)', border: '1px solid var(--border)',
                        borderRadius: 12, color: 'var(--text2)',
                      }}>
                        {CLOTHING_ICONS[c.type] || ''} {c.qty > 1 ? `${c.qty}× ` : ''}{c.type}
                      </span>
                    ))}
                  </div>
                )}

                {/* Premium accordion trigger */}
                {isPremium && (
                  <button
                    type="button"
                    onClick={() => setExpandedId(isExpanded ? null : item.id)}
                    style={{
                      background: 'none', border: 'none', cursor: 'pointer', padding: 0,
                      fontFamily: 'var(--mono)', fontSize: 9, color: '#f59e0b',
                      display: 'flex', alignItems: 'center', gap: 4,
                    }}
                  >
                    {isExpanded ? '▲' : '▼'} {item.premium_garment_count} premium parça
                  </button>
                )}

                {/* Premium accordion content */}
                {isPremium && isExpanded && <PremiumAccordion itemId={item.id} />}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
