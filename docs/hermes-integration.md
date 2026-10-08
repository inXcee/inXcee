# Hermes Agent entegrasyonu (Telegram ajanı)

[Hermes Agent](https://github.com/NousResearch/hermes-agent) (Nous Research, MIT) kendi
sunucunda çalışan bir yapay zekâ ajanıdır: terminal arayüzü, web paneli (`hermes dashboard`)
ve Telegram/WhatsApp/Discord… "gateway"i vardır. Bu doküman inXcee'yi Hermes'e **salt-okunur**
bağlamayı anlatır.

## Ne kuruldu

| Parça | Yer | Görev |
|-------|-----|-------|
| Ajan API'si | `backend/src/modules/agent/` → `/api/agent/*` | Toplu, kişisel veri içermeyen özetler. Ayrı `AGENT_API_TOKEN`. |
| Proje skill'i | `.hermes/skills/inxcee-ops/SKILL.md` | Hermes'e uçları, alan kurallarını ve Telegram yanıt biçimini öğretir. |
| Bekçi script'i | `integrations/hermes/scripts/inxcee_watchdog.py` | LLM'siz cron: sağlık/yedek/kritik anomali; yalnız sorun varken yazar. |
| Örnek ayar | `integrations/hermes/config.example.yaml` | `~/.hermes/config.yaml` içine birleştirilecek güvenli varsayılanlar. |

### `/api/agent` uçları

Hepsi `GET`, hepsi `Authorization: Bearer <AGENT_API_TOKEN>` ister. Yazma ucu **yoktur**.

| Uç | İçerik |
|----|--------|
| `/api/agent/overview?today=YYYY-MM-DD` | KPI, sağlık skoru, anomaliler, su özeti, yedek durumu |
| `/api/agent/occupancy` | Blok bazında oda/yatak/doluluk |
| `/api/agent/anomalies` | Dashboard anomalileri (`critical` / `warning`) |
| `/api/agent/water/alerts?today=…` | Su: irsaliye bekleyen, eksi/düşük stok, plan gerisi bölgeler |
| `/api/agent/backups` | Son yedek, yaşı, son 24 saat sayısı, `stale` (26 saatten eski) |

Kimlik kuralları:

- `AGENT_API_TOKEN` tanımsız veya 32 karakterden kısaysa uçlar **503** (kapalı).
- Yanlış/eksik token **401**. Kullanıcı JWT'si (müdür dahil) bu uçları **açmaz**.
- Yanıtlar personel adı/TC/telefon içermez; `agent.test.js` bunu seed verisiyle doğrular.
  Yeni alan eklerken bu kural korunur — veri LLM sağlayıcısına gider (KVKK).

## Kurulum (canlı sunucu)

### 1. inXcee tarafı

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Çıkan değeri sunucu `.env` dosyasına `AGENT_API_TOKEN=` olarak **elle** yaz, backend'i yeniden başlat
(`pm2 restart yys-backend`). Doğrula:

```bash
curl -s -o /dev/null -w '%{http_code}\n' -H "Authorization: Bearer <TOKEN>" https://<adres>/api/agent/backups   # 200
```

### 2. Hermes kurulumu

Hermes'i **inXcee ile aynı kullanıcıda ve root olarak çalıştırma**. Ayrı bir kullanıcı (ör. `hermes`) ya da
ayrı bir makine tercih et; ajan `yys.db` ve sunucu `.env` dosyasına erişmemeli.

```bash
curl -fsSL https://hermes-agent.nousresearch.com/install.sh | bash
hermes model              # model sağlayıcısı (OpenRouter, Anthropic, Nous Portal, yerel…)
hermes gateway setup      # Telegram'ı seç: BotFather token + kendi Telegram ID'n
```

`~/.hermes/.env` içine ekle:

```bash
TELEGRAM_ALLOWED_USERS=<SENIN_TELEGRAM_ID>      # yalnız sen
INXCEE_URL=https://<adres>
INXCEE_AGENT_TOKEN=<1. adımdaki token>
chmod 600 ~/.hermes/.env
```

`integrations/hermes/config.example.yaml` içeriğini `~/.hermes/config.yaml` içine **birleştir**;
`skills.external_dirs` yolunu sunucudaki inXcee checkout'una göre düzelt. Sonra:

```bash
hermes doctor
hermes skills list | grep inxcee-ops
```

> Hermes'i doğrudan inXcee reposu içinden çalıştırıyorsan `external_dirs` yerine
> `hermes skills trust` ile repo içindeki `.hermes/skills/` proje skill'lerini etkinleştirebilirsin.

### 3. Zamanlanmış işler

Hermes cron script'lerini yalnız `~/.hermes/scripts/` altından çalıştırır (symlink ile dışarı çıkan yol
reddedilir), bu yüzden **kopyala**:

```bash
install -m 755 /opt/inXcee/integrations/hermes/scripts/inxcee_watchdog.py ~/.hermes/scripts/

# 15 dakikada bir bekçi — LLM yok, token harcamaz, yalnız sorun varken Telegram'a yazar
hermes cron create "every 15m" --no-agent --script inxcee_watchdog.py \
  --deliver telegram --name inxcee-bekci

# Hafta içi sabah özeti — LLM'li, skill ile
hermes cron create "45 7 * * 1-5" \
  "inXcee sabah özetini çıkar: overview ucunu çağır, kritik konuları başa al, 8 satırı geçme." \
  --skill inxcee-ops --deliver telegram --name inxcee-sabah
```

Cron saatleri Hermes'in çalıştığı makinenin saat dilimine göredir. Script güncellenince `install` komutunu
tekrarla.

Bekçi davranışı:

- Sorun yok → mesaj yok.
- Sorun → `inXcee uyarı` + satır satır sebep. Aynı sorun sürerken **tekrar yazmaz**.
- Sorun kümesi değişirse yeniden yazar; hepsi düzelince `✅ önceki uyarılar düzeldi`.
- `INXCEE_URL` yoksa sıfırdan farklı çıkış kodu → Hermes bir kez hata bildirimi gönderir.
- Durum dosyası: `~/.hermes/cache/inxcee_watchdog.json` (yalnız uyarı özeti, token değil).

### 4. Telegram'dan kullanım

- "Bugün durum ne?", "M2'de kaç boş yatak var?", "Yedek alındı mı?", "Su stoğunda sorun var mı?"
- `/inxcee-ops` skill'i açıkça yükler; `/cron` ile işleri listele/durdur; `/status`, `/usage`.

## Güvenlik notları

- **Telegram hesabı = sunucuda komut çalıştırma yetkisi.** Hermes'in terminal aracı vardır.
  `TELEGRAM_ALLOWED_USERS` yalnız senin ID'n olmalı. Başkasını eklersen o kişi düz sohbetle komut
  çalıştırtabilir ve onay sorusuna kendisi "yes" diyebilir.
- Örnek ayar `terminal.backend: docker` ve `approvals.mode: manual` kullanır. `/yolo` açma.
- inXcee'ye ajan yalnız `AGENT_API_TOKEN` ile girer; bu token sızarsa yalnız toplu sayılar okunur.
  Yine de sızdıysa sunucuda değiştir ve backend'i yeniden başlat.
- Model sağlayıcısı seçimi KVKK açısından önemlidir: ajan uçları kişisel veri döndürmez, ancak sohbette
  sen kişisel veri yazarsan o da sağlayıcıya gider.
- Yedekleri, `yys-backup` PM2 durumunu ve `/opt/avskamp/backups` eski konumunu nasıl yorumlayacağı
  skill içinde yazılıdır (bkz. CLAUDE.md "Yedekleme").
