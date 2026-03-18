# Claude Code 4 Katman Kurulumu

**Tarih:** 2026-03-18
**Proje:** KampusERP — Santiye Yatakhane Yonetim Sistemi

---

## Katman 1: Claude Code Hooks

Claude her tool kullandiginda otomatik calisan scriptler.
Konum: `.claude/hooks/`
Config: `.claude/settings.local.json` → `hooks` alani

### Aktif Hook'lar

| Hook | Olay | Ne Yapar |
|------|------|----------|
| `block-dangerous.sh` | PreToolUse (Bash) | `rm -rf /`, `drop table`, `git push --force origin main` gibi tehlikeli komutlari engeller |
| `block-env-edit.sh` | PreToolUse (Edit/Write) | `.env` dosyalarinin AI tarafindan editlenmesini engeller |
| `auto-format.sh` | PostToolUse (Edit/Write) | JS/TS/CSS dosyalarini prettier ile otomatik formatlar |
| `notify-done.sh` | Stop | Gorev tamamlaninca Windows masaustu bildirimi gonderir |

### Test Sonuclari

```
$ echo '{"command":"rm -rf /"}' | bash .claude/hooks/block-dangerous.sh
ENGELLENDI: Tehlikeli komut tespit edildi.    → exit 1 ✓

$ echo '{"command":"npm run dev"}' | bash .claude/hooks/block-dangerous.sh
(bos)                                        → exit 0 ✓

$ echo '{"file_path":".env.local"}' | bash .claude/hooks/block-env-edit.sh
ENGELLENDI: .env dosyasina dokunulamaz.      → exit 1 ✓

$ echo '{"file_path":"src/app.js"}' | bash .claude/hooks/block-env-edit.sh
(bos)                                        → exit 0 ✓
```

---

## Katman 2: Git Hooks

Git commit/push islemlerinde otomatik calisan scriptler.
Konum: `.git/hooks/`

| Hook | Ne Yapar |
|------|----------|
| `pre-commit` | .env* dosyalarini engeller, staged icerikde secret tarar, backend testlerini calistirir |
| `post-commit` | Commit bilgilerini gosterir (branch, hash, dosya sayisi) |
| `pre-push` | Main'e push uyarisi, frontend build kontrolu (merge-base ile, ilk push'ta da calisir) |

---

## Katman 3: Kurallar (CLAUDE.md)

AI'in her session'da otomatik okudugu kurallar.
Konum: `CLAUDE.md` → "Kod Kurallari (Zorunlu)" bolumu

| Kural | Aciklama |
|-------|----------|
| Test olmadan commit yok | Backend degisikligi varsa vitest gecmeli |
| `any` tipi yasak | TypeScript'te `unknown` veya dogru tip kullan |
| `console.log` birakma | Debug icin kullan, commit oncesi temizle |
| `.env` dosyalarina dokunma | Secrets elle yonetilir |
| SQL injection yasak | Parametreli sorgular zorunlu |
| Semantic commit mesajlari | feat/fix/chore/refactor/docs/test prefix'leri |

---

## Katman 4: Proje Hafizasi (CLAUDE.md)

AI'in projeyi tanimasi icin gereken bilgiler.
Konum: `CLAUDE.md`

Mevcut icerik:
- Tech stack (Express + SQLite + React + Vite + Tailwind)
- Modul yapisi (backend/frontend modules)
- Veritabani (SQLite, test'te :memory:)
- Roller (campus_manager, shift_supervisor, technical, laundry, housekeeper)
- Seed kullanicilari
- Kritik kisitlar (S2 max 4, karantina blogu, zimmet imzasi, SSE token)

---

## Dosya Yapisi

```
.claude/
  settings.local.json    ← permissions + hooks config
  hooks/
    block-dangerous.sh   ← PreToolUse: tehlikeli komut engeli
    block-env-edit.sh    ← PreToolUse: .env edit engeli
    auto-format.sh       ← PostToolUse: otomatik format
    notify-done.sh       ← Stop: masaustu bildirimi
  rules.md               ← (eski, kurallar artik CLAUDE.md'de)
  skills.md              ← (referans dokumani)

.git/hooks/
  pre-commit             ← .env + secret + test kontrolu
  post-commit            ← commit bilgi ciktisi
  pre-push               ← main uyarisi + frontend build

CLAUDE.md                ← proje hafizasi + kurallar
```

---

## Duzeltilen Sorunlar

1. **Global settings.json** — `permissions.allow` icine yanlis yazilmis kurallar temizlendi
2. **Kurallar** — CLAUDE.md'ye tasindi (AI'in gercekten okudugu yer)
3. **Claude Code hooks** — sifirdan 4 hook eklendi (oncesinde yoktu)
4. **Git pre-commit** — secret tarama staged icerikten yapiliyor (working tree degil)
5. **Git pre-push** — `@{push}` yerine `merge-base` fallback eklendi
6. **.gitignore** — `.env*` wildcard ile tum varyantlar kapsandiKapsaminda

---

## Kullanim

```bash
# Normal calisma — sadece yaz ve commit et
git add <dosyalar>
git commit -m "feat: yeni ozellik"
# → pre-commit otomatik: .env kontrol + secret tarama + test
# → post-commit otomatik: bilgi ciktisi

# Push
git push
# → pre-push otomatik: main uyarisi + frontend build

# Claude Code icinde
# → Tehlikeli komut yazarsan: ENGELLENDI
# → .env dosyasina dokunursan: ENGELLENDI
# → Dosya editlersen: otomatik format
# → Gorev bitince: masaustu bildirimi
```
