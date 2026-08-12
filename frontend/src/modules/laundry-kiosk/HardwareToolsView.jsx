import { lazy, Suspense, useState } from 'react'
import { hardwareCapabilities, printLaundryLabel } from './hardwareAdapters.js'

const QrScannerModal = lazy(() => import('../../shared/components/QrScannerModal.jsx'))

export default function HardwareToolsView({ onCode, lastScannedCode = '' }) {
  const [lastCode, setLastCode] = useState(lastScannedCode)
  const [manual, setManual] = useState('')
  const [cameraOpen, setCameraOpen] = useState(false)
  const [message, setMessage] = useState('')
  const capabilities = hardwareCapabilities()

  const accept = code => {
    const normalized = String(code || '').trim()
    if (!normalized) return
    setLastCode(normalized)
    setMessage(`Kod alındı: ${normalized}`)
    onCode?.(normalized)
  }

  async function testPrint() {
    try {
      await printLaundryLabel({ code: 'YYS-TEST-001', room: 'TEST-101', owner: 'Donanım Testi', itemCount: 3 })
      setMessage('Yerel QR üretildi ve yazdırma penceresi açıldı.')
    } catch (error) { setMessage(error.message) }
  }

  return (
    <div className="hardware-tools">
      <header className="kiosk-work-header">
        <div><span className="kiosk-eyebrow">CİHAZ VE YEDEK AKIŞ</span><h1>Donanım test merkezi</h1><p>Okuyucu, kamera ve etiket yazıcısını vardiya başlamadan doğrulayın.</p></div>
      </header>
      {message && <div className="hardware-message" role="status">{message}</div>}
      <div className="hardware-grid">
        <section><span>01</span><h2>QR / barkod okuyucu</h2><p>USB HID okuyucuyla bir kod okutun. Enter ile biten kod otomatik algılanır.</p><strong>{lastCode || 'Kod bekleniyor…'}</strong><em className="is-ready">Hazır</em></section>
        <section><span>02</span><h2>Kamera</h2><p>Tablet veya telefon kamerasıyla QR ve barkod okuyabilirsiniz.</p><button type="button" onClick={() => setCameraOpen(true)} disabled={!capabilities.camera}>Kamerayı test et</button><em className={capabilities.camera ? 'is-ready' : 'is-warning'}>{capabilities.camera ? 'Destekleniyor' : 'Kamera bulunamadı'}</em></section>
        <section><span>03</span><h2>Etiket yazıcı</h2><p>QR cihazda yerel üretilir; harici servise veri gönderilmez.</p><button type="button" onClick={testPrint}>Test etiketi yazdır</button><em className="is-ready">Tarayıcı yazdırması hazır</em></section>
      </div>
      <section className="hardware-manual">
        <div><span className="kiosk-eyebrow">MANUEL YEDEK</span><h2>Kodu elle gir</h2><p>Okuyucu veya kamera kullanılamıyorsa operasyon durmaz.</p></div>
        <form onSubmit={event => { event.preventDefault(); accept(manual); setManual('') }}><input value={manual} onChange={event => setManual(event.target.value)} placeholder="Torba veya kıyafet kodu" /><button type="submit" disabled={!manual.trim()}>Kodu aç</button></form>
      </section>
      <Suspense fallback={null}><QrScannerModal open={cameraOpen} onClose={() => setCameraOpen(false)} onScan={accept} title="Çamaşır kodunu okutun" /></Suspense>
    </div>
  )
}
