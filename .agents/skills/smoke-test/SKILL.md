# /smoke-test — DB & Uygulama Doğrulama

Veritabanı veya şema değişikliğinden sonra uygulamanın çalıştığını doğrula.

## Adımlar

1. **Migration kontrolü** — DB şemasında bekleyen değişiklik var mı kontrol et
2. **Seed çalıştır** — `cd backend && node -e "import('./src/shared/db/index.js').then(m=>m.initDB()).then(()=>import('./src/shared/db/seed.js')).then(m=>m.seedDev())"`
3. **Backend başlat** — `cd backend && npm run dev &` (arka planda)
4. **Login testi** — Her varsayılan kullanıcı için login endpoint'ine istek at:
   - `mudur/admin123`
   - `vardiya/admin123`
   - `teknik/admin123`
   - `camasir/admin123`
   - `meydanci/admin123`
5. **Ana sayfa kontrolleri** — Her modül route'una GET isteği at, 200 dönmeli:
   - `/api/dashboard`
   - `/api/capacity`
   - `/api/checkin`
   - `/api/housekeeping`
   - `/api/maintenance`
   - `/api/discipline`
6. **Sonuçları raporla** — Başarılı/başarısız sonuçları tablo olarak göster
7. **Backend'i kapat** — Test bitince arka plan sürecini durdur

## Hata durumunda

- Login başarısızsa: seed verisi doğru DB'ye yazılmış mı kontrol et (`yys.db` boyutunu kontrol et)
- Route 500 dönüyorsa: backend loglarını incele
- Her sorunu düzelt ve smoke test'i tekrarla
