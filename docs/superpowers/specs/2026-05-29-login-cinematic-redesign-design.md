# Login Sinematik Yeniden Tasarım — Tasarım Dokümanı (TASLAK / checkpoint)

**Tarih:** 2026-05-29
**Durum:** 🟡 Brainstorm checkpoint — görsel yön + sayfa yapısı onaylandı, spec finalize + uygulama planı BEKLİYOR.
**Branch:** `feature/login-cinematic-redesign`
**İlgili dosya:** `frontend/src/modules/auth/LoginPage.jsx` (mevcut "v4") + `LoginPage.css`

> Bu doküman bir sonraki oturumda kaldığımız yerden devam etmek için yazıldı. "Devam edelim" denince buradan oku.

---

## 1. Amaç

Mevcut login (zaten animasyonlu prosedürel Filyos liman sahnesi) **daha cezbedici, sinematik ve canlı** hale getirilecek; sayfa tek viewport yerine **kaydırmalı, çok bölümlü** bir landing'e dönüşecek. Higgsfield ile üretilen gerçek sinematik video/görseller kullanılacak. Orijinal işlevsellik (RBAC, 2FA, cooldown, caps-lock, modlar) **bozulmadan** korunacak.

## 2. Onaylanan görsel yön

**Reaktif Sinematik Filyos** = A (foto-gerçekçi sinematik liman) + D (zaman/hava reaktiflik) birleşimi.
- Kullanıcı tercihi: **gece sahnesi** ("2") taban, **aydınlık** (liman net görünür, karanlık değil), cam login kartı **belirgin saydam**.
- Hero = **VIDEO** (statik değil). Dalgalar gel-git, alev/ateş titreşir, ışıklar suya yansır. Hareket **yavaş/sakin** (kullanıcı hızlı loop'u sevmedi).
- Yağmur + dalga + rüzgâr **canlı hava verisinden** (open-meteo — zaten entegre).

## 3. Katman mimarisi

1. **Hero video katmanı** — zaman dilimine göre kısa loop (şafak / gündüz / gün batımı / gece). Saat hangi loop'un oynayacağını seçer. İlk yüklemede statik poster (üretilen görsel), video lazy-load.
2. **Reaktif ön-plan (canvas)** — yağmur/rüzgâr/dalga partikülleri; yoğunluk/eğim hava verisinden.
3. **UI katmanı** — saydam cam login paneli + nav metrikleri + kaydırmalı bölümler.

### Kullanıcı kontrolleri (HUD, sağ üst)
- **Hareket:** Sakin (video durur, poster) / Yavaş (0.5×, varsayılan) / Normal (1×)
- **Yağmur:** AÇ / KAPA toggle
- `prefers-reduced-motion` → otomatik **Sakin** + yağmur kapalı. Tercihler localStorage'da.

## 4. Sayfa bölümleri (kaydırmalı) — HEPSİ ONAYLANDI

1. **Üst bar (sticky):** marka + canlı metrikler (doluluk / yatak / arıza / personel) + saat + ONLINE
2. **HERO:** video + yağmur + HUD toggle'lar + sol tanıtım metni + sağ **geliştirilmiş login paneli**
3. **Canlı Kampüs:** sayaç count-up + doluluk barı + 7g mini trend (sparkline)
4. **19 Blok Doluluk Haritası** (YENİ): renkli heatmap (yeşil→sarı→kırmızı), hover'da blok+%
5. **Modüller:** canlı rozetler (Arıza 3, Çamaşır 12, bugün 8 check-in…) + kategori sekmeleri (Operasyon/Tesis/İK) + hover açıklama
6. **Filyos Anlık Ortam:** sıcaklık / rüzgâr / dalga / gün doğumu
7. **Sistem & Güvenlik bandı** (YENİ): TLS 1.3 / RBAC+2FA / gece yedeği 03:00 / uptime+sürüm
8. **Footer:** KVKK · Koşullar · Destek · telif

### Geliştirilmiş login paneli (A ekstraları onaylı)
- 4 mod (Personel / Yönetici / Güvenlik / Kiosk) — mevcut `MODE_ORDER` korunur
- **Dil seçici (TR/EN/AR)** — kiosk i18n altyapısı var, login'e taşınacak
- **Son giriş bilgisi** ("Son giriş: dün 18:42") — backend desteği gerekebilir
- **🔑 Passkey / biyometrik giriş** — backend'de `@simplewebauthn` ZATEN VAR, login'e bağlanacak (ciddi vau etkisi, görece kolay)
- Beni hatırla, şifremi unuttum, şifre göster, caps-lock ipucu (mevcut), klavye kısayolları + otomatik odak
- Kiosk kısayolları (AVS / Çamaşır / Sakin) — mevcut `KIOSKS`

## 5. Üretilen asset envanteri (Higgsfield)

Yerel kopya: `docs/login-redesign-assets/`. Higgsfield hesabı galerisinde de var (job id ile bulunur). Model: görseller `nano_banana_pro` (nano_banana_2), videolar `seedance_2_0`, 16:9.

| Asset | Higgsfield job_id | Dosya | Not |
|---|---|---|---|
| Gün batımı (sunset) | `09156500-d79e-48af-8026-cac160cc8304` | A-sunset.png | A yönü |
| Şafak (sisli) | `b4291d04-39fb-4418-b023-b6a2a7c094a5` | B1-dawn.png | döngü |
| Yağmurlu gündüz | `9784a6f3-84e6-4570-87d6-f010cef5cbf1` | B2-rainday.png | döngü |
| Partikül/3D (C yönü) | `256e3590-df42-4dee-9833-ecc163149213` | C-particles.png | seçilmedi |
| Gece (karanlık) | `ad7b02a2-d169-4964-964a-9247a746c7c4` | D-night.png | çok karanlıktı |
| **Gece (aydınlık) — TABAN** | `51bfd6c5-3c2d-4a86-9ae3-9bd2a0a05a17` | D2-night-bright.png | ✅ seçilen taban |
| Hero video — gün batımı | `7ccd1a75-f4e6-4a02-a273-dbf7726d36d7` | hero-sunset.mp4 | örnek |
| **Hero video — gece (SEÇİLEN)** | `38292b3f-a5eb-4edf-abd5-0e0ce873bbc3` | hero-night.mp4 | ✅ dalga/alev/ışık |

**Mockup:** `docs/login-redesign-assets/mockup-design-final.html` (uçtan uca, çalışan). Brainstorm oturum klasörü: `.superpowers/brainstorm/1065-1780011205/content/` (gitignore — diskte durur).

## 6. Açık sorular / sonraki oturumda karar verilecek

- **Loop dikişi:** 5sn video baş/son karesi birebir değil → ufak zıplama. Çözüm (a) sona doğru kısa cross-fade, (b) Higgsfield'dan start=end seamless/boomerang loop üret. KARAR BEKLİYOR.
- **Kalan zaman-dilimi video'ları** üretilecek: şafak + gündüz (gece var, gün batımı örnek var).
- **Renk paleti** onayı: şu an mavi-mor accent — daha sıcak/kurumsal isteniyor mu?
- **Son giriş** için backend alanı (last_login_at + ua/ip) gerekli mi, eklenecek mi?
- Hareket hızı "Yavaş" yeterli mi yoksa 0.3× / varsayılan Sakin mi?

## 7. Performans / a11y / fallback (uygulamada zorunlu)

- Video: lazy-load + poster; `prefers-reduced-motion` ve düşük-güç/kiosk'ta video yerine statik görsel
- Yağmur canvas: kapatılabilir, reduced-motion'da kapalı, sekme görünmezken durdur (rAF pause)
- Mobil: hero-copy gizli, tek kolon; nav metrikleri sadeleşir
- Asset boyutu: video'ları web için optimize et (720p, kısa, iyi sıkıştırma), CDN/uploads üzerinden serve
- CSP: video/asset kaynaklarına izin (helmet `mediaSrc`/`imgSrc` güncellenecek)

## 8. Sonraki adımlar (resume sırası)

1. Açık soruları (bölüm 6) kullanıcıyla netleştir
2. Bu dokümanı finalize et → spec self-review
3. `writing-plans` skill'i ile faz faz uygulama planı
4. Asset üretimini tamamla (kalan video'lar, seamless loop)
5. `LoginPage.jsx` v4 üzerinde kademeli uygula (test + a11y koru)
