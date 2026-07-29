import { useState, Suspense } from 'react'
import { lazyWithRetry as lazy } from '../../../shared/lazyWithRetry.js'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import mobileApi from '../auth/mobileApi.js'
import { useToastStore } from '../../../shared/store/toastStore.js'
import GarmentChecklist from './GarmentChecklist.jsx'

const QrScannerModal = lazy(() => import('../../../shared/components/QrScannerModal.jsx'))

const STATUS_LABEL = {
  dirty: 'Kirli',
  pending_collection: 'Toplanacak',
  washing: 'Yıkanıyor',
  ironing: 'Ütüde',
  ready: 'Hazır',
  delivered: 'Teslim Edildi',
  lost: 'Kayıp',
}

const NEXT = {
  pending_collection: { action: 'collect', label: '→ Topla', color: '#3b82f6' },
  dirty: { action: 'advance', label: '→ Yıkamaya', color: '#3b82f6' },
  washing: { action: 'advance', label: '→ Yıkamayı Bitir', color: '#10b981' },
  ironing: { action: 'checklist', label: 'Tekil Ütüyü Aç', color: '#8b5cf6' },
}

export default function BagScan() {
  const qc = useQueryClient()
  const { addToast } = useToastStore()
  const [showQr, setShowQr] = useState(false)
  const [bag, setBag] = useState(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [showChecklist, setShowChecklist] = useState(false)

  async function handleScan(code) {
    setError('')
    try {
      const r = await mobileApi.get(`/laundry/items/by-code/${encodeURIComponent(code)}`)
      setBag(r.data)
      navigator.vibrate?.([20])
    } catch (e) {
      if (e.response?.status === 404) setError(`"${code}" QR kodu kayıtsız`)
      else setError(e.response?.data?.error || 'Çanta bulunamadı')
    }
  }

  const advanceMut = useMutation({
    mutationFn: ({ id, action }) => {
      if (action === 'collect') return mobileApi.post(`/laundry/items/${id}/collect`, {})
      return mobileApi.patch(`/laundry/items/${id}/advance`, {})
    },
    onMutate: () => setBusy(true),
    onSuccess: (_, vars) => {
      navigator.vibrate?.([15, 30, 15])
      addToast('✓ Torba durumu güncellendi', 'success')
      mobileApi.get(`/laundry/items/${vars.id}`).then(response => setBag(response.data))
      qc.invalidateQueries({ queryKey: ['mobile-laundry-items'] })
    },
    onError: (e) => addToast(e.response?.data?.error || 'Hata', 'error'),
    onSettled: () => setBusy(false),
  })

  const next = bag && NEXT[bag.status]

  return (
    <div style={{ padding: '16px' }}>
      <h1 style={{ fontSize: '20px', fontWeight: 700, margin: '0 0 16px' }}>Çanta Tara</h1>

      <button onClick={() => { setError(''); setShowQr(true) }}
        style={{ width: '100%', padding: '16px', borderRadius: '12px',
          background: '#3b82f6', color: '#fff', border: 'none',
          fontSize: '15px', fontWeight: 700, cursor: 'pointer', marginBottom: '16px' }}>
        📷 QR Kodu Okut
      </button>

      {error && (
        <div style={{ padding: '10px 12px', background: '#fef2f2', color: '#ef4444',
          borderRadius: '8px', fontSize: '13px', marginBottom: '12px' }}>
          {error}
        </div>
      )}

      {bag && (
        <div style={{ background: '#fff', borderRadius: '12px', padding: '16px',
          boxShadow: '0 1px 3px rgba(0,0,0,.08)' }}>
          <div style={{ fontSize: '11px', fontWeight: 700, color: '#9ca3af', letterSpacing: '0.5px', marginBottom: '4px' }}>
            QR KODU
          </div>
          <div style={{ fontFamily: 'monospace', fontSize: '14px', marginBottom: '12px' }}>{bag.bag_no || `#${bag.id}`}</div>

          <div style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '6px 12px', fontSize: '13px', marginBottom: '14px' }}>
            <span style={{ color: '#9ca3af' }}>Durum</span>
            <span style={{ fontWeight: 700 }}>{STATUS_LABEL[bag.status] || bag.status}</span>
            <span style={{ color: '#9ca3af' }}>Oda</span>
            <span>{bag.block && bag.room_no ? `${bag.block} - ${bag.room_no}` : '—'}</span>
            {bag.machine_name && (<>
              <span style={{ color: '#9ca3af' }}>Makine</span>
              <span>{bag.machine_name}</span>
            </>)}
            {bag.tracking_mode && (<>
              <span style={{ color: '#9ca3af' }}>Takip</span>
              <span>{bag.tracking_mode === 'individual' ? `${bag.garments?.length || 0} tekil parça` : 'Toplam adet'}</span>
            </>)}
            {bag.collected_at && (<>
              <span style={{ color: '#9ca3af' }}>Toplandı</span>
              <span style={{ fontSize: '12px' }}>{bag.collected_at?.slice(0, 16)}</span>
            </>)}
          </div>

          {next ? (
            <button onClick={() => next.action === 'checklist'
              ? setShowChecklist(true)
              : advanceMut.mutate({ id: bag.id, action: next.action })}
              disabled={busy}
              style={{ width: '100%', padding: '14px', borderRadius: '10px',
                background: next.color, color: '#fff', border: 'none',
                fontSize: '14px', fontWeight: 700, cursor: 'pointer',
                opacity: busy ? 0.5 : 1 }}>
              {busy ? 'İşleniyor...' : next.label}
            </button>
          ) : (
            <div style={{ textAlign: 'center', padding: '12px', color: '#10b981', fontSize: '13px', fontWeight: 600 }}>
              ✓ Akış tamamlandı
            </div>
          )}
        </div>
      )}

      {showQr && (
        <Suspense fallback={null}>
          <QrScannerModal open={showQr} onScan={handleScan} onClose={() => setShowQr(false)}
            title="Çanta QR Kodunu Okutun" />
        </Suspense>
      )}
      {showChecklist && bag && (
        <GarmentChecklist
          item={bag}
          onClose={() => setShowChecklist(false)}
          onChanged={() => {
            qc.invalidateQueries({ queryKey: ['mobile-laundry-items'] })
            mobileApi.get(`/laundry/items/${bag.id}`).then(response => setBag(response.data))
          }}
        />
      )}
    </div>
  )
}
