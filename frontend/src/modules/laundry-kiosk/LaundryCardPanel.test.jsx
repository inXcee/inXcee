import { useState } from 'react'
import { act, fireEvent, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { renderWithProviders } from '../../test/renderWithProviders.jsx'
import LaundryCardPanel from './LaundryCardPanel.jsx'
import {
  cardGateReady, cardRequestFields, emptyLaundryCard, extractNfcCode,
} from './laundryCard.js'

function renderPanel({ api, verifyCard, captureHid = false, required = true, online = true, resetKey = 'M1|101' } = {}) {
  const state = { current: emptyLaundryCard() }
  function Harness({ nextResetKey = resetKey }) {
    const [value, setValue] = useState(emptyLaundryCard)
    state.current = value
    return (
      <LaundryCardPanel
        action="intake"
        required={required}
        room={{ block: 'M1', room_no: '101' }}
        kioskApi={api || { post: vi.fn() }}
        verifyCard={verifyCard}
        value={value}
        onChange={setValue}
        online={online}
        resetKey={nextResetKey}
        captureHid={captureHid}
      />
    )
  }
  const rendered = renderWithProviders(<Harness />)
  return { ...rendered, state, Harness }
}

afterEach(() => {
  delete globalThis.NDEFReader
})
describe('çamaşır kart paneli', () => {
  it('ayar kapalıyken paneli tamamen gizler', () => {
    renderPanel({ required: false })
    expect(screen.queryByLabelText('Çamaşır kartı doğrulama')).not.toBeInTheDocument()
  })

  it('USB/HID olayıyla doğru kartı doğrular ve sakin adını gösterir', async () => {
    const api = {
      post: vi.fn(() => Promise.resolve({
        data: { allowed: true, code: 'ok', message: 'Ali Veli doğrulandı', card: { holder_name: 'Ali Veli' } },
      })),
    }
    const { state } = renderPanel({ api })
    act(() => window.dispatchEvent(new CustomEvent('laundry-card-scan', { detail: { code: 'AVS-C:ALI' } })))

    await waitFor(() => expect(api.post).toHaveBeenCalledWith(
      '/self-service/laundry-kiosk/card-verify',
      { action: 'intake', block: 'M1', room_no: '101', card_code: 'AVS-C:ALI' },
    ))
    expect(await screen.findByText(/Ali Veli · Ali Veli doğrulandı/)).toBeInTheDocument()
    expect(state.current.verification.allowed).toBe(true)
  })

  it('mismatch sonucunu sarı uyarıyla gösterir fakat geçişe izin verir', async () => {
    const api = {
      post: vi.fn(() => Promise.resolve({
        data: { allowed: true, code: 'mismatch', message: 'Bu odanın sakini değil', card: { holder_name: 'Ayşe' } },
      })),
    }
    const { state } = renderPanel({ api })
    fireEvent.change(screen.getByLabelText('Çamaşır kartı kodu'), { target: { value: 'AVS-C:AYSE' } })
    fireEvent.click(screen.getByRole('button', { name: 'Doğrula' }))
    expect(await screen.findByText(/Bu odanın sakini değil/)).toBeInTheDocument()
    expect(cardGateReady({ required: true, online: true, value: state.current })).toBe(true)
  })

  it('oda/kişi reset anahtarı değişince eski okutmayı temizler', async () => {
    const api = { post: vi.fn(() => Promise.resolve({ data: { allowed: true, code: 'ok', message: 'Doğrulandı' } })) }
    const { state, rerender, Harness } = renderPanel({ api })
    fireEvent.change(screen.getByLabelText('Çamaşır kartı kodu'), { target: { value: 'AVS-C:1' } })
    fireEvent.click(screen.getByRole('button', { name: 'Doğrula' }))
    await waitFor(() => expect(state.current.card_code).toBe('AVS-C:1'))
    rerender(<Harness nextResetKey="M1|102" />)
    await waitFor(() => expect(state.current).toMatchObject({ card_code: '', card_override_reason: '', verification: null }))
  })

  it('çevrimdışında kart kodunu sunucu doğrulaması bekleyen veri olarak tutar', async () => {
    const { state } = renderPanel({ online: false })
    fireEvent.change(screen.getByLabelText('Çamaşır kartı kodu'), { target: { value: 'AVS-C:OFFLINE' } })
    fireEvent.click(screen.getByRole('button', { name: 'Doğrula' }))
    await waitFor(() => expect(state.current.verification).toMatchObject({ offline: true, allowed: true }))
    expect(cardRequestFields(state.current)).toMatchObject({ card_code: 'AVS-C:OFFLINE' })
    expect(cardGateReady({ required: true, online: false, value: state.current })).toBe(true)
  })

  it('masaüstünde HID klavye akışındaki AVS-C kodunu doğrudan doğrular', async () => {
    const verifyCard = vi.fn(() => Promise.resolve({ allowed: true, code: 'ok', message: 'Doğrulandı' }))
    renderPanel({ verifyCard, captureHid: true })
    for (const key of 'AVS-C:HID-1') fireEvent.keyDown(window, { key })
    fireEvent.keyDown(window, { key: 'Enter' })
    await waitFor(() => expect(verifyCard).toHaveBeenCalledWith(expect.objectContaining({ card_code: 'AVS-C:HID-1' })))
  })

  it('NFC seri numarasını kart kodu olarak kullanır', async () => {
    let reader
    globalThis.NDEFReader = class {
      constructor() { reader = this }
      async scan() {}
      addEventListener(_name, callback) { this.callback = callback }
    }
    const api = { post: vi.fn(() => Promise.resolve({ data: { allowed: true, code: 'ok', message: 'NFC doğrulandı' } })) }
    renderPanel({ api })
    fireEvent.click(screen.getByRole('button', { name: /NFC okut/ }))
    await waitFor(() => expect(reader).toBeTruthy())
    act(() => reader.callback({ serialNumber: '04-A1-B2' }))
    await waitFor(() => expect(api.post).toHaveBeenCalledWith(
      '/self-service/laundry-kiosk/card-verify',
      expect.objectContaining({ card_code: '04-A1-B2' }),
    ))
    expect(extractNfcCode({ serialNumber: '04-A1-B2' })).toBe('04-A1-B2')
  })
})
