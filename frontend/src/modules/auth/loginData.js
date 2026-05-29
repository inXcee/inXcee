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

export const KIOSKS = [
  { path: '/avs-kiosk',     icon: '🧹', label: 'AVS Personel', desc: 'İsim + PIN ile giriş' },
  { path: '/laundry-kiosk', icon: '🧺', label: 'Çamaşırhane',  desc: 'Torba & teslim işlemleri' },
  { path: '/kiosk',         icon: '🛏️', label: 'Sakin Self-Servis', desc: 'Oda & talep işlemleri' },
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

export const MODULES = [
  { icon: '🛏️', name: 'Oda & Yatak', spec: '814 yatak · 19 blok' },
  { icon: '📋', name: 'Check-in/out', spec: 'giriş/çıkış akışı' },
  { icon: '🔧', name: 'Arıza & Bakım', spec: 'SLA takipli' },
  { icon: '📦', name: 'Zimmet', spec: 'dijital imza' },
  { icon: '⚖️', name: 'Disiplin', spec: 'kayıt & uyarı' },
  { icon: '📅', name: 'Vardiya', spec: 'puantaj entegre' },
  { icon: '🍽️', name: 'Yemekhane', spec: 'menü & sayım' },
  { icon: '🧺', name: 'Çamaşırhane', spec: 'kiosk akışı' },
  { icon: '🚪', name: 'Ziyaretçi', spec: 'kapı kontrol' },
  { icon: '📈', name: 'Raporlama', spec: 'günlük özet' },
]

export const PILLARS = [
  { icon: '🛏️', title: 'Konaklama & Operasyon', desc: 'Oda/yatak atama, check-in/out, ziyaretçi ve disiplin akışları — gerçek zamanlı doluluk.' },
  { icon: '🔧', title: 'Tesis & Bakım', desc: 'Arıza takibi, bakım planı, zimmet ve çamaşırhane lojistiği tek panelde.' },
  { icon: '👥', title: 'Personel & İK', desc: 'Vardiya, puantaj, yemekhane ve raporlama — KVKK uyumlu, rol bazlı erişim.' },
]

export const SECURITY = [
  { icon: '🔒', title: 'TLS 1.3', desc: 'uçtan uca şifreli' },
  { icon: '🛡️', title: 'RBAC + 2FA', desc: 'rol bazlı + TOTP' },
  { icon: '💾', title: 'Gece yedeği', desc: 'her gün 03:00' },
  { icon: '⚡', title: '%99.9 uptime', desc: 'KampüsERP v5.0' },
]
