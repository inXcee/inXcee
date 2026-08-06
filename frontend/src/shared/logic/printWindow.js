// Yazdırma penceresi açma — TEK NOKTA.
//
// Eskiden her çıktı `setTimeout(() => win.print(), 350)` yapıyordu. Sabit
// gecikme bir tahmindir: yavaş makinede veya uzun çizelgede yerleşim henüz
// bitmemişken baskı diyaloğu açılır, önizleme yarım/kaymış çıkar. Bunun yerine
// sayfanın gerçekten hazır olduğu beklenir (load + fontlar).
//
// Fontlar yüklenmeden basmak Türkçe karakterlerde ölçü kaymasına yol açıyordu;
// document.fonts.ready onu da kapatır. Tarayıcı desteklemiyorsa küçük bir
// gecikmeye düşülür — davranış eskisinden kötü olmaz.

const YEDEK_GECIKME_MS = 400

export function whenWindowReady(win) {
  return new Promise(resolve => {
    let bitti = false
    const tamam = () => {
      if (bitti) return
      bitti = true
      resolve()
    }

    const fontlariBekle = () => {
      const fonts = win.document?.fonts
      if (fonts?.ready?.then) fonts.ready.then(tamam).catch(tamam)
      else tamam()
    }

    if (win.document?.readyState === 'complete') fontlariBekle()
    else win.addEventListener('load', fontlariBekle, { once: true })

    // Hiçbir olay gelmezse çıktı büsbütün kaybolmasın.
    win.setTimeout(tamam, 3000)
  })
}

export function openPrintWindow(html, { width = 1280, height = 900 } = {}) {
  const win = window.open('', '_blank', `width=${width},height=${height}`)
  if (!win) throw new Error('Yazdirma penceresi acilamadi')
  win.document.open()
  win.document.write(html)
  win.document.close()
  win.focus()

  whenWindowReady(win)
    .then(() => { try { win.print() } catch { /* kullanıcı pencereyi kapatmış olabilir */ } })
    .catch(() => { win.setTimeout(() => { try { win.print() } catch { /* yoksay */ } }, YEDEK_GECIKME_MS) })

  return win
}
