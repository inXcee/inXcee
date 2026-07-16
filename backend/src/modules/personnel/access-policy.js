import { requireRole } from '../../shared/auth/middleware.js'

export const dossierAccess = requireRole('campus_manager', 'shift_supervisor')

const SENSITIVE_DOCUMENT_KINDS = new Set([
  'identity',
  'contract',
  'social_security',
  'health_report',
  'kvkk',
  'bank',
  'payroll',
])

export function dossierCapabilities(role) {
  const isManager = role === 'campus_manager'
  const isSupervisor = role === 'shift_supervisor'
  return {
    can_view_dossier: isManager || isSupervisor,
    can_view_sensitive_fields: isManager,
    can_view_sensitive_documents: isManager,
    can_manage_sensitive_documents: isManager,
    can_manage_operational_documents: isManager || isSupervisor,
    can_manage_followups: isManager || isSupervisor,
  }
}

export function maskTcNo(value) {
  const tcNo = String(value || '').trim()
  if (!tcNo) return null
  if (tcNo.length <= 4) return '*'.repeat(tcNo.length)
  return `${tcNo.slice(0, 3)}${'*'.repeat(Math.max(1, tcNo.length - 5))}${tcNo.slice(-2)}`
}

export function sanitizeDossierPerson(person, role) {
  if (!person) return person
  const result = { ...person }
  if (role === 'campus_manager') return result

  result.tc_no = maskTcNo(result.tc_no)
  delete result.salary
  delete result.iban
  delete result.passport_no
  return result
}

export function canAccessDossierDocument(role, document) {
  if (role === 'campus_manager') return true
  if (role !== 'shift_supervisor' || !document) return false
  if (document.visibility === 'sensitive') return false
  return !SENSITIVE_DOCUMENT_KINDS.has(document.document_kind)
}

export function applyDossierAccess(data, role) {
  if (!data) return data
  return {
    ...data,
    person: sanitizeDossierPerson(data.person, role),
    access: dossierCapabilities(role),
  }
}
