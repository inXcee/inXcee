import { useQuery } from '@tanstack/react-query'
import api from '../../../shared/api/client.js'
import { CATEGORIES, MOVE_LABEL, MOVE_COLOR, fmt, fmtDate, money } from '../constants.js'
import { confirmDialog } from '../../../shared/components/ConfirmDialog.jsx'

export default function ItemDetailDrawer({ item, forecast, onClose, onEdit, onAdjust, onCheckout, onDelete, onWriteOff, onGoToPO }) {
  const c = CATEGORIES.find(x => x.key === item.category)
  const isOut = item.quantity <= 0
  const isLow = !isOut && item.quantity <= item.reorder_threshold
  const value = (item.quantity || 0) * (item.unit_price || 0)

  const { data: log = [] } = useQuery({
    queryKey: ['inventory-log', item.id],
    queryFn: () => api.get(`/inventory/${item.id}/log`).then(r => r.data),
    staleTime: 30000,
  })

  async function handleDelete() {
    const ok = await confirmDialog({
      title: 'Ürün sil',
      body: `"${item.item_name}" silinsin mi? Tüm hareket geçmişi de gider, geri alınamaz.`,
      danger: true,
      confirmLabel: 'Sil',
    })
    if (ok) onDelete()
  }

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
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
              <span style={{ fontSize: 18, color: c?.color || 'var(--text3)' }}>{c?.icon || '▨'}</span>
              <h3 style={{ fontSize: 17, color: 'var(--text)' }}>{item.item_name}</h3>
            </div>
            <div style={{ fontSize: 11, fontFamily: 'var(--mono)', color: 'var(--text3)', letterSpacing: 1 }}>
              ID #{item.id} · {c?.label || '-'} · {item.location || 'Lokasyon yok'}
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
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, marginBottom: 12 }}>
          <MiniStat label="Sipariş eşiği" value={item.reorder_threshold || '—'} />
          <MiniStat label="Birim fiyat" value={money(item.unit_price)} />
          <MiniStat label="Toplam değer" value={money(value)} />
        </div>

        {/* Tahmin paneli — son 14 gün tüketim varsa */}
        {forecast && forecast.daily_avg > 0 && (
          <div style={{
            padding: '10px 12px', marginBottom: 12, borderRadius: 8,
            background: forecast.severity === 'critical' ? 'rgba(239,68,68,.08)' : 'rgba(240,165,0,.06)',
            border: `1px solid ${forecast.severity === 'critical' ? 'rgba(239,68,68,.35)' : 'rgba(240,165,0,.3)'}`,
            display: 'flex', alignItems: 'center', gap: 10,
          }}>
            <span style={{ fontSize: 18 }}>⌛</span>
            <div style={{ flex: 1, fontSize: 11 }}>
              <div style={{ fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--text3)', letterSpacing: 1.5 }}>TÜKETIM TAHMINI (son 14 gün)</div>
              <div style={{ color: 'var(--text)', marginTop: 2 }}>
                Günlük ort. <strong style={{ fontFamily: 'var(--mono)' }}>{Number(forecast.daily_avg).toFixed(2)} {item.unit}</strong>
                {forecast.days_left != null && (
                  <> · ≈ <strong style={{ color: forecast.severity === 'critical' ? 'var(--red)' : 'var(--accent)' }}>{forecast.days_left} gün</strong> kaldı</>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Detay info — SKU / tedarikçi / lead time / son guncelleme */}
        <div style={{
          padding: '10px 12px', marginBottom: 12, borderRadius: 8,
          background: 'var(--surface2)', border: '1px solid var(--border)',
          display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px 16px',
          fontSize: 11,
        }}>
          <InfoRow label="SKU" value={item.sku || '—'} mono />
          <InfoRow label="Tedarikçi" value={item.supplier_name || '—'} />
          <InfoRow label="Tedarik süresi" value={item.lead_time_days != null ? `${item.lead_time_days} gün` : '—'} />
          <InfoRow label="Güvenli stok" value={item.safety_stock_days != null ? `${item.safety_stock_days} gün` : '—'} />
          <InfoRow label="Lot takibi" value={item.track_lots ? 'Aktif' : '—'} />
          <InfoRow label="SKT takibi" value={item.track_expiry ? 'Aktif' : '—'} />
          <div style={{ gridColumn: '1 / -1' }}>
            <InfoRow label="Son güncelleme" value={fmtDate(item.last_updated)} />
          </div>
        </div>

        {/* Sipariş CTA — düşük/tükenmiş stok + tedarikçi varsa */}
        {(isOut || isLow) && item.preferred_supplier_id && onGoToPO && (
          <button onClick={onGoToPO} style={{
            width: '100%', marginBottom: 12, padding: '10px 12px',
            background: 'var(--accent)', color: '#000', border: 'none', borderRadius: 8,
            fontSize: 11, fontWeight: 700, fontFamily: 'var(--mono)', letterSpacing: 1.5,
            cursor: 'pointer',
          }}>
            📦 SIPARIS OLUSTUR · {item.supplier_name}
          </button>
        )}

        {/* Aksiyon butonları */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 16 }}>
          <button onClick={() => onAdjust('+')} className="btn btn-primary" style={{ background: 'var(--green)', borderColor: 'var(--green)' }}>
            + STOK EKLE
          </button>
          <button onClick={onCheckout} className="btn btn-primary" style={{ background: 'var(--red)', borderColor: 'var(--red)' }}>
            − ÇIKIŞ YAP
          </button>
          <button onClick={() => onAdjust('-')} className="btn btn-ghost btn-sm">↘ Hızlı azalt</button>
          <button onClick={onEdit} className="btn btn-ghost btn-sm">✏ Düzenle</button>
          <button onClick={onWriteOff} className="btn btn-ghost btn-sm" style={{ color: 'var(--accent)' }}>⚠ Zayiat / Kayıp</button>
          <button onClick={handleDelete} className="btn btn-ghost btn-sm" style={{ color: 'var(--red)' }}>🗑 Ürünü Sil</button>
        </div>

        {/* Hareket geçmişi */}
        <div style={{
          padding: '12px 14px', background: 'var(--surface2)',
          borderRadius: 8, border: '1px solid var(--border)',
        }}>
          <div style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--text3)', letterSpacing: 2, marginBottom: 8 }}>
            HAREKET GEÇMİŞİ ({log.length})
          </div>
          {log.length === 0 ? (
            <div style={{ fontSize: 12, color: 'var(--text3)', padding: '8px 0' }}>Henüz hareket yok</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              {log.slice(0, 30).map(m => (
                <div key={m.id} style={{
                  padding: '8px 0', borderTop: '1px solid var(--border)',
                  display: 'grid', gridTemplateColumns: '70px 60px 1fr 80px', gap: 8, alignItems: 'center',
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
                      {m.delta > 0 ? '+' : ''}{m.delta} {item.unit} → {m.quantity_after}
                    </div>
                    {m.reason && <div style={{ color: 'var(--text3)', fontSize: 10 }}>{m.reason}</div>}
                  </div>
                  <span style={{ fontSize: 10, color: 'var(--text3)', textAlign: 'right' }}>{m.user_name || '—'}</span>
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

function MiniStat({ label, value }) {
  return (
    <div style={{
      padding: '8px 10px', background: 'var(--surface2)',
      border: '1px solid var(--border)', borderRadius: 6, textAlign: 'center',
    }}>
      <div style={{ fontFamily: 'var(--mono)', fontSize: 8, color: 'var(--text3)', letterSpacing: 1.5, marginBottom: 2 }}>{label}</div>
      <div style={{ fontFamily: 'var(--mono)', fontSize: 13, color: 'var(--text)' }}>{value}</div>
    </div>
  )
}
