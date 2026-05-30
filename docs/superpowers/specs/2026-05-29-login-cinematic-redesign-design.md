# Login Sinematik Yeniden Tasarım — Tasarım Dokümanı

**Tarih:** 2026-05-29
**Durum:** 🟢 Görsel yön + sayfa yapısı ONAYLANDI (mockup üzerinden). Uygulama planı (`writing-plans`) sırada.
**Branch:** `feature/login-cinematic-redesign`
**Hedef dosya:** `frontend/src/modules/auth/LoginPage.jsx` (mevcut "v4") + `LoginPage.css`
**Görsel referans:** [tp-otc.com](https://tp-otc.com/) — kurumsal denizcilik/offshore estetiği (Filyos operasyonu; bizim temamızla örtüşüyor)
**Onaylı mockup:** `docs/login-redesign-assets/mockup-tpotc-style.html` (ekran görüntüleri: `shot-1-hero.png`, `shot-full.png`)

---

## 1. Amaç

Mevcut login (tek viewport, prosedürel Filyos liman sahnesi) **TP-OTC tarzı kurumsal denizcilik landing'ine** dönüşecek: çok bölümlü, kaydırmalı, gelişmiş animasyonlu. Higgsfield ile üretilen gerçek sinematik video/görseller kullanılır. Orijinal işlevsellik (RBAC, 2FA, cooldown, caps-lock, modlar, kiosk kısayolları) **bozulmadan** korunur.

## 2. Onaylanan görsel yön (TP-OTC)

**Renk dili:** Derin lacivert taban (`#04101c`/`#071c30`) + **cyan/turkuaz accent** (`#19c6d4`/`#4fe8ee`) + "sönmeyen ateş" **sıcak amber vurgu** (`#ff9d3d`). Cam (glass) paneller, cyan kenar parıltısı, laciv/cyan gradient butonlar.

- Hero = **VIDEO** (statik değil): `hero-night.mp4` taban (dalga gel-git, alev titreşir, ışık suya yansır). Poster: `D2-night-bright.png` (gece-aydınlık). Hareket **yavaş/sakin** varsayılan.
- Yağmur + dalga + rüzgâr **canlı hava verisinden** (open-meteo — zaten entegre, `LAT 41.57 / LON 32.04`).
- Tipografi: bold sans-serif başlıklar, mono saat/spec; TP-OTC'deki otorite + mühendislik havası.

## 3. Katman mimarisi (hero)

1. **Hero video katmanı** — zaman dilimine göre kısa loop; ilk yüklemede statik poster, video lazy-load.
2. **Reaktif ön-plan (canvas)** — yağmur partikülleri; yoğunluk/eğim hava verisinden; kapatılabilir.
3. **UI katmanı** — cam login paneli + nav + kaydırmalı kurumsal bölümler.

### Hero HUD (sağ üst)
- **Hareket:** Sakin (video durur, poster) / Yavaş (0.5×, varsayılan) / Normal (1×)
- **Yağmur:** AÇ / KAPA toggle
- `prefers-reduced-motion` → otomatik **Sakin** + yağmur kapalı. Tercihler localStorage'da.

## 4. Sayfa bölümleri (kaydırmalı) — HEPSİ ONAYLANDI (mockup sırası)

1. **Sticky nav:** marka + bölüm linkleri (Modüller/Sayılarla/Bloklar/Filyos/Güvenlik) + canlı saat + ONLINE nabzı
2. **HERO:** video + yağmur canvas + HUD + sol slogan ("814 yatak, 19 blok, tek operasyon merkezi") + sağ **geliştirilmiş login paneli** + scroll-down ipucu
3. **Misyon bandı:** TP-OTC "sönmeyen ateş" tarzı tek satır slogan (amber vurgu)
4. **Hizmet kartları (3):** Konaklama & Operasyon / Tesis & Bakım / Personel & İK — hover-lift, glow
5. **Modül carousel (10):** TP-OTC gemi-kartı tarzı; her kart canlı rozet (Arıza 3, Çamaşır 12, doluluk %…) + teknik spec; yatay scroll-snap
6. **"Sayılarla AVS":** count-up istatistik gridi (doluluk / dolu yatak / aktif blok / aktif personel) — IntersectionObserver tetikli
7. **19 Blok Doluluk Haritası:** renkli heatmap (yeşil<60 → sarı<80 → kırmızı), hover'da blok+%. Bloklar `shared/blocks.js`'ten (`BLOCKS`) — hardcode YOK
8. **Filyos Anlık Ortam:** sıcaklık / rüzgâr / dalga / gün doğumu (open-meteo canlı)
9. **Sistem & Güvenlik bandı:** TLS 1.3 / RBAC+2FA / gece yedeği 03:00 / uptime+sürüm
10. **Ticker** (hassas veri yok) + **kurumsal footer** (KVKK · Koşullar · Çerez · Destek · İletişim · sürüm)

### Geliştirilmiş login paneli (onaylı)
- 4 mod (Personel / Yönetici / Güvenlik / Kiosk) — mevcut `MODE_ORDER` + `MODE_TITLES` korunur
- **Dil seçici (TR/EN/AR)** — kiosk i18n altyapısı login'e taşınacak
- **Son giriş bilgisi** ("Son giriş: dün 18:42") — backend desteği gerekebilir (bkz. açık sorular)
- **🔑 Passkey / biyometrik giriş** — backend `@simplewebauthn` ZATEN VAR, login'e bağlanacak
- Beni hatırla, şifremi unuttum, şifre göster, caps-lock ipucu, klavye kısayolları, otomatik odak
- 2FA TOTP akışı (mevcut `TwoFactorInput` — auto-advance/paste/shake) korunur
- Kiosk modu: PIN/QR ekran kısayolları (mevcut `KIOSKS`)

## 5. Üretilen asset envanteri (Higgsfield)

Yerel: `docs/login-redesign-assets/`. Model: görseller `nano_banana_pro`, videolar `seedance_2_0`, 16:9.

| Asset | job_id | Dosya | Not |
|---|---|---|---|
| **Gece (aydınlık) — TABAN/poster** | `51bfd6c5-3c2d-4a86-9ae3-9bd2a0a05a17` | D2-night-bright.png | ✅ poster |
| **Hero video — gece (SEÇİLEN)** | `38292b3f-a5eb-4edf-abd5-0e0ce873bbc3` | hero-night.mp4 | ✅ dalga/alev/ışık |
| Gün batımı (görsel) | `09156500-…` | A-sunset.png | alternatif |
| Şafak (sisli) | `b4291d04-…` | B1-dawn.png | döngü adayı |
| Yağmurlu gündüz | `9784a6f3-…` | B2-rainday.png | döngü adayı |
| Hero video — gün batımı | `7ccd1a75-…` | hero-sunset.mp4 | örnek |

**Mockup'lar:** `mockup-tpotc-style.html` (✅ ONAYLI — TP-OTC yönü), `mockup-design-final.html` (eski mavi-mor, arşiv).

## 6. Açık sorular (uygulama sırasında netleşecek — engelleyici değil)

- **Son giriş** için backend alanı (`last_login_at` + ua/ip) gerekli; eklenecek mi yoksa şimdilik gizlensin mi? (Faz planında ayrı adım)
- **Kalan zaman-dilimi video'ları** (şafak + gündüz) ileride üretilebilir; v1 gece taban ile çıkar.
- **Loop dikişi:** video baş/son karesi tam uymuyor → kısa cross-fade ile maskelenecek (v1 çözümü).
- Hareket hızı varsayılanı **Yavaş (0.5×)** olarak çıkar, kullanıcı ayarlayabilir.

## 7. Performans / a11y / fallback (uygulamada zorunlu)

- Video: lazy-load + poster; `prefers-reduced-motion`/düşük-güç/kiosk'ta statik görsel
- Yağmur canvas: kapatılabilir, reduced-motion'da kapalı, sekme görünmezken rAF durdur
- Scroll-reveal/count-up: IntersectionObserver; reduced-motion'da anında görünür (animasyonsuz)
- Carousel/ticker/heatmap **JSX ile render** — `innerHTML` KULLANMA (XSS); mockup'taki innerHTML sadece prototip
- Mobil: hero-copy gizli, tek kolon, gridler 2 kolona düşer, nav linkleri gizlenir
- Asset boyutu: video web için optimize (720p, kısa, iyi sıkıştırma), `/uploads` üzerinden serve
- CSP: helmet `mediaSrc`/`imgSrc` video/asset kaynaklarına güncellenecek; `open-meteo` zaten `connectSrc`'de mi kontrol et

## 8. Sonraki adımlar (resume sırası)

1. ✅ Görsel yön + sayfa yapısı onaylandı (mockup)
2. ✅ Bu spec güncellendi → self-review
3. `writing-plans` ile faz faz uygulama planı (bileşen ayrıştırma: hero/login-kart/bölümler ayrı dosyalar)
4. `LoginPage.jsx` v4 üzerinde kademeli uygula — her faz test + a11y koru, faz başına commit
5. (İleride) kalan video'lar + seamless loop + son-giriş backend alanı
