// Kiosk oturumu yalnızca çıkış düğmesiyle kapanır.
//
// sessionStorage sekme kapanınca silinir; kiosk tabletleri gece kapatılıp sabah
// açıldığı için bu her sabah yeniden PIN girmek demekti. localStorage cihaz
// yeniden başlasa da kalır — token'ı backend pratikte süresiz üretiyor ve çıkışta
// jti blacklist'e yazılarak gerçekten iptal ediliyor.

// Eski sürümler oturumu sessionStorage'a yazıyordu; bir kez oradan da okuyup
// taşıyoruz ki güncelleme sonrası kimse tekrar giriş yapmak zorunda kalmasın.
export function readKioskSession(key) {
  const fromLocal = parseSession(window.localStorage, key)
  if (fromLocal) return fromLocal
  const legacy = parseSession(window.sessionStorage, key)
  if (legacy) {
    writeKioskSession(key, legacy)
    // Taşındıktan sonra eski kopyayı bırakma — aynı token iki yerde durmasın.
    try { window.sessionStorage.removeItem(key) } catch { /* yok sayılabilir */ }
  }
  return legacy
}

function parseSession(storage, key) {
  try {
    const stored = JSON.parse(storage.getItem(key) || 'null')
    return stored?.token ? stored : null
  } catch {
    return null
  }
}

export function writeKioskSession(key, session) {
  try {
    window.localStorage.setItem(key, JSON.stringify(session))
  } catch {
    // Kota dolu veya gizli sekme — oturum yalnız bu sekmede yaşar, giriş yine çalışır.
  }
}

export function clearKioskSession(key) {
  try { window.localStorage.removeItem(key) } catch { /* yok sayılabilir */ }
  try { window.sessionStorage.removeItem(key) } catch { /* yok sayılabilir */ }
}
