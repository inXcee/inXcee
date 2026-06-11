import { lazy } from 'react'

// Deploy sonrası açık kalan sekmeler SİLİNMİŞ eski hash'li chunk'ları ister
// (404) ve sayfa "açılmıyor" görünür. Çözüm: chunk import'u patlarsa BİR KEZ
// tam sayfa yenile — taze index.html yeni hash'leri getirir. 30sn içinde
// ikinci hata olursa yenileme döngüsüne girmeden ErrorBoundary'ye düşülür.
const RELOAD_KEY = 'yys_chunk_reload_at'

export function lazyWithRetry(importer) {
  return lazy(() =>
    importer().catch(err => {
      const last = +sessionStorage.getItem(RELOAD_KEY) || 0
      if (Date.now() - last > 30000) {
        sessionStorage.setItem(RELOAD_KEY, String(Date.now()))
        window.location.reload()
        return new Promise(() => {}) // yenileme gelene kadar askıda kal
      }
      throw err
    })
  )
}
