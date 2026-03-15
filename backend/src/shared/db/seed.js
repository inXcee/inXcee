import { getDB } from './index.js'
import bcrypt from 'bcryptjs'

export function seedDev() {
  const db = getDB()
  const hash = bcrypt.hashSync('admin123', 10)

  const roles = [
    ['mudur', hash, 'campus_manager', 'Kampüs Müdürü', null, null],
    ['vardiya', hash, 'shift_supervisor', 'Vardiya Amiri', 'M1', 1],
    ['teknik', hash, 'technical', 'Teknik Servis', null, null],
    ['camasir', hash, 'laundry', 'Çamaşırhane Görevlisi', null, null],
    ['meydanci', hash, 'housekeeper', 'Meydancı', 'M1', 1],
  ]

  const insert = db.prepare(`
    INSERT OR IGNORE INTO users(username,password_hash,role,full_name,assigned_block,assigned_floor)
    VALUES(?,?,?,?,?,?)
  `)
  roles.forEach(r => insert.run(...r))

  // Örnek odalar
  const blocks = ['M1','M2','S1','S2','S3']
  const roomInsert = db.prepare(`
    INSERT OR IGNORE INTO rooms(block,floor,room_no,capacity,active_beds,status)
    VALUES(?,?,?,?,?,?)
  `)
  blocks.forEach(block => {
    const cap = block === 'S2' ? 4 : 6
    for (let floor = 1; floor <= 3; floor++) {
      for (let r = 1; r <= 10; r++) {
        const roomNo = `${floor}0${r}`
        roomInsert.run(block, floor, roomNo, cap, cap, 'active')
      }
    }
  })

  // Örnek makineler
  const machineInsert = db.prepare(`INSERT OR IGNORE INTO machines(id,name,status) VALUES(?,?,?)`)
  machineInsert.run(1, 'Makine 1', 'idle')
  machineInsert.run(2, 'Makine 2', 'idle')
  machineInsert.run(3, 'Makine 3', 'idle')

  // Deterjan stok
  const invInsert = db.prepare(`INSERT OR IGNORE INTO inventory(item_name,quantity,unit,reorder_threshold,category) VALUES(?,?,?,?,?)`)
  invInsert.run('Sanayi Deterjanı', 50000, 'g', 5000, 'laundry')
  invInsert.run('Çamaşır Suyu', 20000, 'ml', 2000, 'laundry')
}
