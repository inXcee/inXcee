import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import api from '../../../shared/api/client.js'
import { CATEGORIES, MOVE_LABEL, MOVE_COLOR, fmt, fmtDate, money } from '../constants.js'
import { confirmDialog } from '../../../shared/components/ConfirmDialog.jsx'
import MoreMenu from './MoreMenu.jsx'

export default function ItemDetailDrawer({ item, forecast, onClose, onEdit, onAdjust, onCheckout, onDelete, onWriteOff, onGoToPO, onTransfer }) {
  const c = CATEGORIES.find(x => x.key === item.category)
  const isOut = item.quantity <= 0
  const isLow = !isOut && item.quantity <= item.reorder_threshold
  const value = (item.quantity || 0) * (item.unit_price || 0)
  const [showAllLogs, setShowAllLogs] = useState(false)

  const { data: log = [] } = useQuery({
    queryKey: ['inventory-log', item.id],
    queryFn: () => api.get(`/inventory/${item.id}/log`).then(r => r.data),
    staleTime: 30000,
  })

  const { data: stockByLocation = [] } = useQuery({
    queryKey: ['stock-by-location', item.id],
    queryFn: () => api.get(`/inventory/${item.id}/stock-by-location`).then(r => r.data),
    enabled: !!item.track_locations,
    staleTime: 30000,
  })

  const { data: lots = [] } = useQuery({
    queryKey: ['item-lots-drawer', item.id],
    queryFn: () => api.get(`/inventory/items/${item.id}/lots`).then(r => r.data),
    enabled: !!item.track_lots,
    staleTime: 30000,
  })
  const activeLots = lots.filter(l => l.status === 'active')

  async function handleDelete() {
    const ok = await confirmDialog({
      title: 'Ürün sil',
      body: `"${item.item_name}" silinsin mi? Tüm hareket geçmişi de gider, geri alınamaz.`,
      danger: true,
      confirmLabel: 'Sil',
    })
    if (ok) onDelete()
  }

  const logsToShow = showAllLogs ? log : log.slice(0, 10)

  return (
    <div onClick={onClose} style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,.5)', zIndex: 9000,
      display: 'flex', justifyContent: 'flex-end',
    }}>
      <div onClick={e => e.stopPropagation()} style={{
        width: '100%', maxWidth: 520, height: '100%', overflowY: 'auto',
        background: 'var(--surface)', borderLeft: '1px solid var(--border)',
        padding: 20, boxShadow: '-8px 0 32px rgba(0,0,0,.4)',
      }}>
        {/* Başlık */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16, gap: 10 }}>
          <div style={{ minWidth: 0, flex: 1 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
              <span style={{ fontSize: 18, color: c?.color || 'var(--text3)' }}>{c?.icon || '▨'}</span>
              <h3 style={{ fontSize: 17, color: 'var(--text)', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis' }}>{item.item_name}</h3>
              {item.track_lots ? <span title="Lot takibi aktif" style={{ fontSize: 10, opacity: 0.6 }}>🏷</span> : null}
              {item.track_expiry ? <span title="SKT takibi aktif" style={{ fontSize: 10, opacity: 0.6 }}>⏳</span> : null}
            </div>
            <div style={{ fontSize: 11, fontFamily: 'var(--mono)', color: 'var(--text3)', letterSpacing: 1 }}>
              #{item.id} · {c?.label || '-'} · {item.location || 'Lokasyon yok'}
            </div>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--text3)', fontSize: 22, cursor: 'pointer', padding: 0 }}>×</button>
        </div>

        {/* Büyük stok göstergesi */}
        <div style={{
          padding: 16, borderRadius: 10, marginBottom: 12,
          background: isOut ? 'rgba(239,68,68,.08)' : isLow ? 'rgba(240,165,0,.06)' : 'var(--surface2)',
          border: `1px solid ${isOut ? 'var(--red)' : isLow ? 'rgba(240,165,0,.4)' : 'var(--border)'}`,
          textAlign: 'center',
        }}>
          <div style={{ fontSize: 11, fontFamily: 'var(--mono)', color: 'var(--text3)', letterSpacing: 2 }}>
            {isOut ? 'STOK TÜKENDİ' : isLow ? 'STOK YETERSİZ' : 'MEVCUT STOK'}
          </div>
          <div style={{
            fontSize: 48, fontWeight: 700, fontFamily: 'var(--mono)', lineHeight: 1, marginTop: 4,
            color: isOut ? 'var(--red)' : isLow ? 'var(--accent)' : 'var(--text)',
          }}>
            {item.quantity} <span style={{ fontSize: 18, color: 'var(--text3)', fontWeight: 400 }}>{item.unit}</span>
          </div>
          {forecast && forecast.daily_avg > 0 && (
            <div style={{ marginTop: 8, fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--text3)' }}>
              günlük {Number(forecast.daily_avg).toFixed(1)} · ≈ <strong style={{ color: forecast.severity === 'critical' ? 'var(--red)' : 'var(--accent)' }}>{forecast.days_left}g</strong> kaldı
            </div>
          )}
        </div>

        {/* Primary aksiyonlar */}
        <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
          <button onClick={() => onAdjust('+')} className="btn btn-primary" style={{ flex: 1, background: 'var(--green)', borderColor: 'var(--green)' }}>
            + STOK
          </button>
          <button onClick={onCheckout} className="btn btn-primary" style={{ flex: 1, background: 'var(--red)', borderColor: 'var(--red)' }}>
            − ÇIKIŞ
          </button>
          <MoreMenu items={[
            { icon: '↘', label: 'Hızlı azalt', onClick: () => onAdjust('-') },
            { icon: '✏', label: 'Düzenle', onClick: onEdit },
            { icon: '⚠', label: 'Zayiat / Kayıp', onClick: onWriteOff, color: 'var(--accent)' },
            { divider: true },
            { icon: '🗑', label: 'Ürünü Sil', onClick: handleDelete, color: 'var(--red)' },
          ]} />
        </div>

        {/* Sipariş CTA */}
        {(isOut || isLow) && item.preferred_supplier_id && onGoToPO && (
          <button onClick={onGoToPO} style={{
            width: '100%', marginBottom: 12, padding: '10px 12px',
            background: 'var(--accent)', color: '#000', border: 'none', borderRadius: 8,
            fontSize: 11, fontWeight: 700, fontFamily: 'var(--mono)', letterSpacing: 1.5,
            cursor: 'pointer',
          }}>
            📦 SİPARİŞ OLUŞTUR · {item.supplier_name}
          </button>
        )}

        {/* Lokasyon dağılımı — track_locations ürünlerde */}
        {item.track_locations ? (
          <div style={{
            padding: '10px 12px', marginBottom: 12, borderRadius: 8,
            background: 'rgba(52,152,219,.04)', border: '1px solid rgba(52,152,219,.2)',
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
              <span style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--blue)', letterSpacing: 1.5 }}>
                📍 LOKASYON DAĞILIMI ({stockByLocation.length})
              </span>
              {onTransfer && stockByLocation.some(s => s.quantity > 0) && (
                <button onClick={onTransfer} style={{
                  background: 'transparent', border: '1px solid rgba(52,152,219,.3)', borderRadius: 6,
                  padding: '3px 8px', fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--blue)',
                  cursor: 'pointer', letterSpacing: 1,
                }}>↔ TRANSFER</button>
              )}
            </div>
            {stockByLocation.length === 0 ? (
              <div style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--text3)' }}>
                Henüz lokasyon ataması yok — mal giriş yapınca dağılır
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                {stockByLocation.map(s => (
                  <div key={s.location_id} style={{
                    display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8,
                    padding: '4px 0', fontSize: 11,
                  }}>
                    <span style={{ color: s.is_active ? 'var(--text)' : 'var(--text3)' }}>
                      {s.block ? <span style={{ fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--accent)', marginRight: 6 }}>{s.block}</span> : null}
                      {s.name}
                      {!s.is_active && <span style={{ fontSize: 8, color: 'var(--text4)', marginLeft: 4 }}>(pasif)</span>}
                    </span>
                    <span style={{ fontFamily: 'var(--mono)', fontWeight: 700, color: s.quantity > 0 ? 'var(--text)' : 'var(--text3)' }}>
                      {s.quantity} {item.unit}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        ) : null}

        {/* Aktif Lotlar — track_lots ürünlerde */}
        {item.track_lots ? (
          <div style={{
            padding: '10px 12px', marginBottom: 12, borderRadius: 8,
            background: 'rgba(155,89,182,.04)', border: '1px solid rgba(155,89,182,.2)',
          }}>
            <div style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--purple)', letterSpacing: 1.5, marginBottom: 8 }}>
              🏷 AKTİF LOTLAR ({activeLots.length})
            </div>
            {activeLots.length === 0 ? (
              <div style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--text3)' }}>
                Aktif lot yok — mal giriş yapınca FIFO dağılır
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                {activeLots.slice(0, 5).map(l => {
                  const daysLeft = l.expiry_date ? Math.floor((new Date(l.expiry_date) - new Date()) / (1000 * 60 * 60 * 24)) : null
                  const expCritical = daysLeft !== null && daysLeft <= 7
                  const expWarning = daysLeft !== null && daysLeft <= 30 && daysLeft > 7
                  return (
                    <div key={l.id} style={{
                      display: 'grid', gridTemplateColumns: '1fr auto auto', gap: 8,
                      padding: '4px 0', fontSize: 11, alignItems: 'center',
                    }}>
                      <span style={{ fontFamily: 'var(--mono)', color: 'var(--accent)', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {l.lot_no || `#${l.id}`}
                      </span>
                      <span style={{ fontFamily: 'var(--mono)', fontWeight: 700 }}>
                        {l.quantity} {item.unit}
                      </span>
                      {l.expiry_date ? (
                        <span style={{
                          fontFamily: 'var(--mono)', fontSize: 9, padding: '2px 6px', borderRadius: 4,
                          background: expCritical ? 'rgba(231,76,60,.12)' : expWarning ? 'rgba(240,165,0,.12)' : 'var(--surface2)',
                          color: expCritical ? 'var(--red)' : expWarning ? 'var(--amber)' : 'var(--text3)',
                        }}>
                          {daysLeft <= 0 ? 'GEÇTİ' : `${daysLeft}g`}
                        </span>
                      ) : <span style={{ fontSize: 9, color: 'var(--text4)' }}>SKT yok</span>}
                    </div>
                  )
                })}
                {activeLots.length > 5 && (
                  <div style={{ fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--text3)', textAlign: 'center', marginTop: 4 }}>
                    +{activeLots.length - 5} lot daha · LOT/SKT sekmesinden gör
                  </div>
                )}
              </div>
            )}
          </div>
        ) : null}

        {/* Kompakt info — 4 satır */}
        <div style={{
          padding: '10px 12px', marginBottom: 12, borderRadius: 8,
          background: 'var(--surface2)', border: '1px solid var(--border)',
          display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px 16px',
          fontSize: 11,
        }}>
          <InfoRow label="Eşik / Güvenli" value={`${item.reorder_threshold || '—'} · ${item.safety_stock_days ?? '—'}g`} />
          <InfoRow label="Fiyat / Değer" value={`${money(item.unit_price)} · ${money(value)}`} />
          <InfoRow label="SKU" value={item.sku || '—'} mono />
          <InfoRow label="Tedarikçi" value={item.supplier_name ? `${item.supplier_name}${item.lead_time_days != null ? ` · ${item.lead_time_days}g` : ''}` : '—'} />
          <div style={{ gridColumn: '1 / -1' }}>
            <InfoRow label="Son güncelleme" value={fmtDate(item.last_updated)} />
          </div>
        </div>

        {/* Hareket geçmişi */}
        <div style={{
          padding: '12px 14px', background: 'var(--surface2)',
          borderRadius: 8, border: '1px solid var(--border)',
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 8 }}>
            <span style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--text3)', letterSpacing: 2 }}>
              HAREKETLER ({log.length})
            </span>
            {log.length > 10 && (
              <button onClick={() => setShowAllLogs(s => !s)} style={{
                background: 'none', border: 'none', color: 'var(--text3)',
                fontFamily: 'var(--mono)', fontSize: 9, letterSpacing: 1, cursor: 'pointer',
              }}>{showAllLogs ? '↑ AZ' : '↓ TÜMÜ'}</button>
            )}
          </div>
          {log.length === 0 ? (
            <div style={{ fontSize: 12, color: 'var(--text3)', padding: '8px 0' }}>Henüz hareket yok</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              {logsToShow.map(m => (
                <div key={m.id} style={{
                  padding: '8px 0', borderTop: '1px solid var(--border)',
                  display: 'grid', gridTemplateColumns: '70px 56px 1fr 70px', gap: 8, alignItems: 'center',
                  fontSize: 11,
                }}>
                  <span style={{ fontFamily: 'var(--mono)', color: 'var(--text3)' }}>{fmt(m.created_at)}</span>
                  <span style={{ fontFamily: 'var(--mono)', fontSize: 9, padding: '2px 6px', borderRadius: 3, textAlign: 'center', background: `${MOVE_COLOR[m.type]}22`, color: MOVE_COLOR[m.type] }}>
                    {MOVE_LABEL[m.type]}
                  </span>
                  <div style={{ minWidth: 0 }}>
                    <div style={{
                      fontFamily: 'var(--mono)', fontWeight: 600,
                      color: m.delta > 0 ? 'var(--green)' : m.delta < 0 ? 'var(--red)' : 'var(--text)',
                    }}>
                      {m.delta > 0 ? '+' : ''}{m.delta} → {m.quantity_after}
                    </div>
                    {m.reason && <div style={{ color: 'var(--text3)', fontSize: 10, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{m.reason}</div>}
                  </div>
                  <span style={{ fontSize: 10, color: 'var(--text3)', textAlign: 'right', overflow: 'hidden', textOverflow: 'ellipsis' }}>{m.username || '—'}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function InfoRow({ label, value, mono }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8 }}>
      <span style={{ fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--text3)', letterSpacing: 1 }}>{label}</span>
      <span style={{
        color: value === '—' ? 'var(--text3)' : 'var(--text)',
        fontFamily: mono ? 'var(--mono)' : undefined,
        fontSize: 11, textAlign: 'right', minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
      }}>{value}</span>
    </div>
  )
}
