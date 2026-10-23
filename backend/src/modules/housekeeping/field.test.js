import { beforeAll, describe, expect, it } from 'vitest'
import { getDB, initDB } from '../../shared/db/index.js'
import { seedDev } from '../../shared/db/seed.js'
import { boardBlocks, boardRooms } from './field.js'

// Saha ekranı oda panosu (spec: docs/superpowers/specs/2026-10-23-saha-ekrani-design.md).
// FX: M tipi olmayan deneme bloğu — odalar sırasız eklenir ki sıralama sınansın.
let db, today, yesterday, workerId, otherWorkerId

beforeAll(() => {
  process.env.DB_PATH = ':memory:'
  initDB()
  seedDev()
  db = getDB()
  today = db.prepare("SELECT date('now','localtime') d").get().d
  yesterday = db.prepare("SELECT date('now','localtime','-1 day') d").get().d
  const room = db.prepare(`INSERT INTO rooms(block, floor, room_no, capacity, active_beds, use_state) VALUES('FX', ?, ?, 6, 6, ?)`)
  room.run(1, '102', 'open')
  room.run(1, '101', 'open')
  room.run(1, '103', 'closed')
  room.run(2, '201', 'open')
  workerId = db.prepare(`INSERT INTO staff(full_name, is_active) VALUES('Saha Test', 1)`).run().lastInsertRowid
  otherWorkerId = db.prepare(`INSERT INTO staff(full_name, is_active) VALUES('Diğer Kişi', 1)`).run().lastInsertRowid
  const task = db.prepare(`INSERT INTO cleaning_tasks(area, block, floor, task_type, scheduled_at, qr_location, completed_at,
    completed_by_worker_id, field_worker_id, origin) VALUES(?, 'FX', ?, 'room', ?, ?, ?, ?, ?, 'field')`)
  task.run('FX Oda 101', 1, `${today} 08:00:00`, 'FX-101', `${today} 06:15:00`, workerId, workerId)
  task.run('FX Oda 102', 1, `${yesterday} 08:00:00`, 'FX-102', `${yesterday} 07:30:00`, workerId, workerId)
})

const floorOf = (board, n) => board.floors.find(f => f.floor === n)

describe('boardRooms', () => {
  it('odaları kat ve oda numarası sırasıyla, işaretsizi status:null döner; kapalı oda kapalı gelir', () => {
    const board = boardRooms('FX')
    expect(board.block).toBe('FX')
    expect(board.date).toBe(today)
    expect(board.floors.map(f => f.floor)).toEqual([1, 2])
    const rooms = floorOf(board, 1).rooms
    expect(rooms.map(r => r.room_no)).toEqual(['101', '102', '103'])
    expect(rooms.find(r => r.room_no === '103')).toMatchObject({ location: 'FX-103', use_state: 'closed', status: null })
  })

  it('bugün temizlenen oda cleaned + temizleyenin adı; mine yalnız aynı personelde true', () => {
    const mine = floorOf(boardRooms('FX', { workerId }), 1).rooms.find(r => r.room_no === '101')
    expect(mine).toMatchObject({ location: 'FX-101', status: 'cleaned', at: `${today} 06:15:00`, by: 'Saha Test', mine: true })
    const theirs = floorOf(boardRooms('FX', { workerId: otherWorkerId }), 1).rooms.find(r => r.room_no === '101')
    expect(theirs.mine).toBe(false)
  })

  it('dünkü temizlik bugünün durumu değil, son temizlik olarak gelir', () => {
    const room = floorOf(boardRooms('FX'), 1).rooms.find(r => r.room_no === '102')
    expect(room.status).toBeNull()
    expect(room.last_cleaned_at).toBe(`${yesterday} 07:30:00`)
  })

  it('M bloğunda her katın başında 4 ortak alan, M olmayan blokta hiç ortak alan yok', () => {
    const m1 = boardRooms('M1')
    expect(floorOf(m1, 1).common_areas.map(a => a.location)).toEqual(['M1-1-corridor', 'M1-1-toilet', 'M1-1-bathroom', 'M1-1-stairs'])
    expect(floorOf(m1, 1).common_areas[1]).toMatchObject({ code: 'toilet', label: 'Tuvalet / WC', status: null })
    expect(floorOf(boardRooms('FX'), 1).common_areas).toEqual([])
  })

  it('bilinmeyen blokta null döner', () => {
    expect(boardRooms('YOK')).toBeNull()
  })
})

describe('boardBlocks', () => {
  it('aktif oda sayısını, kapalıyı ve bugün temizleneni sayar', () => {
    const fx = boardBlocks().find(b => b.block === 'FX')
    expect(fx).toMatchObject({ rooms: 4, open: 3, closed: 1, locked: 0, cleaned: 1, skipped: 0 })
    expect(boardBlocks().find(b => b.block === 'M1').type).toBe('M')
  })
})
