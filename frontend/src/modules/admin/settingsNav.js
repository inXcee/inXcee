// Ayarlar menüsünün TEK KAYNAĞI.
//
// Önceden menü tanımı `SettingsLayout` içinde, rota koruması `App.jsx` içinde
// ayrı ayrı duruyordu ve ikisi birbirinden kaymıştı:
//   • 6 sayfa menüde "yalnız yönetici" görünüyordu ama arka uç amire de izin
//     veriyordu — amir kullanabileceği sayfayı göremiyordu.
//   • 2 sayfada (Otomasyon, Bildirim Grupları) rota koruması hiç yoktu; amir
//     URL yazıp girebiliyor, sonra bütün istekler 403 dönüyor, sayfa boş
//     kalıyordu.
//   • Projeler menüde amire görünüyor ama rota onu ana sayfaya atıyordu —
//     tıklanınca hiçbir açıklama olmadan dışarı atan bir bağlantı.
//
// Artık hem menü hem rota koruması buradan besleniyor; ikisi tanım gereği
// ayrışamaz. Roller ARKA UCA göre yazıldı — ekranın izin verip API'nin
// reddetmesi, kullanıcı için "bozuk sayfa" demektir.

export const ROL = {
  YONETICI: ['campus_manager'],
  YONETIM: ['campus_manager', 'shift_supervisor'],
}

export const SETTINGS_GROUPS = [
  {
    key: 'personel',
    label: 'PERSONEL',
    hint: 'Kadro, özlük, devam ve bordro',
    items: [
      { key: 'personnel', label: 'Personel Listesi', icon: '👤', roles: ROL.YONETIM, desc: 'Kadro, özlük bilgileri ve dosyalar', keywords: 'kadro isci calisan ozluk' },
      { key: 'hr', label: 'İK Akışları', icon: '📋', roles: ROL.YONETIM, desc: 'İşe giriş, çıkış ve transfer süreçleri', keywords: 'ik insan kaynaklari giris cikis transfer' },
      { key: 'discipline', label: 'Disiplin', icon: '⚖', roles: ROL.YONETIM, desc: 'Uyarı, savunma ve ceza kayıtları', keywords: 'ceza uyari savunma tutanak' },
      { key: 'performance', label: 'Performans', icon: '⭐', roles: ROL.YONETIM, desc: 'Değerlendirme ve puanlama', keywords: 'degerlendirme puan verim' },
      { key: 'combined-absences', label: 'Devamsızlık', icon: '✗', roles: ROL.YONETIM, desc: 'İzin, rapor ve gelmeyenler tek listede', keywords: 'gelmedi izin rapor devamsiz' },
      { key: 'payroll', label: 'Bordro Özeti', icon: '💰', roles: ROL.YONETIM, desc: 'Dönem bordro çıktısı ve mali özet', keywords: 'maas ucret odeme bordro' },
      { key: 'archived-personnel', label: 'Arşiv', icon: '🗄', roles: ROL.YONETIM, desc: 'İşten ayrılmış personel kayıtları', keywords: 'ayrilan eski cikis arsiv' },
    ],
  },
  {
    key: 'saha',
    label: 'SAHA & OPERASYON',
    hint: 'Proje, takvim, yemek ve saha güvenliği',
    items: [
      // Arka uç yalnız yöneticiye izin veriyor; menüde amire göstermek onu
      // tıklayınca ana sayfaya atılan bir bağlantıya gönderiyordu.
      { key: 'projects', label: 'Projeler', icon: '🏗', roles: ROL.YONETICI, desc: 'FPU / Kamp Alanı proje tanımları', keywords: 'proje fpu kamp saha' },
      { key: 'holidays', label: 'Resmi Tatiller', icon: '🎉', roles: ROL.YONETIM, desc: 'Tatil takvimi — puantaj çarpanlarını etkiler', keywords: 'tatil bayram takvim' },
      { key: 'meals', label: 'Yemekhane', icon: '🍽', roles: ROL.YONETIM, desc: 'Menü, öğün seçimi ve sayım', keywords: 'yemek menu ogun mutfak' },
      { key: 'companies', label: 'Firmalar', icon: '🏢', roles: ROL.YONETIM, desc: 'Taşeron ve tedarikçi firmalar', keywords: 'taseron tedarikci sirket' },
      { key: 'visitors', label: 'Ziyaretçiler', icon: '🚶', roles: ROL.YONETIM, desc: 'Ziyaretçi kaydı ve ön kayıt', keywords: 'misafir ziyaret giris' },
      { key: 'safety', label: 'İş Güvenliği', icon: '🦺', roles: ROL.YONETIM, desc: 'İSG olayları ve saha denetimleri', keywords: 'isg guvenlik kaza olay' },
      { key: 'risk', label: 'Risk Listesi', icon: '⚠', roles: ROL.YONETIM, desc: 'Takip gerektiren personel ve durumlar', keywords: 'risk takip dikkat' },
      { key: 'drills', label: 'Tatbikatlar', icon: '🔥', roles: ROL.YONETIM, desc: 'Yangın ve tahliye tatbikat kayıtları', keywords: 'tatbikat yangin tahliye acil' },
    ],
  },
  {
    key: 'erisim',
    label: 'ERİŞİM & CİHAZ',
    hint: 'Kart, kiosk ve okutma noktaları',
    items: [
      { key: 'cards', label: 'Kartlar', icon: '🪪', roles: ROL.YONETIM, desc: 'Personel kartları, basım ve iptal', keywords: 'kart yaka basim nfc' },
      { key: 'stations', label: 'Okutma İstasyonları', icon: '⌖', roles: ROL.YONETICI, desc: 'Kart okuyucu noktaları', keywords: 'istasyon okuyucu turnike nokta' },
      { key: 'kiosk-pins', label: 'Kiosk PIN', icon: '🔢', roles: ROL.YONETICI, desc: 'Kiosk giriş PIN üretimi ve teslimi', keywords: 'pin sifre kiosk kod' },
      { key: 'qr-codes', label: 'Oda QR Kodları', icon: '⬛', roles: ROL.YONETICI, desc: 'Oda ve ortak alan QR kodları, etiket basımı', keywords: 'qr kod etiket oda basim portal karekod' },
      { key: 'kiosk-devices', label: 'Kiosk Cihazları', icon: '▣', roles: ROL.YONETIM, desc: 'Cihaz kaydı, komut ve oturumlar', keywords: 'cihaz tablet kiosk device' },
      { key: 'avs-workers', label: 'AVS Çalışanları', icon: '👷', roles: ROL.YONETICI, desc: 'AVS personeli hesapları', keywords: 'avs calisan hesap' },
    ],
  },
  {
    key: 'iletisim',
    label: 'İLETİŞİM',
    hint: 'Duyuru, mail ve geri bildirim',
    items: [
      { key: 'announcements', label: 'Duyurular', icon: '📢', roles: ROL.YONETICI, desc: 'Sakinlere ve personele duyuru', keywords: 'duyuru ilan bildirim' },
      { key: 'comms', label: 'İletişim Kayıtları', icon: '📨', roles: ROL.YONETIM, desc: 'Gönderilen mesaj ve bildirim geçmişi', keywords: 'mesaj sms whatsapp gecmis' },
      { key: 'mail-compose', label: 'Mail Gönder', icon: '✉', roles: ROL.YONETICI, desc: 'Elle e-posta gönderimi', keywords: 'mail eposta gonder' },
      { key: 'notification-groups', label: 'Bildirim Grupları', icon: '👥', roles: ROL.YONETICI, desc: 'Kime hangi bildirim gitsin', keywords: 'grup bildirim alici' },
      { key: 'surveys', label: 'Memnuniyet Anketi', icon: '★', roles: ROL.YONETIM, desc: 'Anket tanımı ve sonuçlar', keywords: 'anket memnuniyet survey' },
      { key: 'feedback', label: 'Geri Bildirim', icon: '💬', roles: ROL.YONETIM, desc: 'Sakinlerden gelen öneri ve şikâyetler', keywords: 'oneri sikayet talep' },
    ],
  },
  {
    key: 'kayit',
    label: 'KAYIT & BELGE',
    hint: 'Belge, bütçe ve mevzuat',
    items: [
      { key: 'documents', label: 'Belgeler', icon: '📄', roles: ROL.YONETIM, desc: 'Kurumsal belge arşivi', keywords: 'belge dosya evrak' },
      { key: 'expenses', label: 'Bütçe & Gider', icon: '₺', roles: ROL.YONETIM, desc: 'Harcama kalemleri ve bütçe takibi', keywords: 'butce gider harcama masraf' },
      { key: 'kvkk-admin', label: 'KVKK', icon: '§', roles: ROL.YONETICI, desc: 'Veri sahibi talepleri ve aydınlatma', keywords: 'kvkk veri gizlilik kisisel' },
    ],
  },
  {
    key: 'sistem',
    label: 'SİSTEM',
    hint: 'Hesaplar, otomasyon, yedek ve sağlık',
    items: [
      { key: 'email', label: 'Genel & E-Posta', icon: '⎓', roles: ROL.YONETICI, desc: 'SMTP ve genel sistem ayarları', keywords: 'smtp eposta ayar genel' },
      { key: 'users', label: 'Kullanıcılar', icon: '🔐', roles: ROL.YONETICI, desc: 'Panel hesapları ve rolleri', keywords: 'kullanici hesap rol yetki' },
      { key: 'sessions', label: 'Açık Oturumlar', icon: '🔑', roles: ROL.YONETICI, desc: 'Aktif oturumlar, tekil çıkış', keywords: 'oturum session cikis token' },
      // Arka uç yalnız yöneticiye izin veriyor. Koruma olmadığı için amir
      // URL'den girip her isteği 403 dönen boş bir sayfa görüyordu.
      { key: 'automation', label: 'Otomasyon', icon: '⚙', roles: ROL.YONETICI, desc: 'Otomatik kural ve tetikleyiciler', keywords: 'otomasyon kural tetik' },
      { key: 'audit', label: 'Audit Log', icon: '☷', roles: ROL.YONETICI, desc: 'Kim ne yaptı kaydı', keywords: 'audit log kayit izleme' },
      { key: 'error-log', label: 'Hata Logları', icon: '🐞', roles: ROL.YONETICI, desc: 'Uygulama hataları', keywords: 'hata error log' },
      { key: 'backup', label: 'Yedekleme', icon: '⛁', roles: ROL.YONETICI, desc: 'Yedek alma ve geri yükleme', keywords: 'yedek backup geri yukleme' },
      { key: 'system', label: 'Sistem Sağlığı', icon: '♥', roles: ROL.YONETICI, desc: 'Servis durumu ve ölçümler', keywords: 'saglik health durum metrik' },
    ],
  },
]

export const ALL_ITEMS = SETTINGS_GROUPS.flatMap(g => g.items.map(i => ({ ...i, group: g.key, groupLabel: g.label })))

export function settingsPath(key) {
  return `/settings/${key}`
}

// Rota koruması menüyle aynı kaynaktan beslenir; ayrışamazlar.
export function rolesForKey(key) {
  return ALL_ITEMS.find(i => i.key === key)?.roles || null
}

export function canAccess(key, role) {
  const roles = rolesForKey(key)
  return !!roles && roles.includes(role)
}

// Türkçe karakterler aranırken engel olmamalı: "saglik" da "sağlık" da bulmalı.
export function normalize(text) {
  const harita = { ı: 'i', İ: 'i', I: 'i', ş: 's', Ş: 's', ğ: 'g', Ğ: 'g', ç: 'c', Ç: 'c', ö: 'o', Ö: 'o', ü: 'u', Ü: 'u', â: 'a', Â: 'a' }
  return String(text || '').replace(/[ıİIşŞğĞçÇöÖüÜâÂ]/g, k => harita[k]).toLowerCase().trim()
}

export function visibleGroups(role) {
  return SETTINGS_GROUPS
    .map(g => ({ ...g, items: g.items.filter(i => i.roles.includes(role)) }))
    .filter(g => g.items.length > 0)
}

// Arama etiket, açıklama ve eş anlamlı kelimelere bakar; rol filtresi her
// zaman uygulanır — arama, göremeyeceği sayfayı göstermenin arka kapısı olmaz.
export function searchSettings(query, role) {
  const q = normalize(query)
  const gorunur = ALL_ITEMS.filter(i => i.roles.includes(role))
  if (!q) return gorunur
  return gorunur.filter(i =>
    normalize(i.label).includes(q)
    || normalize(i.desc).includes(q)
    || normalize(i.keywords).includes(q)
    || normalize(i.groupLabel).includes(q))
}

// ── Sık kullanılanlar ────────────────────────────────────────────────────────
const FAV_KEY = 'settings.favorites.v1'
const SON_KEY = 'settings.recents.v1'
const SON_SINIR = 6

function oku(key, storage) {
  try {
    const d = JSON.parse(storage?.getItem(key) || '[]')
    // Bilinmeyen anahtar (silinmiş sayfa) listeyi kirletmesin.
    return Array.isArray(d) ? d.filter(k => ALL_ITEMS.some(i => i.key === k)) : []
  } catch {
    return []
  }
}

function yaz(key, deger, storage) {
  try {
    storage?.setItem(key, JSON.stringify(deger))
  } catch {
    /* kota dolu veya depolama kapalı — ekran çalışmaya devam eder */
  }
}

export function loadFavorites(storage = globalThis.localStorage) {
  return oku(FAV_KEY, storage)
}

export function toggleFavorite(key, storage = globalThis.localStorage) {
  const mevcut = loadFavorites(storage)
  const yeni = mevcut.includes(key) ? mevcut.filter(k => k !== key) : [...mevcut, key]
  yaz(FAV_KEY, yeni, storage)
  return yeni
}

export function loadRecents(storage = globalThis.localStorage) {
  return oku(SON_KEY, storage)
}

export function pushRecent(key, storage = globalThis.localStorage) {
  if (!ALL_ITEMS.some(i => i.key === key)) return loadRecents(storage)
  const yeni = [key, ...loadRecents(storage).filter(k => k !== key)].slice(0, SON_SINIR)
  yaz(SON_KEY, yeni, storage)
  return yeni
}

export function itemsByKeys(keys, role) {
  return keys
    .map(k => ALL_ITEMS.find(i => i.key === k))
    .filter(i => i && i.roles.includes(role))
}
