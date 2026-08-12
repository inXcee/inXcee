import { afterEach, describe, expect, it, vi } from 'vitest'
import { attachHidScanner, hardwareCapabilities } from './hardwareAdapters.js'

describe('laundry kiosk hardware adapters', () => {
  afterEach(() => vi.restoreAllMocks())

  it('HID klavye okuyucusunun Enter ile biten kodunu tek işlem olarak iletir', () => {
    const onScan = vi.fn()
    const detach = attachHidScanner(onScan)
    for (const key of ['T', '-', '0', '0', '4', '2', 'Enter']) {
      window.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true }))
    }
    expect(onScan).toHaveBeenCalledOnce()
    expect(onScan).toHaveBeenCalledWith('T-0042')
    detach()
  })

  it('form alanına yazılan metni okuyucu kodu sanmaz', () => {
    const onScan = vi.fn()
    const detach = attachHidScanner(onScan)
    const input = document.createElement('input')
    document.body.appendChild(input)
    for (const key of ['1', '2', '3', 'Enter']) input.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true }))
    expect(onScan).not.toHaveBeenCalled()
    detach()
    input.remove()
  })

  it('manuel yedek ve yerel QR/yazdırma yeteneklerini bildirir', () => {
    expect(hardwareCapabilities()).toMatchObject({ hid_keyboard: true, local_qr: true, browser_print: true })
  })
})
