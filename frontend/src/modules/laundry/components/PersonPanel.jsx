import { useQuery } from '@tanstack/react-query'
import { laundryApi } from '../api.js'

const STATUS_COLORS = { dirty: 'var(--accent)', washing: 'var(--blue)', ready: 'var(--green)', delivered: 'var(--teal)', lost: 'var(--red)' }
const STATUS_LABELS = { dirty: 'Sepette', washing: 'Yıkanıyor', ready: 'Rafta', delivered: 'Teslim', lost: 'Kayıp' }

export default function PersonPanel({ name, onClose }) {
  const { data, isLoading } = useQuery({
    queryKey: ['person-history', name],
    queryFn: () => laundryApi.getPersonHistory(name),
    enabled: !!name,
  })

  return (
    <>
      {/* Backdrop */}
      <div
        onClick={onClose}
        style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', zIndex: 1100 }}
      />
      {/* Panel */}
      <div style={{
        position: 'fixed', right: 0, top: 0, bottom: 0, width: 380, maxWidth: '92vw',
        background: 'var(--surface)', borderLeft: '1px solid var(--border)',
        zIndex: 1101, display: 'flex', flexDirection: 'column',
        boxShadow: '-8px 0 32px rgba(0,0,0,0.4)',
        animation: 'slideInRight 0.2s ease',
      }}>

        {/* Header */}
        <div style={{
          padding: '16px 20px', borderBottom: '1px solid var(--border)',
          background: 'linear-gradient(135deg, rgba(240,165,0,0.06), transparent)',
          display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start',
        }}>
          <div>
            <div style={{ fontFamily: 'var(--display)', fontSize: 22, letterSpacing: 3, color: 'var(--text)', lineHeight: 1, marginBottom: 4 }}>
              {name}
            </div>
            {data?.room && (
              <div style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--text3)' }}>{data.room}</div>
            )}
            {data?.phone && (
              <a href={`https://wa.me/${data.phone.replace(/\D/g,'').replace(/^0/,'90')}`}
                target="_blank" rel="noreferrer"
                style={{ fontFamily: 'var(--mono)', fontSize: 10, color: '#25D366', textDecoration: 'none' }}>
                📱 {data.phone} →
              </a>
            )}
          </div>
          <button className="btn btn-ghost btn-xs" onClick={onClose}>✕</button>
        </div>

        {isLoading ? (
          <div style={{ padding: 20, fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--text3)' }}>yükleniyor...</div>
        ) : data ? (
          <div style={{ flex: 1, overflowY: 'auto', padding: 16 }}>

            {/* KPI */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 16 }}>
              {[
                { label: 'Toplam Verdi', value: data.total_given, color: 'var(--accent)' },
                { label: 'Teslim Aldı', value: data.total_delivered, color: 'var(--green)' },
                { label: 'Ort. Süre (saat)', value: data.avg_hours ?? '—', color: 'var(--blue)' },
                { label: 'Kayıp', value: data.total_lost, color: data.total_lost > 0 ? 'var(--red)' : 'var(--text3)' },
              ].map(k => (
                <div key={k.label} style={{
                  background: 'var(--surface2)', border: '1px solid var(--border)',
                  borderTop: `2px solid ${k.color}`, borderRadius: 8, padding: '10px 12px',
                }}>
                  <div style={{ fontFamily: 'var(--display)', fontSize: 28, color: k.color, lineHeight: 1, marginBottom: 3 }}>{k.value}</div>
                  <div style={{ fontFamily: 'var(--mono)', fontSize: 8, color: 'var(--text3)', letterSpacing: 1 }}>{k.label.toUpperCase()}</div>
                </div>
              ))}
            </div>

            {/* Geçmiş Listesi */}
            <div style={{ fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--text3)', letterSpacing: 2, marginBottom: 8 }}>GEÇMİŞ</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {[...(data.items ?? [])].sort(
                (a, b) => new Date(b.created_at) - new Date(a.created_at)
              ).map(item => (
                <div key={item.id} style={{
                  padding: '10px 12px', background: 'var(--surface2)',
                  border: '1px solid var(--border)', borderRadius: 8,
                  borderLeft: `2px solid ${STATUS_COLORS[item.status] || 'var(--border)'}`,
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 3 }}>
                    <span style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--text)' }}>
                      {item.block} · {item.room_no} — {item.item_count} parça
                    </span>
                    <span className={`badge badge-${item.status === 'delivered' ? 'green' : item.status === 'lost' ? 'red' : item.status === 'ready' ? 'blue' : 'gray'}`} style={{ fontSize: 7 }}>
                      {STATUS_LABELS[item.status] || item.status}
                    </span>
                  </div>
                  {item.clothing_items && (() => {
                    try {
                      const cl = JSON.parse(item.clothing_items)
                      return (
                        <div style={{ fontFamily: 'var(--mono)', fontSize: 8, color: 'var(--text3)', marginBottom: 2 }}>
                          {cl.map(c => `${c.qty}× ${c.type}${c.color ? ` (${c.color})` : ''}`).join(' · ')}
                        </div>
                      )
                    } catch { return null }
                  })()}
                  <div style={{ fontFamily: 'var(--mono)', fontSize: 8, color: 'var(--text3)' }}>
                    {new Date(item.created_at).toLocaleDateString('tr-TR', { day: '2-digit', month: 'short', year: 'numeric' })}
                    {item.total_hours != null && ` · ${item.total_hours}s sürdü`}
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <div style={{ padding: 20, fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--text3)' }}>Geçmiş bulunamadı.</div>
        )}
      </div>
    </>
  )
}
