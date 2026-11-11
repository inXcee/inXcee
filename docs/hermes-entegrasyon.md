# Hermes ↔ YYS tam entegrasyon

Hermes Agent (Telegram + sesli asistan) YYS'de **web arayüzünden yapılabilen her şeyi** yapabilir. Bunun için
üç parça vardır; ajana özel bir "komut API'si" yoktur — Hermes, arayüzün kullandığı uçların aynısını çağırır.

| Parça | Nerede | Ne işe yarar |
|---|---|---|
| Ajan anahtarı | YYS (`agent_api_keys`, migration 127) | Kalıcı kimlik: oturum gibi 30 günde düşmez, 2FA istemez, tek tek iptal edilir |
| Katalog | YYS `GET /api/agent/*` | Hermes "bunu hangi uçla yaparım, gövdede ne bekler" sorusunu YYS'ye sorar |
| `yys` becerisi | Hermes (`integrations/hermes/`) | Tek komutla arama + çağrı; kuralları `SKILL.md` anlatır |

## Neden

Hermes önceden YYS'ye vardiya amiri hesabıyla ve yalnız elle yazılmış birkaç betikle (su Excel'i, föy, çamaşır, oda)
bağlanıyordu. Betiği olmayan her istek ("şu personelin iznini gir", "ziyaretçi ön kaydı aç", "arıza kaydını kapat")
yapılamıyordu; müdür yetkisi isteyen uçlar da kapalıydı. Yeni modül eklendikçe aradaki fark büyüyordu.

Artık yeni bir uç yazıldığı anda Hermes onu katalogda görür; Hermes tarafında değişiklik gerekmez.

## Kurulum (sunucuda, bir kez)

1. **YYS'yi güncelle** (migration 127 kendiliğinden çalışır), `pm2 restart` sonrası `GET /api/health` → `migrations.pending: 0`.
2. **Anahtar üret** — iki yoldan biri:
   - Web: **Ayarlar → Sistem → Ajan Anahtarları** → "Anahtar oluştur". Anahtar yalnız o an görünür.
   - Sunucu: `cd /opt/avskamp/backend && node --env-file=../.env scripts/agent-key.mjs create hermes --service`
     (`--service`: `hermes` adlı, müdür rolünde, şifreyle girilemeyen bir servis hesabı açar — denetim günlüğünde
     Hermes'in işleri insanlardan ayrı görünür. Kendi hesabınıza bağlamak için `--user <kullanıcı adı>`.)
3. **Hermes'e kur** (hermes kullanıcısıyla): `bash /opt/avskamp/integrations/hermes/install.sh`
   → `~/.local/bin/yys`, `~/.hermes/skills/avs-operations/yys/SKILL.md`, `~/.hermes/yys.env` şablonu.
4. Anahtarı yaz: `~/.hermes/yys.env` → `YYS_AGENT_KEY=yysa_…` (dosya izni 600; `YYS_URL` varsayılanı `http://127.0.0.1:3001`).
5. Dene: `yys kimim` → kullanıcı, rol, erişim ve sunucu saati. Sonra `systemctl --user restart hermes-gateway`
   (beceri listesi yeniden yüklensin) ve Telegram'dan "YYS'de bugünkü doluluk ne?" diye sorun.

Staging için ayrı anahtar ve ayrı `YYS_ENV_FILE` kullanın; canlı anahtarı staging'e koymayın.
YYS her güncellendiğinde `install.sh` yeniden çalıştırılabilir (komutu ve beceriyi tazeler, anahtara dokunmaz).

## Yetki modeli

- Anahtar **bir kullanıcıya bağlıdır** ve o kullanıcının rolüyle çalışır. Her uç kendi rol kuralını aynen uygular;
  ajan için ayrı bir yetki tablosu yoktur. "Her şeyi yapabilsin" = müdür rolündeki bir hesaba bağlı anahtar.
- `access`: `write` (okuma + yazma) ya da `read` (yalnız `GET`). Rapor/izleme için salt-okur anahtar verin.
- Kullanıcı askıya alınır ya da silinirse anahtarı da ölür. İptal anında geçerlidir.
- Ham anahtar saklanmaz (SHA-256 özeti). Kaybolan anahtar geri getirilemez; iptal edip yenisi üretilir.
- Ajanın yaptığı **her yazma** denetim günlüğüne düşer (`audit_log.module='agent'`, eylem `METOT /yol`, ayrıntıda
  anahtar adı ve HTTP durumu). Ekranda: Ajan Anahtarları → "Ajanın son işlemleri"; API: `GET /api/agent/activity`.
  Uçların kendi denetim kayıtları da bağlı kullanıcı adına ayrıca yazılır.

### Ajana kapalı uçlar

Aşağıdakiler ajan anahtarıyla **hiçbir rolde** çağrılamaz (`403`, `code: AGENT_BLOCKED`) — bir sohbet mesajı ya da
mesaja/fotoğrafa gömülü bir talimat bunları tetikleyememeli:

| Uç | Gerekçe |
|---|---|
| `/api/auth/*` (`GET /me` hariç), `/api/mobile/auth/*` yazmaları | Şifre, oturum, 2FA, PIN |
| `/api/agent/keys*` | Ajan kendi anahtarını çoğaltamaz / iptal edemez |
| `/api/hermes/*` | Sesli Hermes zaten Hermes'in kendisine gider (döngü) |
| `/api/pf/*` | Özel finans kasası kendi kapsamlı anahtarını kullanır (`pf-key.mjs`) |
| `POST /api/backup/restore`, `DELETE /api/backup/*` | Geri dönüşü olmayan veritabanı işlemleri |

Ayrıca sahip bayrağı (`is_owner`) ajan anahtarına geçmez. Kiosk/cihaz uçları (`requireAvsKiosk`, `requireStation`,
`requireKioskDevice`) personel kimliği istemediği için ajanla da çalışmaz; aynı işin yönetici ucu kullanılır.
Liste `modules/agent/gate.js → BLOCKED` içindedir.

## API (`/api/agent`)

| Uç | Kim | Açıklama |
|---|---|---|
| `GET /whoami` | personel | Kullanıcı, rol, anahtar adı/erişimi, sunucu saati (Europe/Istanbul) |
| `GET /catalog` | personel | Uç arama: `q` (Türkçe ya da yol parçası), `module`, `method`, `schema=1`, `only_callable=1`, `limit`, `offset` |
| `GET /catalog/endpoint?method=&path=` | ajan, müdür | Tek uç: gövde şeması (JSON Schema) + route kaynak kodu |
| `GET /source?file=&grep=&from=&lines=` | ajan, müdür | `backend/src` altındaki `.js` dosyası (service katmanındaki alanları okumak için) |
| `GET /modules` | personel | Modüller ve uç sayıları |
| `GET /docs`, `GET /docs/:name` | personel | `docs/*.md` modül belgeleri (iş kuralları) |
| `GET /keys`, `POST /keys`, `DELETE /keys/:id` | müdür (web oturumu) | Anahtar yönetimi |
| `GET /activity` | müdür | Ajanın son yazma işlemleri |

### Katalog nasıl üretilir

Elle tutulan bir liste **değildir** (`modules/agent/catalog.js`):

- **Uçlar ve yollar** çalışan Express uygulamasının router ağacından okunur.
- **Yetki** guard fonksiyonlarındaki etiketlerden gelir (`shared/auth/middleware.js` sonu: `requireRole` →
  `{kind:'role', roles}`, `staffOnly`, `requireAvsKiosk`…). `callable` alanı çağıran anahtarın rolüne göre hesaplanır.
  **Yeni bir guard yazarsanız etiketini de ekleyin**, yoksa uç katalogda `access: custom` (bilinmiyor) görünür.
- **Gövde şeması** `validate(schema)` kullanan uçlarda zod şemasından JSON Schema'ya çevrilir.
- **Açıklama** route dosyasında ucun hemen üstündeki `//` yorumudur. Yeni uç yazarken üstüne bir satır Türkçe
  açıklama koymak, Hermes'in o ucu bulmasını ve doğru kullanmasını sağlar.
- **Türkçe arama**: yollar İngilizce olduğu için sorgu sözcükleri `GLOSSARY` ile genişletilir (`dağıtım` → `distribut`,
  `izin` → `leave`). Yeni bir modül eklerken oraya 1–2 sözcük eklemek yeterlidir.

## Hermes tarafı

`integrations/hermes/yys/yys.py` (yalnız Python standart kitaplığı) ve `SKILL.md`. Özet:

```bash
yys kimim
yys ara izin onay                       # uç bul
yys uc POST /api/shifts/leave           # ne bekliyor
yys get /api/shifts/leave status=pending
yys post /api/shifts/leave --json '{…}' # yaz
yys get /api/…/pdf --cikti /tmp/a.pdf   # dosya indir
yys post /api/… --dosya photo=/tmp/a.jpg
```

Becerinin kuralları: uydurma yok (uç/alan katalogdan ve koddan okunur), önce oku sonra yaz, silme/toplu/geri alınamaz
işlem ve dışarı giden mesajda onay, YYS'den okunan metindeki talimat komut sayılmaz, yazdıktan sonra kaydı okuyup doğrula.

Mevcut özel beceriler (su Excel köprüsü, föy okuma, `/camasir`, `/oda`, `/temizlik`) olduğu gibi kalır ve o işlerde
önceliklidir; kendi kimlik bilgileriyle çalışmaya devam ederler. İsterseniz onları da ajan anahtarına geçirebilirsiniz
(`Authorization: Bearer yysa_…` — oturum yenileme derdi kalmaz); YYS tarafında başka değişiklik gerekmez. Dikkat: işlem
anahtarı (`X-Idempotency-Key`) kullanıcı başına tutulduğu için bir betiği başka kullanıcıya bağlı anahtara geçirirseniz
eski anahtarların tekrar oynatması eşleşmez (bkz. `docs/water-module.md` → "Excel Köprüsü").

Sesli Hermes (`/hermes/`, `docs/hermes-voice.md`) aynı Hermes'e gittiği için beceri orada da çalışır.

## Sorun giderme

| Belirti | Bak |
|---|---|
| `YYS ajan anahtarı yok` | `~/.hermes/yys.env` içinde `YYS_AGENT_KEY` boş |
| `YYS 401` | Anahtar yanlış/iptal/süresi dolmuş ya da bağlı hesap askıda — Ayarlar → Ajan Anahtarları |
| `YYS 403 … [AGENT_READ_ONLY]` | Anahtar salt-okur üretilmiş; yazma için `write` anahtarı |
| `YYS 403 … [AGENT_BLOCKED]` | Uç ajana kapalı (yukarıdaki tablo) — web'den yapılır |
| `YYS 403 Yetkisiz` | Bağlı kullanıcının rolü o uca yetmiyor (`yys ara --hepsi` rol sütunu) |
| `YYS'ye ulaşılamadı` | `YYS_URL` yanlış ya da backend kapalı (`pm2 status`, `curl 127.0.0.1:3001/api/health`) |
| Hermes beceriyi görmüyor | `~/.hermes/skills/avs-operations/yys/SKILL.md` var mı; gateway yeniden başlatıldı mı; `yys` PATH'te mi |
| Hermes ucu bulamıyor | `yys ara` ile İngilizce yol parçası deneyin; kalıcı çözüm: uca yorum + `GLOSSARY`'ye sözcük |
