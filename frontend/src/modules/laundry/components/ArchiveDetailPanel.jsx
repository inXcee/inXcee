import { useQuery } from '@tanstack/react-query'
import { laundryApi } from '../api.js'
import PremiumGarmentList from './PremiumGarmentList.jsx'

const STAGE_LABELS = {
  washing_to_ready: 'Yıkama sonrası',
  ironing_to_ready: 'Ütü sonrası',
  delivery: 'Teslim',
}

export default function ArchiveDetailPanel({ item, onClose }) {
  const { data: history = [] } = useQuery({
    queryKey: ['laundry-history', item.id],
    queryFn: () => laundryApi.getItemHistory(item.id),
  })
  const { data: verifications = [] } = useQuery({
    queryKey: ['laundry-verifications', item.id],
    queryFn: () => laundryApi.getVerifications(item.id),
  })

  const clothing = (() => {
    try { return JSON.parse(item.clothing_items || '[]') } catch { return [] }
  })()

  const STATUS_COLORS = {
    dirty: 'var(--accent)', washing: 'var(--blue)', ironing: '#6366f1',
    ready: 'var(--green)', delivered: 'var(--teal)', lost: 'var(--red)',
  }

  return (
    <div style={{
      position: 'fixed', right: 0, top: 0, height: '100%', width: 380,
      background: 'var(--surface)', borderLeft: '1px solid var(--border)',
      boxShadow: '-8px 0 32px rgba(0,0,0,0.4)', zIndex: 1050,
      overflowY: 'auto', display: 'flex', flexDirection: 'column',
    }}>
      {/* Header */}
      <div style={{
        padding: '16px 20px', borderBottom: '1px solid var(--border)',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        background: 'var(--surface2)', position: 'sticky', top: 0, zIndex: 1,
      }}>
        <div>
          <div style={{ fontFamily: 'var(--display)', fontSize: 18, letterSpacing: 3, color: 'var(--text)' }}>
            {item.block} · {item.room_no}
          </div>
          <div style={{ fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--text3)', marginTop: 2 }}>
            #{item.id} · {item.item_count} parça
          </div>
        </div>
        <button onClick={onClose} style={{
          background: 'none', border: 'none', cursor: 'pointer',
          color: 'var(--text3)', fontSize: 20, lineHeight: 1,
        }}>✕</button>
      </div>

      <div style={{ padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: 20 }}>

        {/* Özet */}
        <div style={{
          display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8,
          padding: '12px', background: 'var(--surface2)', borderRadius: 8,
          border: '1px solid var(--border)',
        }}>
          {[
            ['Teslim Eden', item.intake_name || '—'],
            ['Teslim Alınan', item.delivered_to || '—'],
            ['Giriş', item.created_at?.slice(0, 16) || '—'],
            ['Teslim', item.delivered_at?.slice(0, 16) || '—'],
            ['Süre', item.total_hours != null ? `${item.total_hours} saat` : '—'],
            ['Ütü', item.needs_ironing ? 'Evet' : 'Hayır'],
          ].map(([label, value]) => (
            <div key={label}>
              <div style={{ fontFamily: 'var(--mono)', fontSize: 8, color: 'var(--text3)', letterSpacing: 1, marginBottom: 2 }}>{label.toUpperCase()}</div>
              <div style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--text)' }}>{value}</div>
            </div>
          ))}
        </div>

        {/* Premium Garment detayı (readonly) */}
        {item.is_premium === 1 && (
          <div>
            <div style={{ fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--text3)', letterSpacing: 1.5, marginBottom: 6 }}>PREMİUM KIYAFETler</div>
            <PremiumGarmentList item={item} />
          </div>
        )}

        {/* Kıyafetler */}
        {clothing.length > 0 && item.is_premium !== 1 && (
          <div>
            <div style={{ fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--text3)', letterSpacing: 1.5, marginBottom: 8 }}>KIYAFETler</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              {clothing.map((c, i) => (
                <div key={i} style={{
                  display: 'flex', alignItems: 'center', gap: 8,
                  padding: '6px 10px', background: 'var(--surface2)',
                  border: '1px solid var(--border)', borderRadius: 6,
                  fontFamily: 'var(--mono)', fontSize: 11,
                }}>
                  <span style={{ color: 'var(--text)' }}>{c.type}</span>
                  {c.color && <span style={{ color: 'var(--text3)' }}>· {c.color}</span>}
                  <span style={{ marginLeft: 'auto', color: 'var(--accent)', fontFamily: 'var(--display)', fontSize: 14 }}>×{c.qty || c.count || 1}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Doğrulama */}
        {verifications.length > 0 && (
          <div>
            <div style={{ fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--text3)', letterSpacing: 1.5, marginBottom: 8 }}>PARÇA DOĞRULAMA</div>
            {verifications.map(v => (
              <div key={v.id} style={{
                padding: '10px 12px', borderRadius: 8, marginBottom: 6,
                background: v.all_present ? 'rgba(39,201,106,0.07)' : 'rgba(231,165,0,0.07)',
                border: `1px solid ${v.all_present ? 'rgba(39,201,106,0.25)' : 'rgba(231,165,0,0.25)'}`,
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                  <span style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--text)' }}>
                    {STAGE_LABELS[v.stage] || v.stage}
                  </span>
                  <span style={{
                    fontFamily: 'var(--mono)', fontSize: 9,
                    color: v.all_present ? 'var(--green)' : 'var(--accent)',
                  }}>
                    {v.all_present ? '✓ Tam' : '⚠ Eksik'}
                  </span>
                </div>
                {v.missing_notes && (
                  <div style={{ fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--text3)', fontStyle: 'italic', marginBottom: 4 }}>
                    {v.missing_notes}
                  </div>
                )}
                <div style={{ fontFamily: 'var(--mono)', fontSize: 8, color: 'var(--text4)' }}>
                  {v.verified_by} · {v.verified_at?.slice(0, 16)}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Timeline */}
        <div>
          <div style={{ fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--text3)', letterSpacing: 1.5, marginBottom: 8 }}>TİMELİNE</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {history.map((h, idx) => (
              <div key={h.id} style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
                <div style={{
                  width: 7, height: 7, borderRadius: '50%', flexShrink: 0, marginTop: 3,
                  background: STATUS_COLORS[h.to_status] || 'var(--text3)',
                }} />
                <div>
                  <div style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--text)' }}>
                    {h.from_status ? `${h.from_status} → ` : ''}{h.to_status}
                    {h.actor_name && <span style={{ color: 'var(--text3)', marginLeft: 6 }}>· {h.actor_name}</span>}
                  </div>
                  {h.notes && (
                    <div style={{ fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--text3)', fontStyle: 'italic' }}>{h.notes}</div>
                  )}
                  <div style={{ fontFamily: 'var(--mono)', fontSize: 8, color: 'var(--text4)' }}>
                    {h.created_at ? new Date(h.created_at).toLocaleString('tr-TR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : ''}
                  </div>
                </div>
              </div>
            ))}
            {history.length === 0 && (
              <div style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--text4)' }}>Geçmiş yok</div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
