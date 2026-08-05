-- FPU ve Kamp Alanı imza listelerinin kadroya aktarımı (2026-08-04).
--
-- Kullanıcının verdiği iki haftalık imza listesi 179 isim içeriyor ve listeler
-- ayrık. 164 isim sistemdeki kayıtla birebir tuttu, 9'u yazım farkıydı, 6 kişi
-- sistemde yoktu.
--
-- Yazım farkı olan 9 isim burada HEDEF kaydın adıyla yazılıdır (ör. listedeki
-- "ALİ RIZA ÇOLBAN" → kayıttaki "ALİ RIZA ÇORBAN"). Bu 9 eşleşme tahmin değil:
--   1) dokuzunun da hedefi 24-31 vardiyası olan aktif çalışan,
--   2) hedef adların HİÇBİRİ listelerde ayrıca geçmiyor.
-- Listeler o projelerin tam kadrosu olduğuna göre, ayrı kişi olsalardı
-- kendileri de listede yer alırdı. Tam liste ve gerekçe: commit mesajı.
--
-- "Sistemde yok" sayılan 6 isimden biri (SILA ÖNER) aslında PASİF kayıt olarak
-- duruyordu; eşleştirme yalnız aktifleri tarıyor. Bu yüzden her yeni isim önce
-- UPDATE edilir, yoksa INSERT edilir. is_active'e BİLEREK dokunulmuyor: project_id
-- bir kadro etiketidir, işe giriş/çıkış kararı değil. Listede olup pasif görünen
-- personel ekranda "kadroda ama pasif" olarak kullanıcıya bildirilir.
--
-- Tek seferlik ÜRETİM aktarımıdır: yeni kişi açan satırlar, bu kadronun gerçekten
-- bulunduğu veritabanında çalışır (kontrol: 'ARZU DOĞAN' kaydı var mı). Temiz
-- kurulumda ve testte migration tamamen no-op'tur.
--
-- Kadrosu bu listelerde geçmeyen personele DOKUNULMAZ: project_id NULL kalır
-- ve ekranda "kadrosu belirsiz" olarak görünür. Silme veya pasifleştirme yok.

-- FPU: 66 birebir + 4 yazim farki = 70 mevcut kayit
UPDATE staff SET project_id=(SELECT id FROM projects WHERE code='FPU')
WHERE full_name IN (
  'ARZU DOĞAN',
  'AYGÜN EKREN',
  'AYLA TÜRKİLİ',
  'AYTEN KIZILBAĞ',
  'BARIŞ DÜZLÜ',
  'BEDİA KORUM',
  'BERKAY DUMAN',
  'Berkay ince',
  'BİRSEN YILMAZ',
  'CANSU KUYUCU',
  'CEYDA TOPLUTEPE',
  'DÖNDÜ YOL',
  'DİLEK ALSAN',
  'EBRU DUYAN',
  'EDA KARAKAŞ',
  'ELNARE YÜCEL',
  'ELVAN ÇALIK',
  'ELİF DÜZLÜ',
  'ELİF GÖKTAŞ',
  'ELİF SOYLU',
  'ELİF ÜNLÜTÜRK',
  'EMİNE ÇAĞLAYAN',
  'EMİRHAN OKAY',
  'ESİN KIYAK',
  'FADİME BACAK',
  'FATMA DİNDAR',
  'FUNDA DURCAN',
  'FURKAN SEFERCİK',
  'GÖZDE ÖZDEMİR',
  'GÜLAY MENTEŞE',
  'GÜLFER ORUÇ',
  'GİZEM ERMİŞ',
  'HAMİDE AKSAN',
  'HAVVA DEMİRCİ',
  'HAYRİYE DURMUŞOĞLU',
  'HAYRİYE KANAL',
  'HAYRİYE YILDIRIM',
  'MERTCAN KAYAN',
  'MEVLÜDE DEMİR',
  'MEVLÜT DİRLİK',
  'NAFİYE KARA',
  'NERİMAN YILDIRIM',
  'NESLİHAN AKSOY',
  'NURDAN BURUŞ',
  'NURŞEN GÜNEŞ',
  'NİLGÜN ÖZKÜTÜK',
  'NİLÜFER ERTOP',
  'NİLÜFER ÜLKERİ',
  'ONAT ALAGÖZ',
  'SATİYE EREN',
  'SEMRA KANAL',
  'SEMİH GÜNEŞ',
  'SERKAN ÖZCAN',
  'SEVİLAY ECEK',
  'SEVİM KAYIKÇI',
  'SEYHAN KUKUŞ',
  'SÜHEYLA SEFERCİK',
  'SÜMEYRA AKMAN',
  'TUĞBA ÇIRPAN',
  'Umutcan Durcan',
  'YETER ÇELEN',
  'YEŞİM USLU',
  'YONCA KORUM',
  'ZELİHA PARLAK',
  'ÖZAY KIRNAPÇI',
  'ŞANER TUZCUOĞLU',
  'EBRU ALADEMİR DEMİRALAY',
  'YASİN CAN BAYRAK',
  'ALİ RIZA ÇORBAN',
  'BİRGÜL KINACI'
);

-- FPU: listede olup sistemde bulunmayan 2 kisi
UPDATE staff SET project_id=(SELECT id FROM projects WHERE code='FPU')
  WHERE full_name='AYTAÇ ERTOP';
INSERT INTO staff(full_name, is_active, project_id)
  SELECT 'AYTAÇ ERTOP', 1, (SELECT id FROM projects WHERE code='FPU')
  WHERE NOT EXISTS (SELECT 1 FROM staff WHERE full_name='AYTAÇ ERTOP')
    AND EXISTS (SELECT 1 FROM staff WHERE full_name='ARZU DOĞAN');
UPDATE staff SET project_id=(SELECT id FROM projects WHERE code='FPU')
  WHERE full_name='GÜLFER ŞİMŞEK DEMİRCAN';
INSERT INTO staff(full_name, is_active, project_id)
  SELECT 'GÜLFER ŞİMŞEK DEMİRCAN', 1, (SELECT id FROM projects WHERE code='FPU')
  WHERE NOT EXISTS (SELECT 1 FROM staff WHERE full_name='GÜLFER ŞİMŞEK DEMİRCAN')
    AND EXISTS (SELECT 1 FROM staff WHERE full_name='ARZU DOĞAN');

-- KAMP: 98 birebir + 5 yazim farki = 103 mevcut kayit
UPDATE staff SET project_id=(SELECT id FROM projects WHERE code='KAMP')
WHERE full_name IN (
  'AKIN AKTAŞ',
  'ALEYNA ÖZDEMİR',
  'ARDA KARAGÖL',
  'AYGÜL ÖTGÜÇ',
  'AYHAN AKSOY',
  'AYŞE YAĞLI',
  'AYŞENUR KAPSUK',
  'BETÜL ACAR',
  'BUKET YAVUZ',
  'BURHAN EROL',
  'BURHAN IŞIK',
  'BURHAN TURPÇU',
  'BİRCAN PINAR',
  'CEM ATLI',
  'CEREN ŞEKERCİ',
  'CİHAN AY',
  'DAMLA KURT',
  'DERYA AKER',
  'DURCAN ÇELEN',
  'DÖNDÜ ARSLAN',
  'ELA IŞIK',
  'ELVAN ÇAKIR',
  'ELİF TAŞKIN',
  'EMEL ERTÜRK',
  'EMRAH KAYMAKYEMEZ',
  'EMİNE ACAR',
  'ERCAN EROL',
  'EREN BAYSAN',
  'ESİN AY',
  'EZGİ ÖZKAN',
  'FATİH KARA',
  'FERDA ARAT',
  'GAMZE IŞIK',
  'GÖKSU SEFERCİK',
  'GÖZDE AKIN',
  'GÜL KAHRAMAN',
  'GÜLER YENER',
  'GÜLSÜM MUTLU',
  'GÜLSÜM UÇAR',
  'GULSÜM ÇAKIR',
  'GİZEM SOFUOĞLU',
  'HABİBE KABAKÇI',
  'HAKAN ERKEK',
  'HATİCE ÇELİK',
  'HAYRİYE PARLAK',
  'KADRİYE KEÇEÇİ',
  'KADİR CAN YENER',
  'KÜBRA KAHRAMAN',
  'KIBRA KAHRAMAN',
  'LEVENT BAYRAKTAR',
  'MEHMET KOCAER',
  'MELİH ERTÜRK',
  'MELİKE AKÇA',
  'MELİKE CİNMANTARCI',
  'MERTCAN BEKMEZCİOĞLU',
  'MERYEM BURUŞ',
  'MUSA BALCI',
  'MUSTAFA BAĞIŞ',
  'MÜZEYYEN GÖKÇE',
  'NALAN AKSU',
  'NAZAN MANGAL',
  'NECLA TOKGÖZ',
  'NESRİN MUZAFFER',
  'NESİL AYDIN',
  'NİLAY ARSLAN',
  'ONUR TOPLUCUK',
  'OZAN KÖSE',
  'RUŞAN ÇELİK',
  'SEFA KAYABAŞLI',
  'SEHER ÖZKAYA',
  'SELAHATTİN ERBAY',
  'SEVCAN YILMAZ KÖKTÜRK',
  'SEVİL BİLLUR',
  'SEÇİL BASANÇELEBİ',
  'TOLGA SAYAR',
  'TUNAY BEKTAŞ',
  'TURAN ERTÜRK',
  'TÜRKAN DEMİRKURT',
  'YASİN CAN SÖYLER',
  'YAŞAR YILMAZ',
  'YELİZ KURT',
  'ZEHRA DURSUN',
  'ZELİHA KAYIKÇI',
  'ÇİĞDEM BOZKUŞ',
  'ÇİĞDEM DEMİRCİ',
  'ÇİĞDEM KARTAL',
  'ÖNER KABUK',
  'ÖZGE TAŞKIRAN',
  'ÖZLEM ŞAHİN',
  'ÖZTEKİN ÖZTÜRK',
  'ÜMRAN KURT',
  'ÜNSAL TOPRAK',
  'İBRAHİM ÜNLÜ',
  'ŞENGÜL CEBECİ',
  'ŞENNUR KÜTÜKÇÜ',
  'ŞENNUR YATKIN',
  'ŞENOL ORHAN',
  'ŞİFA HATUN KUYULU',
  'MUHAMMED BUDAK',
  'GAMZE ÇELİKLİ',
  'BERNA ARSLAN',
  'KEMAL ÇİFÇİ',
  'BAHAR AKTAŞ'
);

-- KAMP: listede olup sistemde bulunmayan 4 kisi
UPDATE staff SET project_id=(SELECT id FROM projects WHERE code='KAMP')
  WHERE full_name='FEYYAZ GÜNER';
INSERT INTO staff(full_name, is_active, project_id)
  SELECT 'FEYYAZ GÜNER', 1, (SELECT id FROM projects WHERE code='KAMP')
  WHERE NOT EXISTS (SELECT 1 FROM staff WHERE full_name='FEYYAZ GÜNER')
    AND EXISTS (SELECT 1 FROM staff WHERE full_name='ARZU DOĞAN');
UPDATE staff SET project_id=(SELECT id FROM projects WHERE code='KAMP')
  WHERE full_name='SILA ÖNER';
INSERT INTO staff(full_name, is_active, project_id)
  SELECT 'SILA ÖNER', 1, (SELECT id FROM projects WHERE code='KAMP')
  WHERE NOT EXISTS (SELECT 1 FROM staff WHERE full_name='SILA ÖNER')
    AND EXISTS (SELECT 1 FROM staff WHERE full_name='ARZU DOĞAN');
UPDATE staff SET project_id=(SELECT id FROM projects WHERE code='KAMP')
  WHERE full_name='SİNEM KAÇAR';
INSERT INTO staff(full_name, is_active, project_id)
  SELECT 'SİNEM KAÇAR', 1, (SELECT id FROM projects WHERE code='KAMP')
  WHERE NOT EXISTS (SELECT 1 FROM staff WHERE full_name='SİNEM KAÇAR')
    AND EXISTS (SELECT 1 FROM staff WHERE full_name='ARZU DOĞAN');
UPDATE staff SET project_id=(SELECT id FROM projects WHERE code='KAMP')
  WHERE full_name='İSMAİL SERCAN SUCU';
INSERT INTO staff(full_name, is_active, project_id)
  SELECT 'İSMAİL SERCAN SUCU', 1, (SELECT id FROM projects WHERE code='KAMP')
  WHERE NOT EXISTS (SELECT 1 FROM staff WHERE full_name='İSMAİL SERCAN SUCU')
    AND EXISTS (SELECT 1 FROM staff WHERE full_name='ARZU DOĞAN');
