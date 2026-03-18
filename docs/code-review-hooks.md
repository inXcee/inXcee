# Code Review: Git Hooks + Claude Config Kurulumu

**Tarih:** 2026-03-18
**Kapsam:** `.git/hooks/`, `.claude/`, `.gitignore`

---

## Bulunan Sorunlar ve Yapilan Duzeltmeler

### 1. Secret Tarama — Working Tree Yerine Staged Icerik (YUKSEK)

**Sorun:** `xargs grep -l` komutu staged dosyalarin working tree kopyasini tariyordu. Staged'da secret varsa ama working tree'de yoksa yakalanamiyordu.

**Ek sorun:** Bosluklu dosya yollarinda (ornegin `test claude/`) `xargs` kiriliyordu.

**Duzeltme:** `git diff --cached -U0` uzerinden staged icerik taraniyor artik. Dosya yoluna dokunulmuyor.

```bash
# ONCE (hatali)
FOUND=$(echo "$STAGED_FILES" | xargs grep -l -E "$SECRET_PATTERNS" 2>/dev/null || true)

# SONRA (duzeltilmis)
FOUND=$(git diff --cached -U0 | grep -E "$SECRET_PATTERNS" || true)
```

---

### 2. Secret Bulunursa Commit Engellenmiyordu (YUKSEK)

**Sorun:** Secret tespit edildiginde sadece `WARNING` yaziliyordu, `exit 1` yoktu. Commit devam ediyordu.

**Duzeltme:** Secret bulunursa `exit 1` ile commit engelleniyor.

```bash
# ONCE
echo "WARNING: Possible secrets detected in:"
echo "Review carefully before committing."
# (exit yok, commit devam eder)

# SONRA
echo "BLOCKED: Possible secrets detected in staged changes:"
exit 1
```

---

### 3. Secret Pattern Listesi Eksikti (ORTA)

**Sorun:** Proje-spesifik secret pattern'ler (`JWT_SECRET`, `DATABASE_URL`, `ANTHROPIC_API_KEY`) listede yoktu.

**Duzeltme:** Pattern listesi genisletildi:

```bash
SECRET_PATTERNS="API_KEY|SECRET_KEY|PRIVATE_KEY|PASSWORD=|TOKEN=|aws_access_key|JWT_SECRET|DATABASE_URL|ANTHROPIC_API_KEY|OPENAI_API_KEY"
```

---

### 4. .env Blogu Tum Varyantlari Kapsamiyordu (ORTA)

**Sorun:** Sadece `.env`, `.env.local`, `.env.production` engelleniyordu. `.env.staging`, `.env.test` gibi dosyalar kaçiyordu.

**Duzeltme (pre-commit):** Regex `\.env` olarak genisletildi — `.env` iceren tum dosyalar engellenir.

**Duzeltme (.gitignore):** 3 ayri satir yerine tek `.env*` wildcard'i kullanildi.

```gitignore
# ONCE
.env
.env.local
.env.production

# SONRA
.env*
```

---

### 5. pre-push `@{push}` Ilk Push'ta Calismiyordu (ORTA)

**Sorun:** `@{push}` referansi upstream ayarlanmamis branch'lerde hata veriyordu. `2>/dev/null` bunu yutuyordu ve frontend build kontrolu her zaman atlaniyordu.

**Duzeltme:** `git merge-base` kullaniyor, upstream yoksa root commit'e fallback yapiyor.

```bash
# ONCE
FRONTEND_CHANGED=$(git diff --name-only @{push}.. 2>/dev/null | grep "^frontend/" || true)

# SONRA
BASE_REF=$(git merge-base "$REMOTE/$BRANCH" HEAD 2>/dev/null || git rev-list --max-parents=0 HEAD | head -1)
FRONTEND_CHANGED=$(git diff --name-only "$BASE_REF"..HEAD | grep "^frontend/" || true)
```

---

### 6. Emoji Karakterleri (DUSUK — Kozmetik)

**Sorun:** Emoji karakterleri bazi Windows terminallerinde bozuk gorunuyordu.

**Duzeltme:** Hook ciktilari duz metin olarak degistirildi. post-commit hook'taki dekoratif output korundu (sadece bilgilendirme amacli).

---

## Dogrulanmamis / Kapsam Disi

- `.claude/` dizini `.gitignore`'da ignore ediliyor. Eger takim ile paylasilmasi isteniyorsa ignore'dan cikarilmali.
- pre-push hook'un `npm run build` asamasi canlı test edilmedi (frontend degisikligi olmadigi icin atlanir).

---

## Dogrulama Sonuclari

| Test | Sonuc |
|------|-------|
| `bash .git/hooks/pre-commit` | "Pre-commit checks passed." |
| `bash .git/hooks/post-commit` | Commit bilgisi dogru gorunuyor |
| Hook dosyalari executable | 3/3 `rwxr-xr-x` |
| `.gitignore` `.env*` satiri | Mevcut |
