import { getDB } from './index.js'
import bcrypt from 'bcryptjs'

export function seedDev() {
  const db = getDB()
  const hash = bcrypt.hashSync('admin123', 10)

  // ── Kullanıcılar ────────────────────────────────────────────────────────────
  const roles = [
    ['mudur',    hash, 'campus_manager',   'Kampüs Müdürü',          null, null],
    ['vardiya',  hash, 'shift_supervisor', 'Vardiya Amiri',           'M1', 1],
    ['teknik',   hash, 'technical',        'Teknik Servis',           null, null],
    ['camasir',  hash, 'laundry',          'Çamaşırhane Görevlisi',   null, null],
    ['meydanci', hash, 'housekeeper',      'Meydancı',                'M1', 1],
  ]
  const userInsert = db.prepare(`
    INSERT OR IGNORE INTO users(username,password_hash,role,full_name,assigned_block,assigned_floor)
    VALUES(?,?,?,?,?,?)
  `)
  roles.forEach(r => userInsert.run(...r))

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

  // ── Makineler ───────────────────────────────────────────────────────────────
  const machineInsert = db.prepare(`INSERT OR IGNORE INTO machines(id,name,status) VALUES(?,?,?)`)
  machineInsert.run(1, 'Makine 1', 'idle')
  machineInsert.run(2, 'Makine 2', 'idle')
  machineInsert.run(3, 'Makine 3', 'idle')

  // ── Stok ────────────────────────────────────────────────────────────────────
  const invInsert = db.prepare(`
    INSERT OR IGNORE INTO inventory(item_name,quantity,unit,reorder_threshold,category)
    VALUES(?,?,?,?,?)
  `)
  invInsert.run('Sanayi Deterjanı', 50000, 'g', 5000, 'laundry')
  invInsert.run('Çamaşır Suyu', 20000, 'ml', 2000, 'laundry')

  // ── Temizlik Personeli ─────────────────────────────────────────────────────
  const staffInsert = db.prepare(`
    INSERT OR IGNORE INTO cleaning_staff(id,full_name,phone,assigned_block,assigned_floor)
    VALUES(?,?,?,?,?)
  `)
  staffInsert.run(1, 'Ayşe Yılmaz', '05551112233', 'M1', 1)
  staffInsert.run(2, 'Fatma Demir', '05552223344', 'M1', 2)
  staffInsert.run(3, 'Zeynep Kaya', '05553334455', 'M2', 1)

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

  // 200 Personel (100 erkek + 100 kadın)
  const maleFirstNames = ['Ahmet','Mehmet','Mustafa','Ali','Hasan','Hüseyin','İbrahim','İsmail','Osman','Yusuf',
    'Ömer','Murat','Emre','Burak','Serkan','Kemal','Tarık','Ercan','Fikret','Güven',
    'Orhan','Kadir','Selim','Bülent','Cengiz','Davut','Erdal','Faruk','Gökhan','Haluk',
    'İlhan','Kamil','Levent','Metin','Nuri','Okan','Pınar','Ramazan','Sinan','Tolga',
    'Uğur','Volkan','Yılmaz','Zafer','Adem','Bahadır','Cem','Deniz','Engin','Fatih',
    'Haydar','İrfan','Kenan','Lokman','Nadir','Oktay','Polat','Recep','Sabri','Taner',
    'Ulaş','Veysel','Yasin','Zeki','Alper','Barış','Cenk','Doğan','Erhan','Fikri',
    'Hakan','İlker','Kaan','Lütfi','Necati','Onur','Poyraz','Rıza','Soner','Tunç',
    'Ufuk','Vedat','Yiğit','Ziya','Arda','Berk','Cihan','Doruk','Ege','Furkan',
    'Harun','İsmet','Kağan','Lemi','Nihat','Olcay','Petek','Ruhi','Şahin','Tayfun']
  const femaleFirstNames = ['Ayşe','Fatma','Hatice','Zeynep','Emine','Elif','Zehra','Merve','Büşra','Esra',
    'Selin','Gülşen','Özlem','Nurcan','Serap','Hülya','Sibel','Melek','Aslı','Ceren',
    'Derya','Ebru','Filiz','Gamze','Hacer','İlknur','Kadriye','Leman','Müge','Neşe',
    'Özge','Pınar','Reyhan','Sevgi','Tülay','Ülkü','Vildan','Yasemin','Zülfikar','Açelya',
    'Bahar','Cansu','Dilek','Elvan','Feride','Gönül','Hatun','İnci','Kevser','Latife',
    'Mihrimah','Nazan','Olga','Pembe','Rabia','Selma','Tijen','Ümran','Vahide','Yıldız',
    'Zühal','Aylin','Belgin','Cemre','Duygu','Eda','Fulya','Gizem','Hazal','İrem',
    'Kübra','Leyla','Meryem','Nuray','Oya','Pervin','Rumeysa','Şule','Tuğba','Umut',
    'Vesile','Yaren','Zeynep','Alev','Buse','Ceylan','Damla','Ezgi','Figen','Gülay',
    'Hilal','İlayda','Kıymet','Lale','Nur','Nurgül','Özden','Pelin','Rana','Sevinç']
  const lastNames = ['Yılmaz','Kaya','Demir','Çelik','Şahin','Doğan','Kılıç','Arslan','Taş','Aydın',
    'Özdemir','Erdoğan','Koç','Kurt','Özkan','Yıldız','Çetin','Yıldırım','Güneş','Avcı',
    'Polat','Aktaş','Koçak','Keskin','Demirtaş','Karahan','Güler','Bulut','Kaplan','Öztürk']
  const companies = ['İnşaat A','İnşaat B','Yapı C','Servis D','Lojistik E','Temizlik F','Güvenlik G','Catering H']
  const hometowns = ['İstanbul','Ankara','İzmir','Bursa','Adana','Konya','Gaziantep','Mersin','Diyarbakır','Samsun']

  const personnelInsert = db.prepare(`
    INSERT OR IGNORE INTO personnel(tc_no,full_name,company,hometown,gender,department_id,check_in_date)
    VALUES(?,?,?,?,?,?,datetime('now','-' || ? || ' days'))
  `)
  const balanceInsert = db.prepare(`INSERT OR IGNORE INTO leave_balance(personnel_id,year,annual_total,annual_used,sick_used,emergency_used) VALUES(?,?,15,?,?,?)`)

  const personnelIds = []
  for (let i = 0; i < 200; i++) {
    const isMale = i < 100
    const gender = isMale ? 'male' : 'female'
    const firstName = isMale ? maleFirstNames[i % maleFirstNames.length] : femaleFirstNames[(i - 100) % femaleFirstNames.length]
    const lastName = lastNames[i % lastNames.length]
    const fullName = `${firstName} ${lastName}`
    const tcNo = `${10000000000 + i * 37 + 12345}`
    const company = companies[i % companies.length]
    const hometown = hometowns[i % hometowns.length]
    const deptId = (i % 8) + 1
    const daysAgo = 30 + (i % 60)
    const res = personnelInsert.run(tcNo, fullName, company, hometown, gender, deptId, daysAgo)
    if (res.changes > 0) {
      const pid = res.lastInsertRowid
      personnelIds.push({ id: pid, deptId, gender })
      const annualUsed = Math.floor(Math.random() * 5)
      const sickUsed = Math.floor(Math.random() * 3)
      const emergUsed = Math.floor(Math.random() * 2)
      balanceInsert.run(pid, 2026, annualUsed, sickUsed, emergUsed)
    }
  }

  // Haftalık vardiya çizelgesi (bu hafta için)
  const scheduleInsert = db.prepare(`INSERT OR IGNORE INTO shift_schedule(personnel_id,dept_id,shift_def_id,work_date,status) VALUES(?,?,?,?,?)`)
  const today = new Date('2026-03-15')
  const monday = new Date(today)
  monday.setDate(today.getDate() - today.getDay() + 1) // Pazartesi

  const shiftPattern = [1, 1, 2, 2, 3, 3, 1] // Pzt-Paz için vardiya türleri

  if (personnelIds.length > 0) {
    const schedTx = db.transaction(() => {
      personnelIds.forEach((p, idx) => {
        for (let day = 0; day < 7; day++) {
          const workDate = new Date(monday)
          workDate.setDate(monday.getDate() + day)
          const dateStr = workDate.toISOString().split('T')[0]
          const shiftDefId = shiftPattern[(idx + day) % 3] // Rotasyonlu vardiya
          const isWeekend = day >= 5
          const status = isWeekend && idx % 7 === 0 ? 'on_leave' : 'scheduled'
          scheduleInsert.run(p.id, p.deptId, shiftDefId, dateStr, status)
        }
      })
    })
    schedTx()
  }

  // Örnek izin talepleri - sadece ilk çalışmada ekle
  const leaveCount = db.prepare('SELECT COUNT(*) as c FROM leave_requests').get().c
  if (leaveCount === 0 && personnelIds.length >= 5) {
    const leaveInsert = db.prepare(`INSERT INTO leave_requests(personnel_id,leave_type,start_date,end_date,total_days,reason,status) VALUES(?,?,?,?,?,?,?)`)
    leaveInsert.run(personnelIds[0].id, 'annual', '2026-03-17', '2026-03-21', 5, 'Yıllık izin talebi', 'pending')
    leaveInsert.run(personnelIds[1].id, 'sick', '2026-03-15', '2026-03-16', 2, 'Hastalık raporu', 'approved')
    leaveInsert.run(personnelIds[2].id, 'emergency', '2026-03-14', '2026-03-14', 1, 'Aile ziyareti', 'approved')
    leaveInsert.run(personnelIds[3].id, 'annual', '2026-03-20', '2026-03-27', 8, 'Yaz tatili', 'pending')
    leaveInsert.run(personnelIds[4].id, 'marriage', '2026-03-22', '2026-03-25', 4, 'Evlilik izni', 'pending')
  }

  // Örnek mesai kayıtları - sadece ilk çalışmada ekle
  const otCount = db.prepare('SELECT COUNT(*) as c FROM overtime_records').get().c
  if (otCount === 0 && personnelIds.length >= 3) {
    const otInsert = db.prepare(`INSERT INTO overtime_records(personnel_id,work_date,hours,reason) VALUES(?,?,?,?)`)
    otInsert.run(personnelIds[0].id, '2026-03-14', 2.5, 'Proje teslimi')
    otInsert.run(personnelIds[1].id, '2026-03-13', 3.0, 'Ekstra güvenlik')
    otInsert.run(personnelIds[2].id, '2026-03-12', 1.5, 'Acil bakım')
  }
}
