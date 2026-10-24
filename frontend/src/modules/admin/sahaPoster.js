// Saha ekranı afişi (docs/saha-ekrani.md): panoya / WhatsApp grubuna konur; personel telefonuyla QR'ı okutup
// /saha'ya girer. Tek A4 sayfa, yazdırma penceresinde açılır (openPrintWindow).
const escapeHtml = value => String(value).replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]))

export function sahaPosterHtml({ url, qrDataUrl }) {
  const shown = escapeHtml(String(url).replace(/^https?:\/\//, ''))
  return `<!doctype html>
<html lang="tr"><head><meta charset="utf-8"><title>YYS Saha</title>
<style>
  @page { size: A4; margin: 16mm; }
  body { font-family: system-ui, -apple-system, 'Segoe UI', sans-serif; color: #0f172a; margin: 0; text-align: center; }
  h1 { font-size: 34pt; margin: 6mm 0 2mm; }
  .lead { font-size: 15pt; margin: 0 0 8mm; color: #334155; }
  img { width: 95mm; height: 95mm; image-rendering: pixelated; }
  .url { font-size: 22pt; font-weight: 700; margin: 4mm 0 10mm; letter-spacing: .5px; }
  ol { text-align: left; max-width: 150mm; margin: 0 auto; padding-left: 10mm; font-size: 15pt; line-height: 1.5; }
  li { margin-bottom: 4mm; }
  .foot { margin-top: 10mm; font-size: 11pt; color: #64748b; }
</style></head>
<body>
  <h1>Odalar ve çamaşır telefonda</h1>
  <p class="lead">Temizlediğin odayı, dolu/boş bilgisini ve aldığın çamaşırı buradan işaretle.</p>
  <img src="${escapeHtml(qrDataUrl)}" alt="YYS Saha giriş kodu">
  <div class="url">${shown}</div>
  <ol>
    <li>Telefonunun kamerasıyla kodu okut ya da adresi tarayıcıya yaz.</li>
    <li>Adını ara, sana verilen 4 haneli PIN'i gir; ilk girişte kendi PIN'ini belirle.</li>
    <li>"Ana ekrana ekle" de; sonraki girişlerde ekran kilitlenmez, doğrudan açılır.</li>
  </ol>
  <p class="foot">PIN'in yoksa ya da unuttuysan yöneticine söyle.</p>
</body></html>`
}
