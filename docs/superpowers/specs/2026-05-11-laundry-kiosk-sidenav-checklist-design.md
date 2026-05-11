# Çamaşırhane Kiosk Sol-Nav + Parça Checklist — Tasarım Dokümanı

**Tarih:** 2026-05-11
**Kapsam:** AVS Çamaşırhane Kiosk (`frontend/src/modules/laundry-kiosk/LaundryKioskPage.jsx`) sayfa düzeni yenilemesi + parça-bazlı sayım tik listesinin tüm transition ekranlarına genişletilmesi.

---

## 1. Motivasyon

Mevcut kiosk:
- 5-buton ana ekran (Torba Al, Ütü, Teslim Et, Durum, Kıyafet Gir) → bir butona tıkla → alt-ekran içeriği devralır → "Geri" ile ana ekrana dön.
- Sekmeler arası geçiş 2 tıklama (Geri + yeni sekme).
- Premium torba doğrulama tik-listesi **sadece Ütü** ekranında var. Teslim ekranında görevlinin "3 gömlekten 3'ünü teslim ediyorum" doğrulaması için liste yok.
- `MachineView` kodda var ama hiçbir butona bağlı değil — ölü kod.

Hedef:
- "Normal sayfa" düzeni: sol nav + içerik (LaundryHub gibi). Sekmeler hep görünür, tek tıkla geçilir.
- Parça-tik paterni Ütü + Teslim'de aynı şekilde çalışır (reusable).
- Foto / hasar raporu / makine sekmesi bu sprint'te değil.

---

## 2. Sayfa Düzeni

### Genel iskelet

```
┌────────────────────────────────────────────────────────┐
│  🧺 Çamaşırhane  · Berkay Ö. · 14:32       [Çıkış]    │
├──────────────┬─────────────────────────────────────────┤
│ 🧺 Torba Al  │                                         │
│ 👔 Kıyafet   │   [aktif sekme içeriği]                 │
│ 🫧 Ütü       │                                         │
│ 🚚 Teslim    │                                         │
│ 📋 Durum     │                                         │
└──────────────┴─────────────────────────────────────────┘
```

### Layout detayları

- **Üst bar:** 56px sticky. Sol: 🧺 + "Çamaşırhane" başlık. Orta: kullanıcı adı + rol etiketi. Sağ: Çıkış butonu.
- **Sol nav:**
  - Desktop/tablet (`≥ 640px`): genişlik `160px`, sticky, dikey buton listesi. Aktif sekme `bg-blue-700 text-white`, diğerleri `bg-slate-800 text-slate-400 hover:bg-slate-700`. Her buton 48px yükseklik, ikon + label.
  - Mobile (`< 640px`): sol-nav alta düşer, **bottom-nav 5 ikon** (label gizli, sadece emoji). Aktif olan ikonun altında 3px renk barı.
- **İçerik alanı:** `flex: 1`, padding 16px, alt-component buraya render olur. Mevcut `BagForm / GarmentForm / IroningView / DeliverView / StatusView` aynen kullanılır (sadece ana shell değişti).
- **Saat:** üst bardaki `14:32` her 60 sn `setInterval` ile günceller — kiosk'ta zaman görmek pratik.

### State

```js
const [activeTab, setActiveTab] = useState(() => {
  const fromUrl = new URLSearchParams(location.search).get('tab')
  return ['bag', 'garment', 'ironing', 'deliver', 'status'].includes(fromUrl) ? fromUrl : 'bag'
})

useEffect(() => {
  const url = new URL(location.href)
  url.searchParams.set('tab', activeTab)
  history.replaceState(null, '', url)
}, [activeTab])
```

Yenilense sekme korunur. Login state'i (`avsToken`, `workerInfo`) aynı kalır.

### "Geri" butonu

Kalkar. Sekmeler arası gezme = sol nav'a tıklama. Form içinde "Ana Ekrana Dön" butonları (success state'lerinden sonra) → sekme aynı kalır, sadece form state'i resetlenir (success → false).

---

## 3. Parça Checklist (`GarmentChecklist`)

### Bileşen

Yeni dosya: `frontend/src/modules/laundry-kiosk/GarmentChecklist.jsx`

```jsx
export default function GarmentChecklist({ garments, ticked, onToggle, variant = 'default' }) {
  // garments: parsed array, [{ type_name, count, emoji, colors, color, color_label, pattern, pattern_label }]
  // ticked: { [idx]: boolean }
  // onToggle: (idx) => void
  // variant: 'ironing' | 'deliver' | 'default' → kart border rengi
}
```

**Davranış (sayım-tik):**
- Her parça için tek tık → ✓ tikli.
- Tikli kart: `bg-emerald-950 border-emerald-500`. Tiksiz: `bg-slate-800 border-slate-700`.
- Parça başlığı: `{emoji} {type_name} × {count}` (count > 1 ise).
- Renk dotları + pattern label aynen mevcut `IroningView`'deki gibi gösterilir.
- Altta `{tickedCount}/{total} doğrulandı` rozeti — `tickedCount === total` ise yeşil + bold.

**Hasar / eksik durumu yok.** Görevli sorun görürse LaundryHub'a not düşer (manuel akış).

**Garments boşsa:** Component hiçbir şey render etmez — parent karar verir (genelde "Kıyafet bilgisi yok, doğrudan devam" mesajı + tek buton).

### Kullanım

**IroningView (mevcut, refactor):**
```jsx
<GarmentChecklist garments={garments} ticked={ticked} onToggle={toggleTick} variant="ironing" />
```
Mevcut inline JSX (`~80 satır`) silinir, component'e taşınır.

**DeliverView (yeni):**
```jsx
{selectedBag && parsedGarments.length > 0 && (
  <>
    <div style={lbl}>PARÇALARI DOĞRULA</div>
    <GarmentChecklist garments={parsedGarments} ticked={ticked} onToggle={toggleTick} variant="deliver" />
  </>
)}
```
Onay butonu (`Teslim Et`) disabled olur tüm parçalar tikli olana kadar. Parça yoksa (`parsedGarments.length === 0`) checklist hiç görünmez, mevcut akış aynen çalışır.

---

## 4. Etkilenen Dosyalar

| Dosya | Değişim |
|-------|---------|
| `frontend/src/modules/laundry-kiosk/LaundryKioskPage.jsx` | Shell yeniden yazılır: 5-buton grid → sol-nav (desktop) + bottom-nav (mobile). Üst bardaki inline "Geri" butonu kalkar. `IroningView` ve `DeliverView` `GarmentChecklist` kullanır. `MachineView` fonksiyonu dosyada kalır ama mount edilmez (zaten mevcutta da edilmiyor). URL param sync eklenir. |
| `frontend/src/modules/laundry-kiosk/GarmentChecklist.jsx` | **YENİ.** Reusable parça-tik bileşeni. ~120 satır. |
| Backend | **Dokunulmaz.** Mevcut `/self-service/laundry-kiosk/*` endpoint'leri aynen kullanılır. |
| Test dosyaları | Yeni backend testi gerekmez (backend değişmiyor). |

---

## 5. Kapsam Dışı

Bu sprint'te yapılmayanlar (gelecek backlog'a not):
- Fotoğraf çekme (premium giriş/teslim)
- Hasar / eksik raporu kiosk'tan (mevcutta LaundryHub'dan manuel)
- Makine sekmesi (`MachineView` kodu ölü olarak kalır)
- Session timeout (kiosk açık kalır)
- PIN keypad (mevcut isim-arama + 4 haneli input korunur)
- Premium garment search (renk/desen/sahip) — LaundryHub'da yeterli
- Toplu işlem (tek odadan birden fazla torba batch teslim)
- Undo son aksiyon

---

## 6. Test Planı

Manuel kiosk akışları:
1. **Sekme geçişi:** Tüm 5 sekme arasında tek-tık geçiş. URL `?tab=…` güncellenir, yenilense sekme korunur.
2. **Mobile layout:** `< 640px` viewport'ta bottom-nav görünür, sol-nav gizlenir. Aktif sekme indikatörü çalışır.
3. **Premium torba akışı:** Torba Al → 3 parça premium → kaydet → Ütü sekmesine geç → torba listede → seç → 3 parça checklist göster → 2 tikle (buton disabled) → 3. tikle (enabled) → Tamamla → torba "ready" olur. Teslim sekmesine geç → blok+oda gir → torba listele → 3 parça checklist göster → hepsini tikle → ad+imza → Teslim Et → başarı.
4. **Normal torba (premium olmayan):** Akış aynen mevcut davranış — checklist çıkmaz, doğrudan onay butonu.
5. **Login/Çıkış:** Login akışı dokunulmaz, çalıştığı doğrulanır.

Backend testleri (`npx vitest run`) etkilenmez — 324/324 geçmeye devam etmeli.

---

## 7. Migrasyon Notu

Mevcut kullanıcılar kiosk açık tutmuş olabilir. Build sonrası refresh ile yeni shell yüklenir, `activeTab` URL'de yoksa default `'bag'` olur. `IroningView` form state'i sıfırdan başlar (geçici). Veri kaybı yok — sadece UI shell değişiyor.
