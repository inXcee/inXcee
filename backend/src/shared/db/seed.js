import { getDB } from './index.js'
import bcrypt from 'bcryptjs'

export function seedDev() {
  const db = getDB()
  const hash = bcrypt.hashSync('admin123', 10)

  // ── Kullanıcılar ────────────────────────────────────────────────────────────
  const userInsert = db.prepare(`
    INSERT OR IGNORE INTO users(username,password_hash,role,full_name,assigned_block,assigned_floor,email)
    VALUES(?,?,?,?,?,?,?)
  `)
  const roles = [
    ['mudur',    hash, 'campus_manager',   'Kampüs Müdürü',          null, null, 'mudur@yys.local'],
    ['vardiya',  hash, 'shift_supervisor', 'Vardiya Amiri',           'M1', 1,    null],
    ['teknik',   hash, 'technical',        'Teknik Servis',           null, null, null],
    ['camasir',  hash, 'laundry',          'Çamaşırhane Görevlisi',   null, null, null],
    ['meydanci', hash, 'housekeeper',      'Meydancı',                'M1', 1,    null],
  ]
  roles.forEach(r => userInsert.run(...r))

  // ── Sistem Ayarları ────────────────────────────────────────────────────────
  const settingInsert = db.prepare(`
    INSERT OR IGNORE INTO system_settings(key, value) VALUES(?, ?)
  `)
  const defaultSettings = [
    ['email_enabled', 'false'],
    ['email_hour',    '7'],
    ['email_minute',  '0'],
    ['email_cc',      ''],
  ]
  defaultSettings.forEach(([k, v]) => settingInsert.run(k, v))

  // ── Odalar ──────────────────────────────────────────────────────────────────
  //
  //  M1, M2, M3  →  2 kat × 30 oda = 60 oda/blok
  //                  Kat 1: 101–130  |  Kat 2: 201–230
  //                  Kapasite: 6 kişilik
  //                  Tuvalet/Banyo: ORTAK (koridor uçlarında)
  //
  //  S1, S2, S3  →  2 kat × 24 oda = 48 oda/blok
  //                  Kat 1: 101–124  |  Kat 2: 201–224
  //                  Kapasite: 6 kişilik (S2 tüm odalar 4 kişilik — DB kısıtı)
  //                  Tuvalet/Banyo: HER ODADA ÖZEL
  //
  //  Tek numaralı odalar (101,103,…) = SOL TARAF
  //  Çift numaralı odalar (102,104,…) = SAĞ TARAF

  const roomInsert = db.prepare(`
    INSERT OR IGNORE INTO rooms(block,floor,room_no,capacity,active_beds,status)
    VALUES(?,?,?,?,?,?)
  `)

  const M_BLOCKS = ['M1', 'M2', 'M3']
  const S_BLOCKS = ['S1', 'S2', 'S3']

  M_BLOCKS.forEach(block => {
    for (let floor = 1; floor <= 2; floor++) {
      const base = floor === 1 ? 100 : 200
      for (let r = 1; r <= 30; r++) {
        const roomNo = String(base + r)  // 101–130 veya 201–230
        roomInsert.run(block, floor, roomNo, 6, 6, 'active')
      }
    }
  })

  S_BLOCKS.forEach(block => {
    for (let floor = 1; floor <= 2; floor++) {
      // S2 sadece 2. kat 4 kişilik, geri kalan her yer 6
      const cap = (block === 'S2' && floor === 2) ? 4 : 6
      const base = floor === 1 ? 100 : 200
      for (let r = 1; r <= 24; r++) {
        const roomNo = String(base + r)  // 101–124 veya 201–224
        roomInsert.run(block, floor, roomNo, cap, cap, 'active')
      }
    }
  })

  // ── A ve diğer bloklar ──────────────────────────────────────────────────────
  // A1, A2, A3, A4: premium bloklar — 2 kat × 20 oda
  const A_NUMBERED = ['A1', 'A2', 'A3', 'A4']
  const A_LETTERED = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'J']

  A_NUMBERED.forEach(block => {
    for (let floor = 1; floor <= 2; floor++) {
      const base = floor === 1 ? 100 : 200
      for (let r = 1; r <= 20; r++) {
        roomInsert.run(block, floor, String(base + r), 6, 6, 'active')
      }
    }
  })

  A_LETTERED.forEach(block => {
    for (let floor = 1; floor <= 2; floor++) {
      const base = floor === 1 ? 100 : 200
      for (let r = 1; r <= 20; r++) {
        roomInsert.run(block, floor, String(base + r), 6, 6, 'active')
      }
    }
  })

  // ── Makineler ───────────────────────────────────────────────────────────────
  const machineInsert = db.prepare(`INSERT OR IGNORE INTO machines(id,name,status) VALUES(?,?,?)`)
  machineInsert.run(1, 'Makine 1', 'idle')
  machineInsert.run(2, 'Makine 2', 'idle')
  machineInsert.run(3, 'Makine 3', 'idle')

  // ── Stok ────────────────────────────────────────────────────────────────────
  const invInsert = db.prepare(`
    INSERT OR IGNORE INTO inventory(item_name,quantity,unit,reorder_threshold,category,location,unit_price)
    VALUES(?,?,?,?,?,?,?)
  `)
  // Camasir
  invInsert.run('Sanayi Deterjanı', 50000, 'g', 5000, 'laundry', 'Camasirhane Depo', 0.12)
  invInsert.run('Çamaşır Suyu', 20000, 'ml', 2000, 'laundry', 'Camasirhane Depo', 0.05)
  invInsert.run('Yumuşatıcı', 15, 'litre', 3, 'laundry', 'Camasirhane Depo', 60)
  invInsert.run('Çamaşır Torbası', 200, 'adet', 50, 'laundry', 'Camasirhane Depo', 8)
  // Temizlik
  invInsert.run('Yuzey Temizleyici', 30, 'litre', 5, 'housekeeping', 'Temizlik Dolabi', 35)
  invInsert.run('Tuvalet Temizleyici', 25, 'litre', 4, 'housekeeping', 'Temizlik Dolabi', 28)
  invInsert.run('Cam Silici', 12, 'litre', 3, 'housekeeping', 'Temizlik Dolabi', 22)
  invInsert.run('Cop Torbasi', 500, 'adet', 100, 'housekeeping', 'Temizlik Dolabi', 2)
  invInsert.run('Paspas Basi', 10, 'adet', 3, 'housekeeping', 'Temizlik Dolabi', 45)
  invInsert.run('Eldiven (M)', 100, 'adet', 20, 'housekeeping', 'Temizlik Dolabi', 5)
  // Bakim
  invInsert.run('Ampul LED 9W', 50, 'adet', 10, 'maintenance', 'Teknik Depo', 15)
  invInsert.run('Musluk Contasi', 30, 'adet', 10, 'maintenance', 'Teknik Depo', 8)
  invInsert.run('Elektrik Bandı', 20, 'adet', 5, 'maintenance', 'Teknik Depo', 12)
  invInsert.run('Silikon', 8, 'adet', 2, 'maintenance', 'Teknik Depo', 35)
  invInsert.run('Priz', 15, 'adet', 5, 'maintenance', 'Teknik Depo', 18)
  // Genel
  invInsert.run('Yatak Carsafi', 300, 'adet', 50, 'general', 'Ana Depo', 75)
  invInsert.run('Yastik Kilifi', 300, 'adet', 50, 'general', 'Ana Depo', 25)
  invInsert.run('Battaniye', 150, 'adet', 20, 'general', 'Ana Depo', 120)
  invInsert.run('Havlu', 200, 'adet', 40, 'general', 'Ana Depo', 35)
  invInsert.run('Sabun', 500, 'adet', 100, 'general', 'Ana Depo', 4)

  // ── Temizlik Personeli ─────────────────────────────────────────────────────
  const cleanInsert = db.prepare(`
    INSERT OR IGNORE INTO cleaning_staff(id,full_name,phone,assigned_block,assigned_floor)
    VALUES(?,?,?,?,?)
  `)
  cleanInsert.run(1, 'Ayşe Yılmaz', '05551112233', 'M1', 1)
  cleanInsert.run(2, 'Fatma Demir', '05552223344', 'M1', 2)
  cleanInsert.run(3, 'Zeynep Kaya', '05553334455', 'M2', 1)

  // ── Teknisyenler ──────────────────────────────────────────────────────────
  const techInsert = db.prepare(`
    INSERT OR IGNORE INTO technicians(id,full_name,phone,specialty,shift)
    VALUES(?,?,?,?,?)
  `)
  techInsert.run(1, 'Mehmet Usta', '05554445566', 'elektrik', '1')
  techInsert.run(2, 'Ali Çelik', '05555556677', 'tesisat', '1')
  techInsert.run(3, 'Hasan Demir', '05556667788', 'genel', '2')
  techInsert.run(4, 'Yusuf Kara', '05557778899', 'elektrik', '2')
  techInsert.run(5, 'Emre Yıldız', '05558889900', 'genel', '3')

  // -------------------------------------------------------
  // VARDIYA YÖNETİM MODÜLİ SEED
  // -------------------------------------------------------

  // 8 Bölüm
  const deptInsert = db.prepare(`INSERT OR IGNORE INTO departments(id,name,color_class,description) VALUES(?,?,?,?)`)
  const departments = [
    [1, 'Güvenlik',     'bg-red-600',    'Kampüs güvenlik personeli'],
    [2, 'Temizlik',     'bg-green-600',  'Temizlik ve meydancı ekibi'],
    [3, 'Mutfak',       'bg-orange-500', 'Yemekhane ve mutfak personeli'],
    [4, 'İdari',        'bg-blue-600',   'İdari ve ofis personeli'],
    [5, 'Teknik',       'bg-yellow-500', 'Teknik bakım ve onarım'],
    [6, 'Bahçe',        'bg-lime-500',   'Bahçe ve çevre düzenleme'],
    [7, 'Sağlık',       'bg-pink-500',   'Sağlık ve revir hizmetleri'],
    [8, 'Çamaşırhane',  'bg-purple-600', 'Çamaşır yıkama ve dağıtım'],
  ]
  departments.forEach(d => deptInsert.run(...d))

  // 3 Vardiya Tanımı
  const shiftDefInsert = db.prepare(`INSERT OR IGNORE INTO shift_definitions(id,name,start_hour,end_hour,color_class) VALUES(?,?,?,?,?)`)
  shiftDefInsert.run(1, 'Gündüz', 8,  17, 'bg-blue-400')
  shiftDefInsert.run(2, 'Akşam',  15, 24, 'bg-orange-400')
  shiftDefInsert.run(3, 'Gece',   0,  8,  'bg-indigo-600')

  // ── KAMPÜS YÖNETİM EKİBİ (staff tablosu) ──
  const maleFirstNames = ['Ahmet','Mehmet','Mustafa','Ali','Hasan','Hüseyin','İbrahim','İsmail','Osman','Yusuf',
    'Ömer','Murat','Emre','Burak','Serkan','Kemal','Tarık','Ercan','Fikret','Güven',
    'Orhan','Kadir','Selim','Bülent','Cengiz','Davut','Erdal','Faruk','Gökhan','Haluk',
    'İlhan','Kamil','Levent','Metin','Nuri','Okan','Ramazan','Sinan','Tolga','Uğur',
    'Volkan','Yılmaz','Zafer','Adem','Bahadır','Cem','Deniz','Engin','Fatih','Haydar']
  const femaleFirstNames = ['Ayşe','Fatma','Hatice','Zeynep','Emine','Elif','Zehra','Merve','Büşra','Esra',
    'Selin','Gülşen','Özlem','Nurcan','Serap','Hülya','Sibel','Melek','Aslı','Ceren',
    'Derya','Ebru','Filiz','Gamze','Hacer','İlknur','Kadriye','Leman','Müge','Neşe',
    'Özge','Pınar','Reyhan','Sevgi','Tülay','Ülkü','Vildan','Yasemin','Açelya','Bahar',
    'Cansu','Dilek','Elvan','Feride','Gönül','İnci','Kevser','Latife','Nazan','Selma']
  const lastNames = ['Yılmaz','Kaya','Demir','Çelik','Şahin','Doğan','Kılıç','Arslan','Taş','Aydın',
    'Özdemir','Erdoğan','Koç','Kurt','Özkan','Yıldız','Çetin','Yıldırım','Güneş','Avcı',
    'Polat','Aktaş','Koçak','Keskin','Demirtaş','Karahan','Güler','Bulut','Kaplan','Öztürk']
  const positions = [
    'Güvenlik Görevlisi','Güvenlik Amiri','Temizlik Görevlisi','Temizlik Şefi',
    'Aşçı','Aşçıbaşı','Garson','Mutfak Yardımcısı',
    'İdari Personel','Sekreter','Muhasebeci','İK Uzmanı',
    'Elektrikçi','Tesisatçı','Klimacı','Boyacı','Genel Bakım',
    'Bahçıvan','Peyzaj Uzmanı',
    'Hemşire','Sağlık Memuru',
    'Çamaşırhane Görevlisi','Ütücü','Çamaşırhane Şefi'
  ]
  const bloodTypes = ['A+','A-','B+','B-','AB+','AB-','0+','0-']
  const cities = ['İstanbul','Ankara','İzmir','Bursa','Adana','Konya','Gaziantep','Mersin','Diyarbakır','Samsun',
    'Trabzon','Kayseri','Eskişehir','Antalya','Malatya']

  const staffInsert = db.prepare(`
    INSERT OR IGNORE INTO staff(tc_no,full_name,phone,email,position,department_id,hire_date,birth_date,address,
      emergency_contact,emergency_phone,blood_type,gender,salary,notes,is_active)
    VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,1)
  `)
  const balanceInsert = db.prepare(`INSERT OR IGNORE INTO leave_balance(staff_id,year,annual_total,annual_used,sick_used,emergency_used) VALUES(?,?,15,?,?,?)`)

  const staffIds = []
  for (let i = 0; i < 120; i++) {
    const isMale = i < 60
    const gender = isMale ? 'male' : 'female'
    const firstName = isMale ? maleFirstNames[i % maleFirstNames.length] : femaleFirstNames[(i - 60) % femaleFirstNames.length]
    const lastName = lastNames[i % lastNames.length]
    const fullName = `${firstName} ${lastName}`
    const tcNo = `${20000000000 + i * 41 + 56789}`
    const phone = `05${300 + (i % 50)}${String(1000000 + i * 73).slice(0, 7)}`
    const email = `${firstName.toLowerCase().replace(/[İıÖöÜüŞşÇçĞğ]/g, c => ({İ:'i',ı:'i',Ö:'o',ö:'o',Ü:'u',ü:'u',Ş:'s',ş:'s',Ç:'c',ç:'c',Ğ:'g',ğ:'g'}[c]||c))}.${lastName.toLowerCase().replace(/[İıÖöÜüŞşÇçĞğ]/g, c => ({İ:'i',ı:'i',Ö:'o',ö:'o',Ü:'u',ü:'u',Ş:'s',ş:'s',Ç:'c',ç:'c',Ğ:'g',ğ:'g'}[c]||c))}@kampus.com`
    const deptId = (i % 8) + 1
    const position = positions[i % positions.length]
    const hireYear = 2020 + (i % 6)
    const hireMonth = String((i % 12) + 1).padStart(2, '0')
    const hireDate = `${hireYear}-${hireMonth}-${String((i % 28) + 1).padStart(2, '0')}`
    const birthYear = 1975 + (i % 25)
    const birthMonth = String((i % 12) + 1).padStart(2, '0')
    const birthDate = `${birthYear}-${birthMonth}-${String((i % 28) + 1).padStart(2, '0')}`
    const address = `${cities[i % cities.length]}, ${['Merkez','Yenişehir','Çankaya','Nilüfer','Seyhan','Selçuklu'][i % 6]} Mah. ${i + 1}. Sok. No:${(i % 50) + 1}`
    const emergencyContact = `${isMale ? femaleFirstNames[i % femaleFirstNames.length] : maleFirstNames[i % maleFirstNames.length]} ${lastNames[(i + 5) % lastNames.length]}`
    const emergencyPhone = `05${400 + (i % 50)}${String(2000000 + i * 91).slice(0, 7)}`
    const bloodType = bloodTypes[i % bloodTypes.length]
    const salary = 15000 + (i % 8) * 2500 + Math.floor(i / 8) * 500
    const notes = i % 5 === 0 ? 'Deneyimli personel' : null

    const res = staffInsert.run(tcNo, fullName, phone, email, position, deptId, hireDate, birthDate, address,
      emergencyContact, emergencyPhone, bloodType, gender, salary, notes)
    if (res.changes > 0) {
      const sid = Number(res.lastInsertRowid)
      staffIds.push({ id: sid, deptId, gender })
      const annualUsed = Math.floor(Math.random() * 5)
      const sickUsed = Math.floor(Math.random() * 3)
      const emergUsed = Math.floor(Math.random() * 2)
      balanceInsert.run(sid, 2026, annualUsed, sickUsed, emergUsed)
    }
  }

  // Haftalık vardiya çizelgesi (bu hafta + geçen hafta)
  const scheduleInsert = db.prepare(`INSERT OR IGNORE INTO shift_schedule(staff_id,dept_id,shift_def_id,work_date,status) VALUES(?,?,?,?,?)`)
  const today = new Date()
  const d = (offset) => {
    const dt = new Date(today)
    dt.setDate(today.getDate() + offset)
    return dt.toISOString().split('T')[0]
  }
  const monday = new Date(today)
  monday.setDate(today.getDate() - today.getDay() + 1)

  if (staffIds.length > 0) {
    const schedTx = db.transaction(() => {
      // Bu hafta + geçen hafta (14 gün)
      for (let weekOffset = -1; weekOffset <= 0; weekOffset++) {
        staffIds.forEach((s, idx) => {
          for (let day = 0; day < 7; day++) {
            const workDate = new Date(monday)
            workDate.setDate(monday.getDate() + weekOffset * 7 + day)
            const dateStr = workDate.toISOString().split('T')[0]
            const shiftDefId = ((idx + day) % 3) + 1
            const isWeekend = day >= 5
            let status = 'scheduled'
            if (weekOffset === -1) status = idx % 5 === 0 ? 'on_leave' : 'worked'
            else if (isWeekend && idx % 7 === 0) status = 'on_leave'
            scheduleInsert.run(s.id, s.deptId, shiftDefId, dateStr, status)
          }
        })
      }
    })
    schedTx()
  }

  // Örnek izin talepleri
  const leaveCount = db.prepare('SELECT COUNT(*) as c FROM leave_requests').get().c
  if (leaveCount === 0 && staffIds.length >= 10) {
    const leaveInsert = db.prepare(`INSERT INTO leave_requests(staff_id,leave_type,start_date,end_date,total_days,reason,status) VALUES(?,?,?,?,?,?,?)`)
    leaveInsert.run(staffIds[0].id, 'annual', d(1),   d(5),   5, 'Yıllık izin talebi', 'pending')
    leaveInsert.run(staffIds[1].id, 'sick',   d(-2),  d(-1),  2, 'Hastalık raporu', 'approved')
    leaveInsert.run(staffIds[2].id, 'emergency', d(-3), d(-3), 1, 'Aile acil durumu', 'approved')
    leaveInsert.run(staffIds[3].id, 'annual', d(3),   d(10),  8, 'Yaz tatili', 'pending')
    leaveInsert.run(staffIds[4].id, 'marriage', d(6), d(9),   4, 'Evlilik izni', 'pending')
    leaveInsert.run(staffIds[5].id, 'paternity', d(0), d(4),  5, 'Babalık izni', 'approved')
    leaveInsert.run(staffIds[6].id, 'sick',   d(-4),  d(-2),  3, 'Grip', 'approved')
    leaveInsert.run(staffIds[7].id, 'bereavement', d(-7), d(-5), 3, 'Vefat izni', 'approved')
    leaveInsert.run(staffIds[8].id, 'annual', d(17),  d(21),  5, 'Bayram tatili uzatma', 'pending')
    leaveInsert.run(staffIds[9].id, 'emergency', d(-1), d(-1), 1, 'Kişisel acil', 'rejected')
  }

  // Örnek mesai kayıtları
  const otCount = db.prepare('SELECT COUNT(*) as c FROM overtime_records').get().c
  if (otCount === 0 && staffIds.length >= 8) {
    const otInsert = db.prepare(`INSERT INTO overtime_records(staff_id,work_date,hours,reason) VALUES(?,?,?,?)`)
    otInsert.run(staffIds[0].id, d(-3), 2.5, 'Proje teslimi')
    otInsert.run(staffIds[1].id, d(-4), 3.0, 'Ekstra güvenlik nöbeti')
    otInsert.run(staffIds[2].id, d(-5), 1.5, 'Acil bakım onarım')
    otInsert.run(staffIds[3].id, d(-2), 4.0, 'Etkinlik hazırlığı')
    otInsert.run(staffIds[4].id, d(-3), 2.0, 'Temizlik operasyonu')
    otInsert.run(staffIds[5].id, d(-1), 3.5, 'Gece nöbeti uzatma')
    otInsert.run(staffIds[6].id, d(-6), 2.0, 'Hafta sonu çalışma')
    otInsert.run(staffIds[7].id, d(-7), 1.0, 'Yemekhane hazırlık')
  }

  // ── Test personeli (kiosk testleri için id=1 gerekli) ──────────────────────
  try {
    db.prepare(`
      INSERT OR IGNORE INTO personnel(id,full_name,company,hometown,check_in_date,discipline_points,expected_departure)
      VALUES(1,'Test Personeli','Test Şirketi','Ankara','2024-01-01',0,NULL)
    `).run()
  } catch(e) { /* ignore if already exists */ }
}
