// Faz 32 — Hazır e-posta şablonları (dahili/builtin).
// Kullanıcının sık gönderdiği yazışmalar için doldur-gönder şablonları.
// {{degisken}} yer tutucuları frontend'de doldurulur. Özel şablonlar DB'de tutulur;
// bunlar koddadır (versiyonlu, seed drift yok) ve id'leri "builtin:" ön ekli.

export const TEMPLATE_CATEGORIES = [
  { id: 'rapor',    label: 'Firma / Yönetime Rapor' },
  { id: 'tedarik',  label: 'Tedarikçi / Servis Firması' },
  { id: 'personel', label: 'Personel Bilgilendirme' },
  { id: 'resmi',    label: 'Resmi / Kurumsal Yazışma' },
]

export const BUILTIN_TEMPLATES = [
  // ── Firma / yönetime rapor ──
  {
    id: 'builtin:aylik-durum',
    category: 'rapor',
    name: 'Aylık Durum Raporu',
    subject: '{{ay}} Ayı Kamp Durum Raporu',
    body: `Sayın {{yetkili}},

{{ay}} ayına ait kamp durum özeti aşağıdadır:

• Doluluk: {{doluluk}}
• Aktif personel sayısı: {{personel_sayisi}}
• Açık bakım/arıza talebi: {{acik_ariza}}
• Öne çıkan konular: {{notlar}}

Detaylı rapor ektedir. Sorularınız için müsaitim.

Saygılarımla,
{{gonderen}}`,
  },
  {
    id: 'builtin:olay-bildirimi',
    category: 'rapor',
    name: 'Acil Olay / Durum Bildirimi',
    subject: 'BİLGİLENDİRME: {{konu}}',
    body: `Sayın {{yetkili}},

{{tarih}} tarihinde aşağıdaki olay meydana gelmiştir:

Olay: {{konu}}
Yer: {{yer}}
Açıklama: {{aciklama}}
Alınan aksiyon: {{aksiyon}}

Gelişmeleri sizinle paylaşmaya devam edeceğim.

Saygılarımla,
{{gonderen}}`,
  },

  // ── Tedarikçi / servis firması ──
  {
    id: 'builtin:malzeme-siparis',
    category: 'tedarik',
    name: 'Malzeme Sipariş Talebi',
    subject: 'Malzeme Sipariş Talebi — {{firma}}',
    body: `Sayın Yetkili,

Aşağıdaki malzemelerin tarafımıza teminini rica ederiz:

{{malzeme_listesi}}

Teslim adresi: {{teslim_adresi}}
Talep edilen teslim tarihi: {{teslim_tarihi}}

Fiyat ve teslim bilgisini iletmenizi rica eder, iyi çalışmalar dileriz.

{{gonderen}}
{{iletisim}}`,
  },
  {
    id: 'builtin:servis-cagri',
    category: 'tedarik',
    name: 'Arıza / Bakım Servis Çağrısı',
    subject: 'Servis Talebi: {{cihaz}} — {{yer}}',
    body: `Sayın Yetkili,

Aşağıdaki arıza için servis talebimizi iletiyoruz:

Cihaz/ekipman: {{cihaz}}
Konum: {{yer}}
Arıza tanımı: {{ariza}}
Aciliyet: {{aciliyet}}

En kısa sürede dönüş yapmanızı rica ederiz.

{{gonderen}}
{{iletisim}}`,
  },
  {
    id: 'builtin:teklif-isteme',
    category: 'tedarik',
    name: 'Fiyat Teklifi İsteme',
    subject: 'Fiyat Teklifi Talebi — {{konu}}',
    body: `Sayın Yetkili,

Aşağıda belirtilen iş/malzeme için fiyat teklifinizi rica ederiz:

Kapsam: {{kapsam}}
Miktar/adet: {{miktar}}
Şartlar: {{sartlar}}

Teklifinizi {{son_tarih}} tarihine kadar iletmenizi rica ederiz.

Saygılarımla,
{{gonderen}}
{{iletisim}}`,
  },

  // ── Personel bilgilendirme ──
  {
    id: 'builtin:genel-duyuru',
    category: 'personel',
    name: 'Genel Duyuru',
    subject: 'Duyuru: {{konu}}',
    body: `Değerli çalışma arkadaşları,

{{mesaj}}

Bilginize sunar, iyi çalışmalar dilerim.

{{gonderen}}`,
  },
  {
    id: 'builtin:vardiya-degisiklik',
    category: 'personel',
    name: 'Çalışma Düzeni / Vardiya Değişikliği',
    subject: 'Vardiya/Çalışma Düzeni Değişikliği — {{tarih}}',
    body: `Değerli çalışma arkadaşları,

{{tarih}} tarihinden itibaren geçerli olmak üzere çalışma düzeninde aşağıdaki değişiklik yapılmıştır:

{{degisiklik}}

Sorularınız için {{iletisim}} ile iletişime geçebilirsiniz.

{{gonderen}}`,
  },
  {
    id: 'builtin:hatirlatma',
    category: 'personel',
    name: 'Hatırlatma / Uyarı',
    subject: 'Hatırlatma: {{konu}}',
    body: `Değerli çalışma arkadaşları,

{{konu}} konusunda hatırlatma yapmak isteriz:

{{mesaj}}

Duyarlılığınız için teşekkür ederiz.

{{gonderen}}`,
  },

  // ── Resmi / kurumsal yazışma ──
  {
    id: 'builtin:resmi-yazi',
    category: 'resmi',
    name: 'Resmi Bilgi / Talep Yazısı',
    subject: '{{konu}} Hk.',
    body: `Sayın {{kurum}} Yetkilisi,

{{tarih}} tarihli konu ile ilgili olarak;

{{metin}}

Gereğini bilgilerinize arz/rica ederiz.

Saygılarımızla,
{{gonderen}}
{{unvan}}`,
  },
  {
    id: 'builtin:evrak-ust-yazi',
    category: 'resmi',
    name: 'Evrak Gönderim Üst Yazısı',
    subject: 'Evrak Gönderimi: {{konu}}',
    body: `Sayın {{kurum}} Yetkilisi,

Ekte sunulan {{evrak}} belgesini bilgilerinize sunarız.

Ek: {{ek_listesi}}

Saygılarımızla,
{{gonderen}}
{{unvan}}`,
  },
]

// {{degisken}} yer tutucularını çıkarır (frontend fill alanları için de kullanılabilir)
export function extractVariables(text) {
  const set = new Set()
  const re = /\{\{\s*([\wğüşıöçĞÜŞİÖÇ]+)\s*\}\}/g
  let m
  while ((m = re.exec(text || '')) !== null) set.add(m[1])
  return [...set]
}
