import { describe, expect, it } from 'vitest'
import {
  applyDossierAccess,
  canAccessDossierDocument,
  dossierCapabilities,
  maskTcNo,
  sanitizeDossierPerson,
} from './access-policy.js'

describe('personnel dossier access policy', () => {
  it('campus manager keeps sensitive fields and capabilities', () => {
    const person = { tc_no: '12345678901', salary: 40000, iban: 'TR00', passport_no: 'P1' }
    expect(sanitizeDossierPerson(person, 'campus_manager')).toEqual(person)
    expect(dossierCapabilities('campus_manager').can_view_sensitive_documents).toBe(true)
  })

  it('shift supervisor gets masked identity without payroll fields', () => {
    const result = sanitizeDossierPerson({
      id: 1,
      tc_no: '12345678901',
      salary: 40000,
      iban: 'TR00',
      passport_no: 'P1',
      full_name: 'Test Personel',
    }, 'shift_supervisor')

    expect(result.tc_no).toBe('123******01')
    expect(result).not.toHaveProperty('salary')
    expect(result).not.toHaveProperty('iban')
    expect(result).not.toHaveProperty('passport_no')
    expect(result.full_name).toBe('Test Personel')
  })

  it('document visibility is enforced by role and kind', () => {
    expect(canAccessDossierDocument('campus_manager', {
      document_kind: 'health_report',
      visibility: 'sensitive',
    })).toBe(true)
    expect(canAccessDossierDocument('shift_supervisor', {
      document_kind: 'training',
      visibility: 'operational',
    })).toBe(true)
    expect(canAccessDossierDocument('shift_supervisor', {
      document_kind: 'bank',
      visibility: 'operational',
    })).toBe(false)
    expect(canAccessDossierDocument('technical', {
      document_kind: 'training',
      visibility: 'operational',
    })).toBe(false)
  })

  it('payload includes explicit access capabilities', () => {
    const result = applyDossierAccess({ person: { tc_no: '12345678901' } }, 'shift_supervisor')
    expect(result.person.tc_no).toBe(maskTcNo('12345678901'))
    expect(result.access.can_view_dossier).toBe(true)
    expect(result.access.can_view_sensitive_fields).toBe(false)
  })
})
