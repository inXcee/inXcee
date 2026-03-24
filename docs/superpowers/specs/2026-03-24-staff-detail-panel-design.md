# Staff Detail Panel — Premium Redesign Spec
**Date:** 2026-03-24
**Scope:** ShiftsPage — yoklama sekmesi kaldırma + StaffDetailPanel bottom sheet yeniden tasarımı

---

## 1. Kapsam

### Kaldırılanlar
- `NAV_ITEMS` dizisinden `attendance` girdisi çıkarılır
- `AttendanceTab` bileşeni (satır 2366–2530) ve tüm referansları silinir
- `ShiftsPage` render'ında `activeTab === 'attendance'` dalı silinir

### Değiştirilenler
- `StaffDetailPanel` bileşeni (satır 322–584) sıfırdan yeniden yazılır
- `SidePanel` wrapper yerine yeni `BottomSheet` bileşeni kullanılır

---

## 2. BottomSheet Bileşeni

### Pozisyon & Boyut
- `position: fixed; bottom: 0; left: 0; right: 0`
- Yükseklik: `82vh`, `max-height: 82vh`
- `border-radius: 20px 20px 0 0`
- `overflow: hidden` — iç scroll yalnızca sekme içerik kısmında
- `z-index: 55`

### Body Scroll Lock
- Panel açılınca: `document.body.style.overflow = 'hidden'`
- Panel kapanınca (unmount): `document.body.style.overflow = ''`
- `useEffect` cleanup'ında restore edilir — birden fazla panel aynı anda açılmaz

### Animasyon
- Açılış: `transform: translateY(100%) → translateY(0)`, `transition: 0.28s cubic-bezier(0.32, 0.72, 0, 1)`
- Kapanış: reverse, ardından unmount
- Backdrop: `rgba(0,0,0,0.6)` fade-in, tıklanınca kapatır

### Drag Handle
- Üstte 32×4px yuvarlak çubuk, `var(--border)` rengi
- Görsel — işlevsel drag gesture yok (sade tutar)

---

## 3. Header Bölümü

### Üst Renk Bandı
- Yükseklik: 4px
- Renk: `deptColor(person.dept_color).bg` — departman rengiyle uyumlu
- Tam genişlik

### Ana Header Alanı
- `padding: 16px 24px 0`
- `background: var(--surface)`
- İki sütun layout: **sol** (avatar + kimlik) | **sağ** (aksiyon butonları)

#### Sol — Avatar + Kimlik
- Avatar: 64px daire, `border: 2px solid <dept-color>`, gradyan arka plan, cinsiyet rengi
  - Erkek: `rgba(59,130,246,0.15)` bg, `var(--blue)` text
  - Kadın: `rgba(244,114,182,0.15)` bg, `#f472b6` text
  - Harf: 28px, display font, bold
- İsim: 20px, `var(--display)`, `letter-spacing: 1px`
- Pozisyon + `#id`: 10px mono, `var(--text3)`
- Badge row: dept_name (blue), kan grubu (red), AKTIF/PASİF (green/gray)

#### Sağ — Aksiyon Butonları
- 4 buton: `✎ Düzenle`, `+ Vardiya`, `+ İzin`, `+ Mesai`
- Boyut: `btn btn-xs` stili, `border-radius: 8px`
- Düzenle: `btn-ghost`; diğerleri: outline/ghost, küçük renkli ikon

### Stat Grid
- `margin-top: 14px`, 5 sütun eşit grid
- Her kart: `background: var(--surface2)`, `border: 1px solid var(--border)`, `border-radius: 10px`, `padding: 10px 4px`
- Sıra: VARDIYA (`totalShifts`, `--blue`) · ÇALIŞTI (`workedShifts`, `--green`) · MESAİ (`totalOvertime` saat, `--accent`) · İZİN (`totalLeave` gün, `--purple`) · YOK (`absentCount`, `--red`)
- Sayı: 22px, display font, renkli
- Etiket: 8px mono, `var(--text3)`, `letter-spacing: 1px`
- ÇALIŞTI kartının altında: **çalışma oranı** progress bar — `workedShifts / totalShifts * 100` (totalShifts=0 ise bar gizlenir)

---

## 4. Sekme Çubuğu

- `border-top: 1px solid var(--border)`, `border-bottom: 1px solid var(--border)`
- `margin-top: 14px`
- 5 sekme: **ÖZET · BİLGİ · VARDİYA · İZİN · MESAİ**
- Her sekme: ikon + kısa etiket, `overflow-x: auto`
- Aktif: `border-bottom: 2px solid var(--accent)`, `color: var(--accent)`

---

## 5. Sekme İçerikleri

### ÖZET — Activity Timeline
- Son 20 kayıt: vardiya + izin + mesai karışık (attendanceLogs dahil edilmez — yoklama sekmesi kaldırıldı)
- Veri kaynağı: `/shifts/staff/:id/detail` → `shiftHistory`, `leaveHistory`, `overtimeRecords` (mevcut endpoint, değişmez)
- Birleştirme: her kayıt `{ date, type, label, color }` formatına normalize edilir, `date` DESC sıralanır
- Her satır: renkli sol bant (4px) + tarih (mono, `dd MMM`) + tip ikonu + açıklama
- Renk kodu: vardiya=`var(--blue)`, izin=`var(--purple)`, mesai=`var(--accent)`
- Boş durum: centered subtle mesaj

### BİLGİ — Info Grid
- 2 sütun grid, her alan: ikon + etiket + değer
- Alanlar: TC No, Telefon, E-posta, Kan Grubu, Doğum Tarihi + Yaş, İşe Giriş, Acil Kişi, Acil Tel, Maaş, Cinsiyet, Adres (tam genişlik), Notlar (tam genişlik)
- `—` değerler soluk gösterilir

### VARDİYA — Vardiya Geçmişi
- Her satır: tarih (mono) + shift renk badge + saat aralığı + durum badge
- En üstte küçük filtre: TÜM / ÇALIŞTI / PLANLI / İZİNLİ / YOK
- Sonsuz scroll yerine "Daha fazla göster" butonu (ilk 30, +30 artışla)

### İZİN — İzin Geçmişi
- Kart görünümü: üst satır (izin tipi badge + durum badge) + tarih aralığı + gün sayısı
- Onaylı izinlerde yeşil sol bant, reddedilende kırmızı, bekleyende sarı

### MESAİ — Mesai Geçmişi
- Üstte toplam saat özeti chip'i
- Her satır: tarih + saat (kalın, mor) + neden
- Satır hover'ında hafif arka plan

---

## 6. Quick Action Inline Formlar

Her aksiyon butonu tıklandığında panel içinde `ActionForm` bileşeni açılır:

```
[Header sabitleniyor]
[Sekme çubuğu sabitleniyor]
── Üstten kayarak gelen form overlay ──
  Form alanları
  [İptal] [Kaydet]
──────────────────────────────────────
```

- BottomSheet iç yapısı: `header (flex-shrink:0)` + `tab bar (flex-shrink:0)` + `content area (flex:1, overflow-y:auto, position:relative)`
- ActionForm, `content area` üzerine `position: absolute; inset: 0` ile overlay olur — konumlama bağlamı `content area`
- Animasyon: `translateY(-8px) opacity 0 → translateY(0) opacity 1`
- Başarılı kayıt sonrası: form kapanır, ilgili query key invalidate edilir (`['staff-detail', staffId]`), sekme içeriği otomatik güncellenir
- Esc tuşu: açık ActionForm varsa formu kapatır; yoksa bottom sheet'i kapatır

### Formlar

| Aksiyon | Alanlar |
|---|---|
| Düzenle | Tüm staff alanları, 2 sütun grid, mevcut verilerle dolu |
| + Vardiya | Tarih seçici + shift tanımı seçici |
| + İzin | İzin tipi + başlangıç/bitiş tarihi + açıklama |
| + Mesai | Tarih + saat miktarı + neden |

---

## 7. Etkilenen Dosyalar

| Dosya | Değişiklik |
|---|---|
| `frontend/src/modules/shifts/ShiftsPage.jsx` | AttendanceTab sil, NAV_ITEMS güncelle, StaffDetailPanel yeniden yaz, BottomSheet bileşeni ekle |
| `backend/src/modules/shifts/routes.js` | Değişiklik yok |
| `backend/src/modules/shifts/queries.js` | Değişiklik yok |

### anchorRect prop
- Mevcut `handlePersonClick(id, rect)` ve `selectedStaff.rect` kullanımı tamamen kaldırılır
- `handlePersonClick` yalnızca `id` alır: `(id) => setSelectedStaff(id)`
- `StaffDetailPanel` prop'u: `staffId` ve `onClose` — `anchorRect` artık yok
- Bottom sheet konumlaması `anchorRect`'e bağımlı değil

### deptColor yardımcı fonksiyonu
- Mevcut `deptColor(colorClass)` fonksiyonu (ShiftsPage.jsx satır 594) korunur
- Return shape: `{ bg: string, text: string }` — bu property'ler header renk bandında kullanılır

---

## 8. Kısıtlar & Kararlar

- Tailwind kullanılmaz — tüm stiller `var(--*)` CSS variables ve mevcut utility class'lar
- `SidePanel` bileşeni korunur (diğer yerlerde kullanılıyor olabilir)
- `AttendanceTab` backend route'ları (`/shifts/attendance`) dokunulmaz — ileride başka yerden kullanılabilir
- Drag-to-dismiss gesture eklenmez (sadelik için — sadece backdrop tıklama + Esc)
- Mobile responsive (`< 480px`): aksiyon butonları `flex-wrap`, stat grid `grid-template-columns: repeat(3, 1fr)` (5→3 sütun, YOK ve İZİN alt satıra geçer), sekme etiketi gizlenir yalnızca ikon kalır
