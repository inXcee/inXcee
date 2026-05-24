# AVS Kiosk UX Temeli — Tasarım Spec'i (P1)

> **Bağlam:** AVS personel kiosk'u (`/avs-kiosk`, `frontend/src/modules/avs-self-service/AvsSelfServicePage.jsx`) canlıda (avskamp.com). 4 fazlı geliştirmenin **1. fazı**: arayüzü gerçek bir dokunmatik kiosk'a uygun hale getirmek. P2 (panel boşlukları), P3 (kardeşten taşıma), P4 (net-yeni) ayrı spec'ler.

**Amaç:** Mevcut "mobil web sayfası" hissindeki kiosk'u, klavyesiz dokunmatik tablette (duvara monte) rahat kullanılabilir hale getirmek. Saf frontend — backend/şema/endpoint değişikliği YOK.

## Sorun (mevcut kod)

- PIN klavye `<input type=password>` ile alınıyor (`AvsSelfServicePage.jsx:192`, `:421`) → klavyesiz tablette zor.
- Sekmeler üstte yatay-kaydırmalı, `text-xs`, küçük dokunma alanları (`:221-231`) → 6 sekmenin bir kısmı kayar, başparmakla zor.
- Saat/tarih yok (kiosklar gösterir).
- Açılış dili `navigator.language`'tan (`i18n/index.js:13`) → kioskta çoğu zaman EN; Türk iş gücü için yanlış varsayılan.
- Yükleniyor = düz yazı (`:238` vb.).
- Vardiya durumu **ham key** olarak görünüyor: `{s.status}` → "worked"/"absent" (`:256`). Lokalize değil — bug benzeri.

## Mimari

Mevcut `AvsSelfServicePage.jsx` tek dosyada login + 6 panel + state'i tutuyor. P1, sunum katmanını **izole, tekrar kullanılabilir kiosk bileşenlerine** ayırır; iş mantığı/state sayfada kalır.

**Yeni bileşenler** (`frontend/src/modules/avs-self-service/components/`):

| Bileşen | Sorumluluk | Props (arayüz) | Bağımlılık |
|---|---|---|---|
| `PinPad.jsx` | Dokunmatik numerik PIN girişi | `value, onChange(next), onComplete(), length=4, error?` | yok (kontrollü) |
| `BottomNav.jsx` | Sabit alt sekme çubuğu | `tabs[], active, onChange(key)` (tab: `{key, icon, label, badge?}`) | yok |
| `KioskHeader.jsx` | Üst bar: kullanıcı + canlı saat + çıkış | `userName, onLogout` | `useClock` |
| `KioskSkeleton.jsx` | Panel yükleme placeholder'ı | `rows=3` | yok |

**Yeni hook** (`frontend/src/shared/hooks/`):
- `useClock.js` — `HH:MM` + tarih, `setInterval(30s)` ile günceller, unmount'ta temizler.

`AvsSelfServicePage.jsx` bu bileşenleri kullanacak şekilde refactor edilir; login formu PinPad'i, ana ekran KioskHeader + BottomNav'ı, paneller KioskSkeleton'u kullanır.

## Bileşen tasarımı

### PinPad
- 3×4 grid: `1-9`, boş, `0`, `⌫`. Büyük butonlar (min 64px yükseklik, `text-2xl`).
- Üstte nokta göstergesi: `● ● ● ○` (girilen hane sayısı).
- `onChange` her basışta günceller (sadece rakam, `length` ile sınırlı). Son hane girilince `onComplete()` (otomatik giriş/submit tetiği).
- `error` prop'u varsa noktaların altında kırmızı mesaj + kısa shake (CSS).
- Kontrollü bileşen — değeri parent tutar (login `pin` ve change-PIN alanları için tekrar kullanılır).

### BottomNav
- `position: fixed; bottom: 0`, `max-w-lg` ortalı (sayfa ile aynı genişlik), güvenli alan padding'i (`env(safe-area-inset-bottom)`).
- Her sekme: ikon (üstte, ~22px) + etiket (altta, `text-[11px]`). Aktif: mavi vurgu. `badge` > 0 ise ikonun sağ-üstünde kırmızı sayı (Duyurular okunmamış).
- İçerik alanı alt bar yüksekliği kadar `padding-bottom` alır (içerik bar arkasında kalmasın).
- Etiketler i18n'den; ikonlar mevcut emoji set'i (⏱🚌✅📢🔧👤).

### KioskHeader
- Sol: kullanıcı adı (`font-semibold`). Sağ: canlı `HH:MM` + tarih (`Pzt, 24 May`) ve `Çıkış` butonu (büyük dokunma alanı).
- `useClock` ile dakikada bir saat güncellenir.

### KioskSkeleton
- 2-3 adet nabız animasyonlu (`animate-pulse`) gri kart. Her panelin `!data` durumunda yazı yerine bu render edilir.

## Davranış değişiklikleri (state, sayfada)

1. **Varsayılan TR:** `i18n/index.js` ilk-yükleme mantığı: kayıtlı tercih yoksa `navigator.language` yerine `DEFAULT_LOCALE`'i (`tr`) kullan. (Switcher ve kullanıcı tercihi aynen çalışır — sadece varsayılan değişir.) Bu değişiklik tüm public ekranları etkiler (login, laundry-kiosk dahil) — kasıtlı, istenen davranış.
2. **Otomatik giriş:** PinPad 4. hanede `onComplete` → login formunda otomatik submit; change-PIN'de sadece alan dolar (manuel "Değiştir").
3. **Vardiya durum lokalizasyonu:** `shift_schedule.status` enum'ı tam 5 değer (`schema.js:304` CHECK): `scheduled, worked, absent, on_leave, overtime`. i18n grubu `avs_kiosk.shifts.status.*` (Planlı / Çalıştı / Gelmedi / İzinli / Mesai) + renkli rozet. `{s.status}` yerine `t('avs_kiosk.shifts.status.'+s.status, s.status)` (bilinmeyen key fallback ham değer). Renk haritası mevcut (`:244`) korunur, rozet stiline taşınır.
4. **Logout state reset:** çıkışta `selected/pin/nameQuery/results` da sıfırlanır (mevcut bilinen bulgu — eski seçim kalmasın).

## i18n eklemeleri

`dict.js` `avs_kiosk` grubuna (tr/en/ar):
- `shifts.status.*` — tam 5 değer: `scheduled, worked, absent, on_leave, overtime`
- `pinpad.clear` / aria etiketleri (⌫, rakamlar — erişilebilirlik)
- `header` için tarih formatı locale'den (`toLocaleDateString`).

## Erişilebilirlik (hedef, kapsamda)

- BottomNav butonları `role="tab"` + `aria-selected`; PinPad butonları `aria-label` (rakam/sil).
- Dokunma alanları min 44×44px.
- (Tam a11y audit ayrı todo — burada sadece yeni bileşenler doğru etiketlenir.)

## Hata yönetimi

Mevcut akış korunur: login hatası PinPad altında, fault/PIN hataları panel içinde. PinPad `error` prop'u ile login/PIN hata mesajını gösterir + shake.

## Test

- **Bileşen birim testi (vitest + @testing-library/react):** `PinPad` (basış→onChange, 4. hane→onComplete, ⌫), `BottomNav` (aktif/badge/onChange). Proje frontend testi az (todo) ama yeni izole bileşenler test edilebilir.
- **Build doğrulama:** `npm run build -w frontend`.
- **Manuel/Playwright smoke:** mevcut smoke akışı güncellenir (numpad ile PIN, alt nav ile sekme geçişi). Login selector'ları değişeceği için smoke'taki PIN girişi numpad'e uyarlanır.

## Kapsam dışı (sonraki fazlar)

- Servis saati/harita, görev tamamlama, arıza foto → **P2**
- QR/çamaşır/disiplin/feedback → **P3**
- Yemek/izin/bordro/push → **P4**
- Offline/PWA cache, tam a11y audit → ayrı iş.

## Doğrulanmış gerçekler

- Mevcut `useIdleTimeout` hook'u var (`shared/hooks/useIdleTimeout.js`) — değişmez, kullanılmaya devam.
- `LanguageSwitcher` `aria-pressed` + locale state'i `i18n/index.js`'de (`STORAGE_KEY='yys-locale'`, `LOCALES`, `DEFAULT_LOCALE`).
- Backend dokunulmaz: `/auth/avs-search`, `/auth/avs-login`, `/avs-self-service/*` aynı.
