import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { useQueryClient } from '@tanstack/react-query'

const QUERY_LABELS = {
  'water-adjustments': 'Stok düzeltmeleri',
  'water-alerts': 'Operasyon uyarıları',
  'water-brands': 'Markalar',
  'water-daily-ledger': 'Günlük dağıtım dökümü',
  'water-daily-digest': 'Günlük özet teslimi',
  'water-day': 'Günlük dağıtımlar',
  'water-deposit': 'Depozito bakiyesi',
  'water-forecast': 'Stok tahmini',
  'water-intake': 'Gelen irsaliyeler',
  'water-pending': 'İrsaliye bekleyenler',
  'water-pivot': 'Dağıtım matrisi',
  'water-products': 'Ürünler',
  'water-products-all': 'Ürün ayarları',
  'water-reconciliation': 'Ay sonu karşılaştırması',
  'water-returns': 'Boş iadeler',
  'water-review': 'Kontrol bekleyenler',
  'water-summary': 'Genel stok özeti',
  'water-templates': 'Hızlı giriş şablonları',
  'water-trends': 'Tüketim eğilimleri',
  'water-truck-arrivals': 'Tır ve personel girişleri',
  'water-waybill-photos': 'İrsaliye fotoğrafları',
  'water-zone-history': 'Dağıtım yeri geçmişi',
  'water-zones': 'Dağıtım yerleri',
}

function isWaterQuery(query) {
  return String(query.queryKey?.[0] || '').startsWith('water-')
}

function queryLabel(queryKey) {
  const root = String(queryKey?.[0] || '')
  return QUERY_LABELS[root] || root.replace(/^water-/, '').replaceAll('-', ' ')
}

function queryErrorText(error) {
  if (error?.response?.status === 401) return 'Oturum doğrulanamadı'
  if (!error?.response) return 'Sunucuya ulaşılamadı'
  return error.response?.data?.error || 'Veri alınamadı'
}

function collectFailures(queryClient) {
  return queryClient.getQueryCache().getAll()
    .filter(query => isWaterQuery(query) && query.state.status === 'error')
    .map(query => ({
      hash: query.queryHash,
      queryKey: query.queryKey,
      label: queryLabel(query.queryKey),
      message: queryErrorText(query.state.error),
      fetching: query.state.fetchStatus === 'fetching',
    }))
    .sort((a, b) => a.label.localeCompare(b.label, 'tr'))
}

function sameFailures(current, next) {
  if (current.length !== next.length) return false
  return current.every((item, index) => (
    item.hash === next[index].hash
    && item.message === next[index].message
    && item.fetching === next[index].fetching
  ))
}

export default function WaterQueryErrorCenter() {
  const queryClient = useQueryClient()
  const [failures, setFailures] = useState(() => collectFailures(queryClient))

  useEffect(() => {
    let active = true
    let scheduled = false

    const refresh = () => {
      if (scheduled) return
      scheduled = true
      queueMicrotask(() => {
        scheduled = false
        if (!active) return
        const next = collectFailures(queryClient)
        setFailures(current => (sameFailures(current, next) ? current : next))
      })
    }

    refresh()
    const unsubscribe = queryClient.getQueryCache().subscribe(refresh)
    return () => {
      active = false
      unsubscribe()
    }
  }, [queryClient])

  if (failures.length === 0 || typeof document === 'undefined') return null

  const retrying = failures.some(item => item.fetching)
  const retryFailed = () => queryClient.refetchQueries({
    type: 'all',
    predicate: query => isWaterQuery(query) && query.state.status === 'error',
  })
  const visible = failures.slice(0, 4)

  return createPortal(
    <div
      role="alert"
      aria-live="assertive"
      data-testid="water-query-error-center"
      style={{
        position: 'fixed',
        right: 'clamp(12px, 2vw, 24px)',
        bottom: '16px',
        zIndex: 1200,
        width: 'min(420px, calc(100vw - 24px))',
        border: '1px solid var(--red)',
        borderLeft: '5px solid var(--red)',
        borderRadius: '8px',
        background: 'var(--surface)',
        boxShadow: '0 16px 48px rgba(0,0,0,.28)',
        padding: '12px 14px',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: '12px' }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: '13px', fontWeight: 800, color: 'var(--red)' }}>Su verileri yüklenemedi</div>
          <div style={{ marginTop: '2px', color: 'var(--text3)', fontSize: '10px' }}>
            {failures.length} veri kaynağı · bazı paneller güncel olmayabilir
          </div>
        </div>
        <button type="button" className="btn btn-danger btn-sm" onClick={retryFailed} disabled={retrying}>
          {retrying ? 'Deneniyor...' : 'Tekrar dene'}
        </button>
      </div>
      <div style={{ marginTop: '9px', borderTop: '1px solid var(--border)', paddingTop: '7px', display: 'grid', gap: '5px' }}>
        {visible.map(item => (
          <div key={item.hash} style={{ display: 'flex', justifyContent: 'space-between', gap: '10px', fontSize: '11px' }}>
            <span style={{ color: 'var(--text)', fontWeight: 650, minWidth: 0 }}>{item.label}</span>
            <span style={{ color: 'var(--text3)', textAlign: 'right' }}>{item.message}</span>
          </div>
        ))}
        {failures.length > visible.length && (
          <div style={{ color: 'var(--text3)', fontSize: '10px' }}>+{failures.length - visible.length} kaynak daha</div>
        )}
      </div>
    </div>,
    document.body,
  )
}
