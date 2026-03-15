# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Proje

Şantiye yatakhane yönetim sistemi — 8 modüllü tam stack web uygulaması.

## Komutlar

### Geliştirme
```bash
npm install          # root'ta — tüm bağımlılıklar
npm run dev          # frontend (5173) + backend (3001) eş zamanlı başlatır
```

### Backend
```bash
cd backend
npm run dev          # backend tek başına
npm run test         # tüm testler (vitest)
npm run test:watch   # watch mode
```

### Frontend
```bash
cd frontend
npm run dev          # Vite dev server
npm run build        # production build
```

### Tek test çalıştırma
```bash
cd backend && npx vitest run src/modules/checkin/checkin.test.js
```

### Seed (geliştirme DB)
```bash
cd backend && node -e "import('./src/shared/db/index.js').then(m=>m.initDB()).then(()=>import('./src/shared/db/seed.js')).then(m=>m.seedDev())"
```

## Mimari

- `backend/src/modules/<modül>/` — her modül: `routes.js` (Express router), `service.js` (iş mantığı), `queries.js` (SQL)
- `backend/src/shared/` — `auth/`, `db/`, `notifications/`, `cron/`
- `frontend/src/modules/<modül>/` — her modül kendi sayfaları
- `frontend/src/shared/` — `components/`, `hooks/`, `store/`, `api/`

## Veritabanı

`yys.db` (SQLite) — geliştirmede proje kökünde oluşur.
Test dosyaları `:memory:` kullanır (`process.env.DB_PATH = ':memory:'`).

## Roller

`campus_manager` · `shift_supervisor` · `technical` · `laundry` · `housekeeper`

Varsayılan geliştirme kullanıcıları (seed'den): `mudur/admin123`, `vardiya/admin123`, `teknik/admin123`, `camasir/admin123`, `meydanci/admin123`

## Kritik Kısıtlar

- S2 blok odaları max 4 kişi — DB CHECK constraint
- Karantina odalarına atama — INSERT trigger ile bloke
- Zimmet imzası — canvas base64 olarak `digital_signature` kolonuna kaydedilir
- SSE endpoint: `GET /api/notifications/stream` — token header ile
