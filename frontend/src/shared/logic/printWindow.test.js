import { describe, it, expect, vi } from 'vitest'
import { whenWindowReady } from './printWindow.js'

function sahtePencere({ readyState = 'complete', fonts = null } = {}) {
  const dinleyiciler = {}
  return {
    document: { readyState, fonts },
    addEventListener: (ad, fn) => { dinleyiciler[ad] = fn },
    setTimeout: (fn, ms) => setTimeout(fn, ms),
    _tetikle: (ad) => dinleyiciler[ad]?.(),
  }
}

describe('Yazdırma penceresi hazır bekleme', () => {
  // Eskiden sabit 350ms'ti: yavaş makinede yerleşim bitmeden baskı diyaloğu
  // açılıyor, önizleme yarım çıkıyordu.
  it('sayfa hazırsa ve font yoksa hemen çözülür', async () => {
    await expect(whenWindowReady(sahtePencere())).resolves.toBeUndefined()
  })

  it('fontlar yüklenene kadar bekler', async () => {
    let fontlariBitir
    const fonts = { ready: new Promise(res => { fontlariBitir = res }) }
    const win = sahtePencere({ fonts })
    let cozuldu = false
    const p = whenWindowReady(win).then(() => { cozuldu = true })
    await Promise.resolve()
    expect(cozuldu).toBe(false)
    fontlariBitir()
    await p
    expect(cozuldu).toBe(true)
  })

  it('sayfa yüklenmemişse load olayını bekler', async () => {
    const win = sahtePencere({ readyState: 'loading' })
    let cozuldu = false
    const p = whenWindowReady(win).then(() => { cozuldu = true })
    await Promise.resolve()
    expect(cozuldu).toBe(false)
    win._tetikle('load')
    await p
    expect(cozuldu).toBe(true)
  })

  // Font sözü reddedilirse çıktı büsbütün kaybolmamalı.
  it('font sözü reddedilse de çözülür', async () => {
    const fonts = { ready: Promise.reject(new Error('font hatası')) }
    await expect(whenWindowReady(sahtePencere({ fonts }))).resolves.toBeUndefined()
  })

  it('hiç olay gelmezse zaman aşımıyla çözülür', async () => {
    vi.useFakeTimers()
    const win = sahtePencere({ readyState: 'loading' })
    const p = whenWindowReady(win)
    vi.advanceTimersByTime(3000)
    await expect(p).resolves.toBeUndefined()
    vi.useRealTimers()
  })
})
