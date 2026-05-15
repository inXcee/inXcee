import * as q from './queries.js'
import { logAudit } from '../../shared/audit.js'

function validate(data) {
  if (!data.name || data.name.trim().length < 2) return 'Firma adı en az 2 karakter olmalı'
  if (data.contact_email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.contact_email)) return 'Geçersiz e-posta'
  if (data.contract_start && data.contract_end) {
    if (data.contract_end < data.contract_start) return 'Bitiş tarihi başlangıçtan önce olamaz'
  }
  if (data.bed_quota != null && (data.bed_quota < 0 || data.bed_quota > 10000)) return 'Geçersiz yatak kotası'
  if (data.price_per_bed != null && data.price_per_bed < 0) return 'Geçersiz fiyat'
  return null
}

export const listService = q.listCompanies
export const getService = q.getCompany
export const expiringService = q.expiringContracts
export const statsService = q.companyStats

export function createService(data, userId) {
  const err = validate(data)
  if (err) return { error: err, status: 400 }
  try {
    const id = q.createCompany(data)
    logAudit(userId, 'company_create', 'companies', id, data.name)
    return { id }
  } catch (e) {
    if (e.message?.includes('UNIQUE')) return { error: 'Bu isimde firma zaten var', status: 409 }
    throw e
  }
}

export function updateService(id, data, userId) {
  const err = validate(data)
  if (err) return { error: err, status: 400 }
  const existing = q.getCompany(id)
  if (!existing) return { error: 'Firma bulunamadı', status: 404 }
  try {
    q.updateCompany(id, data)
    logAudit(userId, 'company_update', 'companies', id, data.name)
    return { ok: true }
  } catch (e) {
    if (e.message?.includes('UNIQUE')) return { error: 'Bu isimde firma zaten var', status: 409 }
    throw e
  }
}

export function deleteService(id, userId) {
  const existing = q.getCompany(id)
  if (!existing) return { error: 'Firma bulunamadı', status: 404 }
  try {
    q.deleteCompany(id)
    logAudit(userId, 'company_delete', 'companies', id, existing.name)
    return { ok: true }
  } catch (e) {
    return { error: e.message, status: 400 }
  }
}
