import { beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { initDB, getDB } from '../../shared/db/index.js'
import { seedDev } from '../../shared/db/seed.js'
import { insertItemQuery, listItemsQuery, getItemQuery, getRoomLaundryHistoryQuery } from './queries.js'

let roomId, block, roomNo

beforeAll(() => {
  process.env.DB_PATH = ':memory:'
  initDB()
  seedDev()
  const room = getDB().prepare("SELECT id, block, room_no FROM rooms WHERE block='M1' LIMIT 1").get()
  roomId = room.id; block = room.block; roomNo = room.room_no
})

beforeEach(() => {
  const db = getDB()
  db.prepare('DELETE FROM laundry_items').run()
  db.prepare('DELETE FROM room_assignments WHERE room_id=?').run(roomId)
})

// Odaya birden çok aktif sakin yerleştirir — M/S bloklarda kapasite 6, bu normal.
function fillRoom(count) {
  const db = getDB()
  const addPerson = db.prepare(
    "INSERT INTO personnel(full_name, phone_number) VALUES(?, ?)"
  )
  const assign = db.prepare(
    'INSERT INTO room_assignments(room_id, personnel_id, bed_no) VALUES(?,?,?)'
  )
  const people = []
  for (let index = 0; index < count; index++) {
    const id = addPerson.run(`Sakin ${index + 1}`, `0555000000${index}`).lastInsertRowid
    assign.run(roomId, id, index + 1)
    people.push({ id })
  }
  return people
}

describe('oda sakini join tekrarı', () => {
  it('odada 6 kişi varken torba listede BİR kez görünür', () => {
    fillRoom(6)
    insertItemQuery({ room_id: roomId, item_count: 2 })

    const rows = listItemsQuery({ status: 'dirty' })
    expect(rows).toHaveLength(1)
  })

  it('tek sakinli odada davranış değişmez ve isim gelir', () => {
    const [person] = fillRoom(1)
    const id = insertItemQuery({ room_id: roomId, item_count: 1 })

    const rows = listItemsQuery({ status: 'dirty' })
    expect(rows).toHaveLength(1)
    const expected = getDB().prepare('SELECT full_name FROM personnel WHERE id=?').get(person.id).full_name
    expect(rows[0].occupant_name).toBe(expected)
    expect(getItemQuery(id).occupant_name).toBe(expected)
  })

  it('sakini olmayan odada torba yine tek satır, isim boş', () => {
    const id = insertItemQuery({ room_id: roomId, item_count: 1 })
    const rows = listItemsQuery({ status: 'dirty' })
    expect(rows).toHaveLength(1)
    expect(rows[0].occupant_name).toBe(null)
    expect(getItemQuery(id).occupant_name).toBe(null)
  })

  it('oda geçmişi de tekrar etmez', () => {
    fillRoom(6)
    const id = insertItemQuery({ room_id: roomId, item_count: 1, intake_name: 'Ali Veli' })
    getDB().prepare("UPDATE laundry_items SET status='delivered' WHERE id=?").run(id)

    const history = getRoomLaundryHistoryQuery(block, roomNo)
    expect(history.filter(row => row.id === id)).toHaveLength(1)
  })

  it('telefon override sakin telefonunun önüne geçer', () => {
    fillRoom(3)
    const id = insertItemQuery({ room_id: roomId, item_count: 1, phone_override: '05550000000' })
    expect(getItemQuery(id).phone_number).toBe('05550000000')
  })
})
