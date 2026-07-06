// Login sonrası kullanıcıyı hangi sayfaya yönlendireceğimizi belirler.
//
// `mode` sadece UI ipucudur — backend güvenliği rol bazlıdır. Bu helper
// post-login UX'i tek noktada toplar: yönetici sekmesinden personel girişi
// yapılırsa role_mismatch, güvenlik sekmesinden giriş yapılırsa ziyaretçi
// yönetim sayfasına, kalan tüm durumlarda varsayılan panoya gider.
//
// Roller: campus_manager · shift_supervisor · technical · laundry · housekeeper
// Modlar: standard · admin · security · kiosk

export const VALID_MODES = ['standard', 'admin', 'security', 'kiosk']

export function postLoginRedirect(user, mode = 'standard') {
  if (!user || !user.role) {
    return { ok: false, reason: 'no_user' }
  }

  // Yönetici sekmesi yalnız campus_manager rolünü kabul eder.
  if (mode === 'admin' && user.role !== 'campus_manager') {
    return { ok: false, reason: 'role_mismatch', expected: 'campus_manager', got: user.role }
  }

  // Güvenlik sekmesi: kullanıcının rolü ne olursa olsun ziyaretçi/kapı
  // yönetim sayfasına yönlendirilir. (Sistemde ayrı 'security' rolü yok;
  // genellikle shift_supervisor veya campus_manager bu sekmeyi kullanır.)
  if (mode === 'security') {
    return { ok: true, path: '/settings/visitors' }
  }

  // Kiosk sekmesi ayrı bir login akışı değildir — sekme seçildiğinde
  // doğrudan kiosk hub'larından biri açılır (LoginPage.jsx yönetir).
  // Bir şekilde buraya düşerse panoya gönder.
  return { ok: true, path: '/' }
}
