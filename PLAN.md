# Yatakhane Yönetim Sistemi — Geliştirme Planı

## Mevcut Modüller (Tamamlanan)

| # | Modül | Backend | Frontend | Test | Durum |
|---|-------|---------|----------|------|-------|
| 1 | Auth & Login | ✅ | ✅ | ✅ | Tamamlandı |
| 2 | Dashboard | ✅ | ✅ | ✅ | Tamamlandı |
| 3 | Check-in (Kayıt) | ✅ | ✅ | ✅ | Tamamlandı |
| 4 | Capacity (Kapasite) | ✅ | ✅ | ✅ | Tamamlandı |
| 5 | Housekeeping (Temizlik) | ✅ | ✅ | ✅ | Tamamlandı |
| 6 | Maintenance (Bakım) | ✅ | ✅ | ✅ | Tamamlandı |
| 7 | Discipline (Disiplin) | ✅ | ✅ | ✅ | Tamamlandı |
| 8 | Laundry (Çamaşır) | ✅ | ✅ | ✅ | Tamamlandı |
| 9 | Checkout (Çıkış) | ✅ | ✅ | ✅ | Tamamlandı |
| 10 | Inventory (Envanter) | ✅ | ✅ | ✅ | Tamamlandı |
| 11 | Reports (Raporlar) | ✅ | ❌ | ✅ | Backend tamam, frontend rapor indirme butonu gerekli |
| 12 | Shifts (Vardiya) | ✅ | ❌ | ✅ | Backend tamam |
| 13 | Room History | ✅ | ❌ | ✅ | Backend tamam |
| 14 | Self Service | ✅ | ❌ | ✅ | Backend tamam |
| 15 | Notifications (SSE) | ✅ | ✅ | ❌ | Çalışıyor |

## Sonraki Fazlar

### Faz 1 — Frontend Eksiklikleri
- [ ] Reports sayfası: PDF indirme butonları (temizlik, bakım, doluluk, disiplin)
- [ ] Shifts yönetim sayfası (varsa)
- [ ] Room History görüntüleme sayfası
- [ ] Code splitting (628KB chunk → lazy loading ile küçült)

### Faz 2 — UX & Mobil
- [ ] Responsive tasarım iyileştirmeleri (mobil uyumlu sidebar)
- [ ] PWA desteği (offline erişim, push notifications)
- [ ] Dark mode

### Faz 3 — Güvenlik & Performans
- [ ] Rate limiting iyileştirmeleri (modül bazlı)
- [ ] Input sanitization katmanı
- [ ] DB indexleri (sık kullanılan sorgular için)
- [ ] API response caching

### Faz 4 — İleri Özellikler
- [ ] WhatsApp entegrasyonu (bildirimler)
- [ ] Excel/CSV import/export
- [ ] Detaylı loglama & audit dashboard
- [ ] Kullanıcı yönetim paneli

### Faz 5 — Deployment & CI/CD
- [ ] GitHub Actions CI pipeline
- [ ] Otomatik test + lint + build
- [ ] Staging ortamı
- [ ] Otomatik smoke test (post-deploy)
