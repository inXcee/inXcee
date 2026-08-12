import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it } from 'vitest'
import { clearDeviceIdentity, readDeviceIdentity, saveDeviceIdentity } from './deviceIdentity.js'

describe('kiosk device identity', () => {
  beforeEach(async () => {
    await clearDeviceIdentity()
  })

  it('cihaz anahtarını localStorage yerine IndexedDB içinde saklar', async () => {
    await saveDeviceIdentity({
      device: { id: 'device-1', name: 'Pilot Kiosk' },
      device_key: 'KD-secret',
    })

    expect(await readDeviceIdentity()).toMatchObject({
      device: { id: 'device-1', name: 'Pilot Kiosk' },
      device_key: 'KD-secret',
    })
    expect(localStorage.getItem('kiosk-device-key')).toBeNull()
  })

  it('kimliği tamamen temizler', async () => {
    await saveDeviceIdentity({ device: { id: 'device-2' }, device_key: 'KD-secret-2' })
    await clearDeviceIdentity()
    expect(await readDeviceIdentity()).toBeNull()
  })
})
