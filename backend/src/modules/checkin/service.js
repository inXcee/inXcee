import { lookupPerson, insertPersonnel, suggestRoom, assignRoom, addZimmet, signZimmet } from './queries.js'

export function lookupService(tc_no, passport_no) {
  return lookupPerson(tc_no, passport_no)
}

export function registerService(data, userId) {
  const existing = lookupPerson(data.tc_no, data.passport_no)
  if (existing) return { id: existing.id, existing: true }
  const id = insertPersonnel(data)
  return { id, existing: false }
}

export function suggestRoomService(company, hometown) {
  return suggestRoom(company, hometown)
}

export function assignRoomService(personnelId, roomId, userId) {
  return assignRoom(personnelId, roomId, userId)
}

export function zimmetService(personnelId, items, userId) {
  addZimmet(personnelId, items, userId)
}

export function signZimmetService(personnelId, signature) {
  signZimmet(personnelId, signature)
}
