import { afterEach, beforeEach, vi } from 'vitest'

// Sabit tarihli mock veriyle çalışan testler için saati dondurur.
// Neden: bu testler yanıtları "2026-07" olarak sabitliyor ama bileşenler
// görüntülenecek ayı new Date()'ten türetiyor. Ay dönünce (2026-08) ekran
// başka ay çizdiği için testler kırılıyordu — takvime bağlı kırılganlık.
//
// shouldAdvanceTime: React Testing Library'nin waitFor/act akışı gerçek
// zamanlayıcı bekler; otomatik ilerletme olmadan asılırlar.
export function freezeDate(iso) {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    vi.setSystemTime(new Date(iso))
  })
  afterEach(() => {
    vi.useRealTimers()
  })
}
