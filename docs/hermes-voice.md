# Sesli Hermes (`/hermes/`)

YYS sahibinin telefonunda **sesli asistan**: "Hey Google, Hermes'i aç" → sayfa açılır ve dinler → soru Hermes
Agent'a gider (Telegram'daki aynı beceriler: AVS kadro, su, izin, çizelge…) → yanıt yazılır ve sesli okunur →
sohbet modunda yeniden dinler. "Tamam", "teşekkürler" ya da "kapat" deyince durur.

## Mimari

```
Telefon (Chrome / kurulu uygulama "Hermes")
  └─ https://avskamp.com/hermes/         nginx: auth_request → /api/hermes/gate (yalnız sahip; değilse YYS index.html)
       ├─ ses tanıma: tarayıcının Web Speech API'si (tr-TR, Google)    ← mikrofon YALNIZ bu konumda açık
       ├─ seslendirme: tarayıcının speechSynthesis'i (cihazın Türkçe sesi)
       └─ fetch /api/hermes/*            YYS backend (modules/hermes-voice) — sahip oturumu, aynı anda tek soru
            └─ http://127.0.0.1:8642     Hermes Agent api_server (loopback, Bearer anahtar)
                 └─ ajan turu            platform_toolsets.api_server (Telegram'ınkiyle aynı; clarify/tts hariç)
```

- **Hermes anahtarı tarayıcıya hiç inmez.** YYS dosyadan okur: `/etc/avskamp/hermes-api.key` (root, 600;
  `HERMES_API_KEY_FILE` ile değiştirilebilir). Aynı anahtar Hermes'te `~/.hermes/config.yaml →
  platforms.api_server.key`. Dosya yoksa özellik kapalıdır (`/api/hermes/status` → `configured:false`).
- Sahip = `users.is_owner=1` + `campus_manager` + aktif (özel finans kasasıyla aynı kural,
  `shared/auth/owner.js`). Diğer herkes her uçta **404** alır.
- Soru/yanıt içeriği firma denetim günlüğüne **yazılmaz** (kişisel asistan). Hermes kendi oturum geçmişini tutar
  (oturum başlığı "Sesli asistan · <tarih>").
- Sayfa kapanırsa Hermes turu **yarıda kesilmez** (bir kayıt yazılıyor olabilir); yalnız sayfaya akış durur.
- Hermes riskli bir komut için onay isterse sayfada kart çıkar: yalnız **bir kez izin ver** ya da **reddet**.
  Kalıcı izin (session/always) sesli arayüzden verilemez.

## API

| Uç | Açıklama |
|---|---|
| `GET /api/hermes/gate` | nginx alt isteği: sahip 204, başka kullanıcı 403, oturumsuz 401; doğrudan çağrı 404 |
| `GET /api/hermes/status` | `{configured, reachable}` |
| `POST /api/hermes/session` | Hermes'te yeni oturum → `{session_id}` (sayfa 6 saat hareketsizlikte yenisini açar) |
| `POST /api/hermes/ask` | `{text, session_id}` → SSE: `run`, `tool`, `note`, `delta`, `approval`, `answer`, `done` / `error` / `cancelled` |
| `POST /api/hermes/runs/:runId/approval` | `{choice: once\|deny, request_id}` |
| `POST /api/hermes/runs/:runId/stop` | Çalışan turu durdur |

Hermes ulaşılamaz/meşgulse (502/503/429) yanıt anlaşılır mesajla döner ve hata kaydına **düşmez** (Telegram
hata bekçisini gereksiz tetiklemesin).

## Sunucu kurulumu (bir kez)

1. Anahtar: `install -d -m 700 /etc/avskamp; (umask 077; python3 -c "import secrets;print(secrets.token_urlsafe(36))" > /etc/avskamp/hermes-api.key)`
2. Hermes `~/.hermes/config.yaml` (yedek alarak):
   ```yaml
   platforms:
     api_server:
       enabled: true
       host: 127.0.0.1
       port: 8642
       key: <anahtar dosyasındaki değer>
       max_concurrent_runs: 2
   platform_toolsets:
     api_server: [code_execution, cronjob, delegation, file, memory, session_search, skills, terminal, todo, vision, web]
   ```
   `systemctl --user restart hermes-gateway` (hermes kullanıcısı) → günlükte `✓ api_server connected`.
   Kontrol: `curl -s 127.0.0.1:8642/health` → `{"status":"ok"}`; `ss -ltnp | grep 8642` → yalnız `127.0.0.1`.
3. nginx: `nginx/hermes-voice.conf` → `/etc/nginx/snippets/hermes-voice.conf`; canlı ve staging server
   bloklarında `include /etc/nginx/snippets/finance-kasa.conf;` satırının ardına
   `include /etc/nginx/snippets/hermes-voice.conf;` → `nginx -t && systemctl reload nginx`.

## Telefonda kurulum (Android)

1. Chrome'da `avskamp.com`'a sahip hesapla giriş yap, sonra `avskamp.com/hermes/` aç.
2. Chrome menüsü → **Uygulamayı yükle** (ya da "Ana ekrana ekle"). Ana ekranda **Hermes** ikonu belirir.
3. İlk açılışta mikrofon iznine **İzin ver**.
4. "**Hey Google, Hermes'i aç**" → uygulama açılır ve dinlemeye başlar. (Açılınca dinleme, sesli okuma, sohbet
   modu ve ekranı açık tutma ⚙ ayarlardan.)

Ses tanımayı Google'ın konuşma servisi yapar (Chrome'un Web Speech API'si); seslendirme cihazın kendi Türkçe
sesiyle. Gerçek "Hey Hermes" uyandırma sözcüğü yerel bir Android uygulaması gerektirir — bu sürümde yok.

## Sorun giderme

| Belirti | Bak |
|---|---|
| Sayfa yerine YYS ana ekranı açılıyor | Oturum yok/süresi doldu ya da hesap sahip değil (gate 401/403) |
| "Sesli Hermes bu sunucuda henüz kurulmamış" | `/etc/avskamp/hermes-api.key` yok/okunamıyor |
| "Hermes şu an yanıt vermiyor" | `systemctl --user status hermes-gateway`, `curl 127.0.0.1:8642/health` |
| "Mikrofon izni kapalı" | Chrome → site ayarları → avskamp.com → Mikrofon: İzin ver. nginx'te bu konumun `microphone=(self)` başlığı |
| Yanıt okunmuyor | ⚙ "Yanıtı sesli oku" açık mı; telefonda Türkçe TTS sesi yüklü mü (Ayarlar → Metin okuma) |
