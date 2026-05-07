import { useEffect, useRef, useState } from 'react'

// Mobile QR/barkod tarayicisi — html5-qrcode dinamik import (bundle'ı şişirmesin).
// onScan(text) sadece bir kere cagrilir, modal kapatilir.
export default function QrScannerModal({ open, onClose, onScan, title = 'QR Kodu Okutun' }) {
  const containerRef = useRef(null)
  const scannerRef = useRef(null)
  const [error, setError] = useState(null)

  useEffect(() => {
    if (!open || !containerRef.current) return
    let cancelled = false

    ;(async () => {
      try {
        const { Html5Qrcode } = await import('html5-qrcode')
        if (cancelled || !containerRef.current) return
        const elementId = 'yys-qr-scanner-region'
        containerRef.current.id = elementId
        const scanner = new Html5Qrcode(elementId)
        scannerRef.current = scanner

        await scanner.start(
          { facingMode: 'environment' },
          { fps: 10, qrbox: { width: 240, height: 240 } },
          (decoded) => {
            if (cancelled) return
            navigator.vibrate?.([60])
            try { scanner.stop().catch(() => {}) } catch {}
            onScan?.(decoded)
            onClose?.()
          },
          () => {} // scan failure callback - silent
        )
      } catch (e) {
        if (!cancelled) setError(e?.message || 'Kamera açılamadı')
      }
    })()

    return () => {
      cancelled = true
      if (scannerRef.current) {
        try {
          scannerRef.current.stop().then(() => scannerRef.current.clear()).catch(() => {})
        } catch {}
      }
    }
  }, [open, onScan, onClose])

  if (!open) return null

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 9999, background: '#000',
      display: 'flex', flexDirection: 'column',
    }}>
      <div style={{
        padding: '16px', display: 'flex', justifyContent: 'space-between',
        alignItems: 'center', color: '#fff',
      }}>
        <span style={{ fontSize: '15px', fontWeight: 600 }}>{title}</span>
        <button onClick={onClose} aria-label="Kapat" style={{
          background: 'rgba(255,255,255,0.15)', color: '#fff',
          border: 'none', borderRadius: '8px', padding: '6px 14px',
          fontSize: '13px', fontWeight: 600, cursor: 'pointer',
        }}>Kapat</button>
      </div>
      <div style={{ flex: 1, position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        {error ? (
          <div style={{ color: '#fff', textAlign: 'center', padding: '24px' }}>
            <div style={{ fontSize: '48px', marginBottom: '12px' }}>📷</div>
            <p>{error}</p>
            <p style={{ fontSize: '12px', opacity: 0.7, marginTop: '8px' }}>
              Tarayıcıdan kamera izni verdiğinizden emin olun.
            </p>
          </div>
        ) : (
          <div ref={containerRef} style={{ width: '100%', maxWidth: '480px' }} />
        )}
      </div>
      <p style={{ color: '#fff', textAlign: 'center', padding: '12px', fontSize: '12px', opacity: 0.7 }}>
        Kodu kameranın orta kutucuğuna hizalayın
      </p>
    </div>
  )
}
