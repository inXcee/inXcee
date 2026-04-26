// Modül başlıklarındaki ? butonu için yardım metinleri
// Yeni bir modül eklerken buraya da entry ekleyin.

export const HELP_CONTENT = {
  dashboard: `Anlık doluluk, açık talepler, çamaşır durumu özeti.
• Üst sayaclar canlı (30sn auto-refresh)
• "Bugünkü olaylar" panelinden hızlı navigasyon
• Sağ üst zil bildirimleri sistem genelinde gösterir`,

  checkin: `Yeni personel kaydı + oda atama.
• TC/Pasaport zorunlu (en az biri)
• Karantina ve dolu odalar otomatik gizlenir
• Tekrar girişlerde mevcut kayıt güncellenir
• Cinsiyet/firma bazlı oda eşleştirme önerilir`,

  capacity: `Tüm bloklar + odalar grid görünümü.
• Yeşil: müsait, sarı: kısmi, kırmızı: dolu
• Karantina: ⚠ rozeti, atama bloke
• Tile'a tıklayarak içindeki kişileri gör
• Sağ panelden manuel oda durumu değiştir`,

  housekeeping: `Günlük temizlik görev tahsisi.
• Sabah otomatik görev oluşturma cron'u (05:50)
• Personel her oda için 4 aşama: bekliyor/temizleniyor/onayda/tamam
• Mobil: meydancı kendi telefonundan tamamlar
• DnD listesi → o gün temizlik yapılmaz`,

  maintenance: `Arıza talep takibi + atama.
• 4 öncelik: kritik / yüksek / orta / düşük
• SLA deadline otomatik (kritik 4s, yüksek 24s, vs.)
• Teknisyene ata → mobilden çözüm akışı
• Önce/sonra fotoğraf zorunluluğu konfigüre`,

  discipline: `Disiplin kart sistemi (sarı/kırmızı/açıklama).
• Otomatik puan: sarı +5, kırmızı +15, açıklama +1
• 30g'da 3 sarı → otomatik kırmızı (yakında)
• Tekrarlanan sebep filtresi
• Kişi profili → toplam puan + geçmiş`,

  laundry: `Çamaşır kanban (intake/yıkama/kurutma/ütü/raf/teslim).
• Drag-drop ile aşama değiştir
• SLA: her aşama için süre limiti, aşılırsa kırmızı
• "Premium" garment: barkodlu kişiye özel takip
• Ütü Kuyruğu sekmesi: bekleyen + acil parçalar`,

  inventory: `Stok takibi (girdi/çıktı/eşik uyarısı).
• Eşik altına düşünce dashboard'da kırmızı badge
• Kategori bazlı filtre + arama
• Stok hareketleri loglanır (kim/ne zaman)`,

  shifts: `Vardiya planlama + puantaj.
• Drag-drop atama (gündüz/gece/dinlenme)
• Resmi tatil 2x ücret hesaplama
• Aylık özet PDF/Excel export
• Personel çakışma uyarısı`,

  checkout: `Çıkış işlemi: kişi → veda + oda boşaltma.
• Zimmet kontrol listesi (anahtar, kart vs.)
• Hasar formu varsa kayıt
• Çıkış ibra dijital imza`,

  reports: `Yönetici raporları PDF/Excel.
• Doluluk, SLA performansı, çamaşır volume
• Tarih aralığı + blok filtresi
• "Özelleştirilebilir" rapor (yakında)`,

  users: `Sistem kullanıcısı yönetimi (5 rol).
• campus_manager: tam yetki
• shift_supervisor: kendi blok/kat yetkisi
• housekeeper/laundry/technical: mobil erişim
• PIN: kiosk + mobil giriş için 4 hane`,

  audit: `Tüm sistem işlemleri logu.
• Kim, ne yaptı, ne zaman, hangi kayıt
• Modül + işlem filtresi
• 90 gün sonra otomatik temizlenir`,

  'error-log': `Frontend + backend uygulama hataları.
• 60sn cooldown (aynı hata tekrar gelmez)
• 30 gün sonra otomatik temizlenir
• Detay açıp stack trace + context görebilir`,

  backup: `Veritabanı yedek yönetimi.
• Otomatik: gece 03:00, 7 gün saklama
• Manuel "Şimdi Yedekle" → anlık snapshot
• Restore: yüklenen dosya önce mevcut DB'yi yedekler
• Sunucu restore sonrası yeniden başlar (PM2)`,

  kvkk: `KVKK aydınlatma metni + kişi veri export.
• /kvkk public sayfası login öncesi de görünür
• Kişi veri export: JSON dump (KVKK m.11)
• Aydınlatma metni admin tarafından düzenlenebilir`,

  system: `Sistem sağlığı: server, DB, yedek, hata, depolama.
• Otomatik 30sn refresh
• Heap memory + uptime + node version
• Yedek yoksa kart sarı uyarı
• Son 24s hata sayısı`,
}
