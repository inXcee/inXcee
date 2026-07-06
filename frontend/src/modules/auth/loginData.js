export const LAT = 41.57, LON = 32.04

export const COMPASS = ['K', 'KD', 'D', 'GD', 'G', 'GB', 'B', 'KB']

export const WMO = {
  0: 'Açık', 1: 'Az Bulutlu', 2: 'Parçalı Bulutlu', 3: 'Bulutlu', 45: 'Sisli', 48: 'Sisli',
  51: 'Çiseleme', 53: 'Çiseleme', 55: 'Çiseleme', 61: 'Yağmurlu', 63: 'Yağmurlu', 65: 'Yağmurlu',
  71: 'Karlı', 73: 'Karlı', 75: 'Karlı', 80: 'Sağanak', 81: 'Sağanak', 82: 'Kuvvetli Sağanak', 95: 'Gök Gürültülü',
}

export const DEMO_USERS = [
  { username: 'mudur',    password: 'admin123', role: 'Kampüs Müdürü' },
  { username: 'vardiya',  password: 'admin123', role: 'Vardiya Amiri' },
  { username: 'teknik',   password: 'admin123', role: 'Teknik Servis' },
  { username: 'camasir',  password: 'admin123', role: 'Çamaşırhane' },
  { username: 'meydanci', password: 'admin123', role: 'Meydancı' },
]

// k → i18n anahtarı (login.kiosks.<k>_label / _desc); label/desc TR fallback olarak kalır.
export const KIOSKS = [
  { path: '/avs-kiosk',     icon: '🧹', k: 'avs',      label: 'AVS Personel', desc: 'İsim + PIN ile giriş' },
  { path: '/laundry-kiosk', icon: '🧺', k: 'laundry',  label: 'Çamaşırhane',  desc: 'Torba & teslim işlemleri' },
  { path: '/kiosk',         icon: '🛏️', k: 'resident', label: 'Sakin Self-Servis', desc: 'Oda & talep işlemleri' },
]

export const MODE_ORDER = [
  ['standard', '👤', 'Personel'],
  ['admin',    '🛡️', 'Yönetici'],
  ['security', '🚪', 'Güvenlik'],
  ['kiosk',    '📟', 'Kiosk'],
]

export const MODE_TITLES = {
  standard: ['Personel Girişi', 'Yetkili hesabınızla oturum açın · <b>RBAC aktif</b>'],
  admin:    ['Yönetici Girişi', 'Tam yetkili sistem erişimi · <b>2FA destekli</b>'],
  security: ['Güvenlik Girişi', 'Kapı kontrol & ziyaretçi yönetimi · <b>Vardiya bazlı</b>'],
}

// k → i18n anahtarı (login.modules.<k>.name/.spec); name/spec TR fallback.
export const MODULES = [
  { icon: '🛏️', k: 'room',       name: 'Oda & Yatak', spec: '814 yatak · 19 blok' },
  { icon: '📋', k: 'checkinout', name: 'Check-in/out', spec: 'giriş/çıkış akışı' },
  { icon: '🔧', k: 'fault',      name: 'Arıza & Bakım', spec: 'SLA takipli' },
  { icon: '📦', k: 'custody',    name: 'Zimmet', spec: 'dijital imza' },
  { icon: '⚖️', k: 'discipline', name: 'Disiplin', spec: 'kayıt & uyarı' },
  { icon: '📅', k: 'shift',      name: 'Vardiya', spec: 'puantaj entegre' },
  { icon: '🍽️', k: 'cafeteria',  name: 'Yemekhane', spec: 'menü & sayım' },
  { icon: '🧺', k: 'laundry',    name: 'Çamaşırhane', spec: 'kiosk akışı' },
  { icon: '🚪', k: 'visitor',    name: 'Ziyaretçi', spec: 'kapı kontrol' },
  { icon: '📈', k: 'reporting',  name: 'Raporlama', spec: 'günlük özet' },
]

export const PILLARS = [
  { icon: '🛏️', k: 'p1', title: 'Konaklama & Operasyon', desc: 'Oda/yatak atama, check-in/out, ziyaretçi ve disiplin akışları — gerçek zamanlı doluluk.' },
  { icon: '🔧', k: 'p2', title: 'Tesis & Bakım', desc: 'Arıza takibi, bakım planı, zimmet ve çamaşırhane lojistiği tek panelde.' },
  { icon: '👥', k: 'p3', title: 'Personel & İK', desc: 'Vardiya, puantaj, yemekhane ve raporlama — KVKK uyumlu, rol bazlı erişim.' },
]

export const SECURITY = [
  { icon: '🔒', k: 'tls',    title: 'TLS 1.3', desc: 'uçtan uca şifreli' },
  { icon: '🛡️', k: 'rbac',   title: 'RBAC + 2FA', desc: 'rol bazlı + TOTP' },
  { icon: '💾', k: 'backup', title: 'Gece yedeği', desc: 'her gün 03:00' },
  { icon: '⚡', k: 'uptime', title: '%99.9 uptime', desc: 'KampüsERP v5.0' },
]
