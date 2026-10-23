---
name: inxcee-ops
description: inXcee şantiye yatakhane sisteminin canlı durumunu (doluluk, anomali, su stoğu, yedek, sağlık) salt-okunur ajan API'sinden okuyup kısa Türkçe özet verir.
version: 1.0.0
platforms: [linux, macos]
prerequisites:
  commands: [curl]
required_environment_variables:
  - name: INXCEE_URL
    prompt: inXcee adresi (ör. https://yys.ornek.com — sonunda / olmadan)
    help: "Backend'in dışarıdan erişilen kök adresi. /api/health bu adresin altında olmalı."
  - name: INXCEE_AGENT_TOKEN
    prompt: inXcee AGENT_API_TOKEN değeri
    help: "Sunucu .env dosyasındaki AGENT_API_TOKEN ile aynı (en az 32 karakter). Kullanıcı şifresi veya JWT DEĞİLDİR."
metadata:
  hermes:
    tags: [inxcee, operations, telegram, monitoring]
    category: devops
    requires_toolsets: [terminal]
---

# inXcee operasyon özeti

inXcee; 19 blok / 814 odalı şantiye yatakhanesinin yönetim sistemidir. Bu skill
yalnız **okur**. Sistemde hiçbir kaydı değiştiremezsin; değiştirmeye çalışma.

## When to Use

- "Doluluk ne?", "M2'de kaç boş yatak var?", "Bugün sorun var mı?"
- "Yedek alındı mı?", "Su stoğu düşük mü?", "Sabah özetini ver"
- Sabah özeti cron işi (`--skill inxcee-ops`)

## Procedure

Her çağrı aynı kalıptadır; token'ı asla ekrana yazma, mesaja koyma:

```bash
curl -fsS -H "Authorization: Bearer $INXCEE_AGENT_TOKEN" "$INXCEE_URL/api/agent/<uç>"
```

| Uç | Ne döner |
|----|----------|
| `overview?today=YYYY-MM-DD` | KPI + sağlık skoru + anomaliler + su özeti + yedek durumu. **Önce bunu çağır.** |
| `occupancy` | Blok bazında oda/yatak/doluluk; `totals.empty` toplam boş yatak |
| `anomalies` | `severity` = `critical` / `warning` anomali listesi |
| `water/alerts?today=YYYY-MM-DD` | Su: irsaliye bekleyen, eksi stok, düşük stok, plan gerisindeki bölgeler |
| `backups` | Son yedek, yaşı (`age_hours`), son 24 saatteki sayı, `stale` |

Sunucu sağlığı (auth yok): `curl -fsS "$INXCEE_URL/api/health"`.

`today` her zaman kullanıcının yerel günüdür (Türkiye, `TZ=Europe/Istanbul date +%F`).

### Yanıt biçimi (Telegram)

1. Bir satır genel durum: sağlık skoru + doluluk yüzdesi.
2. Varsa **critical** anomaliler, sonra warning'ler — her biri tek satır.
3. Su: yalnız `summary.total > 0` ise sayılarla.
4. Yedek: yalnız `stale=true` ise.
5. Sorun yoksa bunu açıkça söyle; uzun tablo dökme.

## Alan bilgisi

- Blok tipleri: **M** (M1–M3, ortak banyo, oda kapasitesi 6), **S** (S1–S3, özel banyo; S2 kat 2 = 4 kişi),
  **Y** (A, A1–A4, B, C, D, E, F, G, H, J; özel banyo). Y bloklarda kapasite `1` bir **yer tutucudur** —
  gerçek yatak sayısı elle girilir; Y blok doluluk yüzdesini bu yüzden temkinli yorumla.
- Karantinadaki odaya atama yapılamaz; uzun karantina anomali olarak gelir.
- Su modülünde kilitli ay değiştirilemez; eksi stok genelde irsaliyesi girilmemiş giriş demektir.
- Yedekler `/var/data/backups` içindedir. `/opt/avskamp/backups` **eski** konumdur (Mayıs 2026'da donmuş) —
  oraya bakıp "yedek alınmıyor" deme. PM2'de `yys-backup` süreçinin `stopped` görünmesi **normaldir**
  (gece 03:00'te çalışıp çıkar). Yedek kararını yalnız `backups` ucundaki `stale` alanına göre ver.

## Pitfalls

- HTTP 503 → sunucuda `AGENT_API_TOKEN` tanımsız ya da 32 karakterden kısa. HTTP 401 → token eşleşmiyor.
  Bunu kullanıcıya söyle; başka bir kimlik (kullanıcı şifresi, JWT) deneme.
- Ajan uçları kişisel veri döndürmez (KVKK). Kullanıcı isim/TC/telefon isterse bu kanaldan
  verilemeyeceğini, inXcee panelinden bakması gerektiğini söyle.
- Yazma isteği ("şu odayı karantinaya al", "arıza kapat") gelirse yapma; panelden yapılması gerektiğini söyle.

## Verification

`curl -fsS -o /dev/null -w '%{http_code}' -H "Authorization: Bearer $INXCEE_AGENT_TOKEN" "$INXCEE_URL/api/agent/backups"`
`200` dönmeli.
