function escapeHtml(value) {
  return String(value || '').replace(/[&<>'"]/g, character => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;',
  })[character])
}

export function attachHidScanner(onScan, { timeoutMs = 80, minLength = 3 } = {}) {
  let buffer = ''
  let lastAt = 0
  const listener = event => {
    const tag = event.target?.tagName?.toLowerCase()
    if (tag === 'input' || tag === 'textarea' || event.ctrlKey || event.altKey || event.metaKey) return
    const now = Date.now()
    if (now - lastAt > timeoutMs) buffer = ''
    lastAt = now
    if (event.key === 'Enter') {
      const code = buffer.trim()
      buffer = ''
      if (code.length >= minLength) onScan(code)
      return
    }
    if (event.key?.length === 1) buffer += event.key
  }
  window.addEventListener('keydown', listener)
  return () => window.removeEventListener('keydown', listener)
}

export function hardwareCapabilities() {
  return {
    hid_keyboard: true,
    camera: Boolean(navigator.mediaDevices?.getUserMedia),
    local_qr: true,
    browser_print: typeof window.print === 'function',
  }
}

export async function printLaundryLabel({ code, room, owner, itemCount }) {
  const QRCode = await import('qrcode')
  const qr = await QRCode.default.toDataURL(String(code), { width: 260, margin: 1, errorCorrectionLevel: 'M' })
  const printWindow = window.open('', '_blank', 'width=520,height=720')
  if (!printWindow) throw new Error('Yazdırma penceresi engellendi')
  printWindow.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>${escapeHtml(code)}</title>
    <style>@page{size:80mm 55mm;margin:3mm}body{margin:0;font-family:Arial,sans-serif;color:#111}.label{display:grid;grid-template-columns:34mm 1fr;gap:3mm;align-items:center;border:1px solid #111;padding:3mm}.label img{width:32mm;height:32mm}.code{font:bold 18pt ui-monospace,monospace}.meta{margin-top:2mm;font-size:9pt;line-height:1.45}.brand{font-size:7pt;letter-spacing:1px;color:#555}</style>
    </head><body><div class="label"><img src="${qr}" alt="QR"><div><div class="brand">YYS · ÇAMAŞIRHANE</div><div class="code">${escapeHtml(code)}</div><div class="meta">${escapeHtml(room || 'Oda belirtilmedi')}<br>${escapeHtml(owner || 'Kişi belirtilmedi')}<br>${escapeHtml(itemCount ? `${itemCount} parça` : '')}</div></div></div><script>onload=()=>{print();setTimeout(()=>close(),300)}</script></body></html>`)
  printWindow.document.close()
}
