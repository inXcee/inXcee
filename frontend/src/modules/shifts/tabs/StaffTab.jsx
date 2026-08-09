import { Fragment, useState, useEffect, useMemo, useRef } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import api from '../../../shared/api/client.js'
import { useProjects, NO_PROJECT } from '../../../shared/hooks/useProjects.js'
import { useAuthStore } from '../../../shared/store/authStore.js'
import { confirmDialog } from '../../../shared/components/ConfirmDialog.jsx'
import { useDebounce } from '../../../shared/hooks/useDebounce.js'
import { useSavedFilters, SavedFiltersBar } from '../../../shared/hooks/useSavedFilters.jsx'
import { SkeletonGrid } from '../../../shared/components/Skeleton.jsx'
import { exportRowsToCsv, exportRowsToXlsx } from '../../../shared/utils/exportData.js'
import ProjectBadge from '../../../shared/components/ProjectBadge.jsx'
import PersonnelTrackingCenter from '../../personnel/PersonnelTrackingCenter.jsx'
import { toastErr, toastOk, deptColor, BottomSheet } from '../shared.jsx'

function localIsoDate() {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
}

function StaffQualityPanel({ quality, onEdit }) {
  const [open, setOpen] = useState(false)
  const summary = quality?.summary || {}
  const rows = Array.isArray(quality?.rows) ? quality.rows : []
  const byCode = summary.by_code || {}
  const metrics = [
    ['Sorunlu Personel', summary.staff_with_issues || 0, 'var(--red)'],
    ['Kadro / Proje', byCode.missing_project || 0, 'var(--accent)'],
    ['Departman', byCode.missing_department || 0, 'var(--red)'],
    ['Rol', byCode.missing_role || 0, 'var(--accent)'],
    ['Ana Nokta', byCode.missing_work_location || 0, 'var(--accent)'],
    ['Maaş / IBAN', (byCode.missing_salary || 0) + (byCode.missing_iban || 0), 'var(--purple)'],
    ['Uyumsuzluk', (byCode.role_department_mismatch || 0) + (byCode.location_department_mismatch || 0), 'var(--red)'],
  ]

  return (
    <div className="panel" style={{ marginBottom: '16px', borderColor: rows.length ? 'rgba(240,165,0,.45)' : 'rgba(39,201,106,.35)' }}>
      <div className="panel-header" style={{ alignItems: 'center' }}>
        <div>
          <div className="panel-title">PERSONEL VERİ KALİTESİ</div>
          <div className="panel-subtitle">
            {summary.checked_staff || 0} kayıt kontrol edildi · {summary.issue_total || 0} açık konu
          </div>
        </div>
        <button type="button" className="btn btn-ghost btn-sm" onClick={() => setOpen(value => !value)}>
          {open ? 'Daralt' : 'Aç'}
        </button>
      </div>
      {open && (
        <div className="panel-body" style={{ display: 'grid', gap: '10px' }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: '8px' }}>
            {metrics.map(([label, value, color]) => (
              <div key={label} style={{ border: '1px solid var(--border)', borderRadius: '8px', background: 'var(--surface2)', padding: '9px 10px' }}>
                <div style={{ fontFamily: 'var(--mono)', fontSize: '8px', color: 'var(--text3)' }}>{label}</div>
                <div style={{ fontFamily: 'var(--display)', fontSize: '19px', color, marginTop: '3px' }}>{value}</div>
              </div>
            ))}
          </div>
          {rows.length === 0 ? (
            <div style={{ color: 'var(--green)', fontFamily: 'var(--display)', fontSize: '14px' }}>Personel ana bilgilerinde açık kontrol görünmüyor.</div>
          ) : (
            <div style={{ maxHeight: '320px', overflow: 'auto', border: '1px solid var(--border)', borderRadius: '8px' }}>
              <table className="data-table" style={{ fontSize: '10px' }}>
                <thead><tr><th>PERSONEL</th><th>GÖREV</th><th>KONTROLLER</th><th>İŞLEM</th></tr></thead>
                <tbody>
                  {rows.map(staff => (
                    <tr key={staff.id}>
                      <td style={{ fontWeight: 700 }}>{staff.full_name}</td>
                      <td>
                        <div>{staff.dept_name || 'Departmansız'}</div>
                        <div style={{ color: 'var(--text3)', marginTop: '2px' }}>{staff.role_name || 'Rol yok'} · {staff.primary_work_location_name || 'Nokta yok'}</div>
                      </td>
                      <td>
                        <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
                          {staff.issues.map(issue => (
                            <span key={issue.code} title={issue.label} style={{
                              border: `1px solid ${issue.severity === 'critical' ? 'rgba(231,76,60,.35)' : 'rgba(240,165,0,.35)'}`,
                              borderRadius: '5px', padding: '2px 5px',
                              color: issue.severity === 'critical' ? 'var(--red)' : 'var(--accent)',
                            }}>{issue.label}</span>
                          ))}
                        </div>
                      </td>
                      <td><button type="button" className="btn btn-ghost btn-xs" onClick={() => onEdit(staff)}>Düzenle</button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

export function StaffFormSheet({ editStaff, form, setForm, handleSubmit, createMut, updateMut, departments, staffRoles = [], workLocations = [], canViewSensitive, onClose }) {
  const [tab, setTab] = useState('temel')
  const { projects } = useProjects()
  const [error, setError] = useState(null)

  useEffect(() => {
    const onEsc = e => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', onEsc)
    return () => document.removeEventListener('keydown', onEsc)
  }, [onClose])

  const isPending = createMut.isPending || updateMut.isPending
  const BLOOD_TYPES = ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', '0+', '0-']

  return (
    <BottomSheet onClose={onClose}>
      {/* Header */}
      <div style={{ padding: '0 20px 0', flexShrink: 0 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingBottom: '10px' }}>
          <div style={{ fontFamily: 'var(--display)', fontSize: '16px', letterSpacing: '1px' }}>
            {editStaff ? '✏️ PERSONEL DÜZENLE' : '➕ YENİ PERSONEL'}
          </div>
          <button onClick={onClose} className="btn btn-ghost btn-sm">✕</button>
        </div>
        {/* Tab bar */}
        <div style={{ display: 'flex', borderBottom: '1px solid var(--border)' }}>
          {[['temel', 'Temel Bilgiler'], ['detay', 'Detaylar']].map(([id, label]) => (
            <button key={id} onClick={() => setTab(id)}
              style={{
                flex: 1, padding: '8px 4px', border: 'none', background: 'transparent', cursor: 'pointer',
                fontFamily: 'var(--mono)', fontSize: '10px', letterSpacing: '0.5px',
                color: tab === id ? 'var(--accent)' : 'var(--text3)',
                borderBottom: tab === id ? '2px solid var(--accent)' : '2px solid transparent',
                marginBottom: '-1px',
              }}>
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Content */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '16px 20px' }}>
        {tab === 'temel' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <div>
              <label className="form-label">Ad Soyad *</label>
              <input className="form-input" value={form.full_name || ''}
                onChange={e => setForm(p => ({ ...p, full_name: e.target.value }))} />
            </div>
            {canViewSensitive && (
              <div>
                <label className="form-label">TC Kimlik No</label>
                <input className="form-input" value={form.tc_no || ''} maxLength={11}
                  onChange={e => setForm(p => ({ ...p, tc_no: e.target.value }))} />
              </div>
            )}
            <div>
              <label className="form-label">Telefon</label>
              <input className="form-input" type="tel" value={form.phone || ''} placeholder="05XX XXX XXXX"
                onChange={e => setForm(p => ({ ...p, phone: e.target.value }))} />
            </div>
            <div>
              <label className="form-label">E-posta</label>
              <input className="form-input" type="email" value={form.email || ''}
                onChange={e => setForm(p => ({ ...p, email: e.target.value }))} />
            </div>
            <div>
              <label className="form-label">Pozisyon</label>
              <input className="form-input" value={form.position || ''} placeholder="Örneğin: Güvenlik Görevlisi"
                onChange={e => setForm(p => ({ ...p, position: e.target.value }))} />
            </div>
            <div>
              <label className="form-label">Kadro / Proje</label>
              <select className="form-select" value={form.project_id || ''}
                aria-label="Kadro projesi"
                onChange={e => setForm(p => ({ ...p, project_id: e.target.value }))}>
                <option value="">Kadrosu belirsiz</option>
                {projects.map(pr => <option key={pr.id} value={pr.id}>{pr.name}</option>)}
              </select>
              <div style={{ fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--text4)', marginTop: 3 }}>
                Kâğıt üzerinde bağlı olduğu proje. O gün fiilen nerede çalıştığı çizelgeden gelir.
              </div>
            </div>
            <div>
              <label className="form-label">Departman</label>
              <select className="form-select" value={form.department_id || ''}
                onChange={e => setForm(p => ({ ...p, department_id: e.target.value }))}>
                <option value="">Departman seçin...</option>
                {departments.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
              </select>
            </div>
            <div>
              <label className="form-label">Rol / Gorev</label>
              <select className="form-select" value={form.role_id || ''}
                onChange={e => setForm(p => ({ ...p, role_id: e.target.value }))}>
                <option value="">Rol secin...</option>
                {staffRoles.map(role => <option key={role.id} value={role.id}>{role.name}</option>)}
              </select>
            </div>
            <div>
              <label className="form-label">Ana Çalışma Noktası</label>
              <select className="form-select" value={form.primary_work_location_id || ''}
                onChange={e => setForm(p => ({ ...p, primary_work_location_id: e.target.value }))}>
                <option value="">Çalışma noktası seçin...</option>
                {workLocations.map(location => (
                  <option key={location.id} value={location.id}>{location.name}{location.site ? ` · ${location.site}` : ''}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="form-label">Görev Geçerlilik Başlangıcı</label>
              <input type="date" className="form-input" value={form.assignment_effective_from || ''}
                onChange={e => setForm(p => ({ ...p, assignment_effective_from: e.target.value }))} />
              <div style={{ fontFamily: 'var(--mono)', fontSize: '8px', color: 'var(--text3)', marginTop: '4px' }}>
                Departman, rol veya nokta değişirse eski görev bu tarihten bir gün önce kapanır.
              </div>
            </div>
            <div>
              <label className="form-label">İşe Giriş Tarihi</label>
              <input type="date" className="form-input" value={form.hire_date || ''}
                onChange={e => setForm(p => ({ ...p, hire_date: e.target.value }))} />
            </div>
            <div>
              <label className="form-label">Sözleşme Bitiş Tarihi</label>
              <input type="date" className="form-input" value={form.contract_end || ''}
                onChange={e => setForm(p => ({ ...p, contract_end: e.target.value }))} />
            </div>
            {editStaff && (
              <div>
                <label className="form-label">Durum</label>
                <select className="form-select" value={form.is_active ? '1' : '0'}
                  onChange={e => setForm(p => ({ ...p, is_active: parseInt(e.target.value) }))}>
                  <option value="1">Aktif</option>
                  <option value="0">Pasif</option>
                </select>
              </div>
            )}
          </div>
        )}

        {tab === 'detay' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <div>
              <label className="form-label">Doğum Tarihi</label>
              <input type="date" className="form-input" value={form.birth_date || ''}
                onChange={e => setForm(p => ({ ...p, birth_date: e.target.value }))} />
            </div>
            <div>
              <label className="form-label">Adres</label>
              <input className="form-input" value={form.address || ''}
                onChange={e => setForm(p => ({ ...p, address: e.target.value }))} />
            </div>
            <div>
              <label className="form-label">Acil Durum Kişisi</label>
              <input className="form-input" value={form.emergency_contact || ''}
                onChange={e => setForm(p => ({ ...p, emergency_contact: e.target.value }))} />
            </div>
            <div>
              <label className="form-label">Acil Durum Telefonu</label>
              <input className="form-input" type="tel" value={form.emergency_phone || ''}
                onChange={e => setForm(p => ({ ...p, emergency_phone: e.target.value }))} />
            </div>
            <div>
              <label className="form-label">Kan Grubu</label>
              <select className="form-select" value={form.blood_type || ''}
                onChange={e => setForm(p => ({ ...p, blood_type: e.target.value }))}>
                <option value="">Seçin...</option>
                {BLOOD_TYPES.map(b => <option key={b} value={b}>{b}</option>)}
              </select>
            </div>
            <div>
              <label className="form-label">Cinsiyet</label>
              <select className="form-select" value={form.gender || 'male'}
                onChange={e => setForm(p => ({ ...p, gender: e.target.value }))}>
                <option value="male">Erkek</option>
                <option value="female">Kadın</option>
              </select>
            </div>
            {canViewSensitive && (
              <>
                <div>
                  <label className="form-label">Maaş (TL)</label>
                  <input type="number" className="form-input" value={form.salary || ''}
                    onChange={e => setForm(p => ({ ...p, salary: e.target.value }))} />
                </div>
                <div>
                  <label className="form-label">IBAN</label>
                  <input className="form-input" value={form.iban || ''} placeholder="TR..."
                    onChange={e => setForm(p => ({ ...p, iban: e.target.value.toUpperCase() }))} />
                </div>
              </>
            )}
            <div>
              <label className="form-label">Görev Değişikliği Notu</label>
              <input className="form-input" value={form.assignment_note || ''} placeholder="Örn. OTC Yemekhane görevlendirmesi"
                onChange={e => setForm(p => ({ ...p, assignment_note: e.target.value }))} />
            </div>
            <div>
              <label className="form-label">Notlar</label>
              <textarea className="form-textarea" value={form.notes || ''} rows={3}
                onChange={e => setForm(p => ({ ...p, notes: e.target.value }))}
                style={{ minHeight: '60px' }} />
            </div>
          </div>
        )}
      </div>

      {/* Footer */}
      <div style={{ padding: '12px 20px', borderTop: '1px solid var(--border)', flexShrink: 0, display: 'flex', gap: '8px' }}>
        {error && <div style={{ color: 'var(--red)', fontFamily: 'var(--mono)', fontSize: '10px', marginBottom: '8px' }}>{error}</div>}
        <button className="btn btn-primary" style={{ flex: 1, opacity: !form.full_name ? 0.5 : 1 }}
          disabled={!form.full_name || isPending}
          onClick={() => { setError(null); handleSubmit() }}>
          {isPending ? 'Kaydediliyor...' : editStaff ? 'Güncelle' : 'Kaydet'}
        </button>
        <button className="btn btn-ghost" onClick={onClose}>İptal</button>
      </div>
    </BottomSheet>
  )
}

// ═══════════════════════════════════════════════════════════════════════════════
//  TAB 0 — PERSONEL YONETIMI (Staff Management)
// ═══════════════════════════════════════════════════════════════════════════════
const DIRECTORY_COLUMNS = [
  { key: 'assignment', label: 'Görev ve Lokasyon' },
  { key: 'contact', label: 'İletişim' },
  { key: 'today', label: 'Bugünkü Durum' },
  { key: 'leave', label: 'Yıllık İzin' },
  { key: 'documents', label: 'Belgeler' },
  { key: 'followups', label: 'Görevler' },
  { key: 'equipment', label: 'Aktif Zimmet' },
  { key: 'performance', label: 'Performans' },
  { key: 'status', label: 'Durum' },
]

const DEFAULT_COLUMNS = DIRECTORY_COLUMNS.map(column => column.key)
const EMPTY_LIST = []
const EMPTY_QUALITY = { summary: {}, rows: [] }
const DEFAULT_FILTERS = {
  project_id: '', dept_id: '', role_id: '', work_location_id: '', gender: '', search: '', is_active: '1', risk: '', focus: '',
}

function fullWorkLocation(staff) {
  const values = [staff.primary_work_location_site, staff.primary_work_location_name].filter(Boolean)
  return [...new Set(values)].join(' / ') || 'Atanmamış'
}

function organizationPath(staff) {
  return [staff.project_name || 'Kadrosuz', staff.dept_name || 'Departmansız', fullWorkLocation(staff)].join(' / ')
}

const PERSONNEL_EXPORT_COLUMNS = [
  { key: 'id', label: 'Sicil ID' },
  { key: 'full_name', label: 'Ad Soyad' },
  { key: 'tc_no', label: 'T.C. Kimlik No' },
  { key: 'project_name', label: 'Kadro / Proje', format: row => row.project_name || 'Kadrosuz' },
  { key: 'project_code', label: 'Proje Kodu' },
  { key: 'dept_name', label: 'Departman', format: row => row.dept_name || 'Departmansız' },
  { key: 'role_name', label: 'Rol / Görev' },
  { key: 'position', label: 'Pozisyon' },
  { key: 'organization_path', label: 'Tam Çalışma Konumu', format: organizationPath },
  { key: 'primary_work_location_site', label: 'Saha' },
  { key: 'primary_work_location_name', label: 'Ana Çalışma Noktası' },
  { key: 'phone', label: 'Telefon' },
  { key: 'email', label: 'E-posta' },
  { key: 'hire_date', label: 'İşe Giriş Tarihi' },
  { key: 'contract_end', label: 'Sözleşme Bitişi' },
  { key: 'birth_date', label: 'Doğum Tarihi' },
  { key: 'gender', label: 'Cinsiyet', format: row => row.gender === 'female' ? 'Kadın' : row.gender === 'male' ? 'Erkek' : '' },
  { key: 'blood_type', label: 'Kan Grubu' },
  { key: 'address', label: 'Adres' },
  { key: 'emergency_contact', label: 'Acil Durum Kişisi' },
  { key: 'emergency_phone', label: 'Acil Durum Telefonu' },
  { key: 'is_active', label: 'Personel Durumu', format: row => row.is_active ? 'Aktif' : 'Pasif' },
  { key: 'today_shift_name', label: 'Bugünkü Vardiya' },
  { key: 'today_status', label: 'Bugünkü Durum' },
  { key: 'annual_leave_entitled', label: 'Yıllık İzin Hakkı' },
  { key: 'annual_leave_remaining', label: 'Kalan Yıllık İzin' },
  { key: 'missing_documents', label: 'Eksik Belge' },
  { key: 'expired_documents', label: 'Süresi Dolmuş Belge' },
  { key: 'open_followups', label: 'Açık Görev' },
  { key: 'overdue_followups', label: 'Gecikmiş Görev' },
  { key: 'open_attendance_exceptions', label: 'Açık Devam Sorunu' },
  { key: 'equipment_count', label: 'Aktif Zimmet / KKD' },
  { key: 'latest_performance_score', label: 'Son Performans Puanı' },
  { key: 'risk_count', label: 'Toplam Risk' },
  { key: 'salary', label: 'Maaş' },
  { key: 'iban', label: 'IBAN' },
  { key: 'notes', label: 'Notlar' },
  { key: 'dossier_path', label: 'Personel Dosya Yolu', format: row => `/personnel/${row.id}` },
]

const FOCUS_FILTERS = [
  { key: '', label: 'Tüm personel' },
  { key: 'favorites', label: 'Favoriler' },
  { key: 'scheduled', label: 'Bugün vardiyada' },
  { key: 'leave', label: 'Bugün izinli' },
  { key: 'unplanned', label: 'Bugün plansız' },
  { key: 'assignment', label: 'Ataması eksik' },
  { key: 'contact', label: 'İletişimi eksik' },
]

const VIEW_PROFILES = [
  { key: 'full', label: 'Tam Kayıt', description: 'Tüm personel kolonları', viewMode: 'table', density: 'comfortable', group: true, columns: DEFAULT_COLUMNS },
  { key: 'operations', label: 'Operasyon', description: 'Vardiya ve saha odağı', viewMode: 'table', density: 'compact', group: true, columns: ['assignment', 'today', 'followups', 'equipment', 'status'] },
  { key: 'hr', label: 'İK Kontrol', description: 'Belge, izin ve performans', viewMode: 'table', density: 'comfortable', group: false, columns: ['contact', 'leave', 'documents', 'followups', 'performance', 'status'] },
  { key: 'quick', label: 'Hızlı Liste', description: 'Az kolon, çok personel', viewMode: 'table', density: 'compact', group: false, columns: ['assignment', 'contact', 'today', 'status'] },
  { key: 'cards', label: 'Ekip Kartları', description: 'Görsel ekip görünümü', viewMode: 'cards', density: 'comfortable', group: true, columns: DEFAULT_COLUMNS },
]

function usePersistentState(key, fallback) {
  const [value, setValue] = useState(() => {
    try {
      const stored = localStorage.getItem(key)
      return stored ? JSON.parse(stored) : fallback
    } catch {
      return fallback
    }
  })
  useEffect(() => {
    try { localStorage.setItem(key, JSON.stringify(value)) } catch { /* browser storage unavailable */ }
  }, [key, value])
  return [value, setValue]
}

function numberValue(value) {
  return Number(value || 0)
}

function riskMatches(staff, risk) {
  if (!risk) return true
  if (risk === 'any') return numberValue(staff.risk_count) > 0
  if (risk === 'documents') return numberValue(staff.missing_documents) + numberValue(staff.expired_documents) + numberValue(staff.expiring_documents) > 0
  if (risk === 'followups') return numberValue(staff.open_followups) > 0
  if (risk === 'attendance') return numberValue(staff.open_attendance_exceptions) > 0
  if (risk === 'equipment') return numberValue(staff.equipment_count) > 0
  if (risk === 'certificates') return numberValue(staff.expired_certificates) + numberValue(staff.expiring_certificates) > 0
  if (risk === 'checklists') return numberValue(staff.open_onboarding) + numberValue(staff.open_offboarding) > 0
  if (risk === 'assignment') return !staff.project_id || !staff.department_id || !staff.role_id || !staff.primary_work_location_id
  if (risk === 'contract') {
    if (!staff.contract_end) return false
    const days = Math.ceil((new Date(staff.contract_end).getTime() - Date.now()) / 86400000)
    return days <= 30
  }
  return true
}

function focusMatches(staff, focus, favoriteIds = []) {
  if (!focus) return true
  if (focus === 'favorites') return favoriteIds.includes(staff.id)
  if (focus === 'scheduled') return !!staff.today_shift_name
  if (focus === 'leave') return staff.today_status === 'on_leave'
  if (focus === 'unplanned') return !staff.today_shift_name && staff.today_status !== 'on_leave'
  if (focus === 'assignment') return !staff.project_id || !staff.department_id || !staff.role_id || !staff.primary_work_location_id
  if (focus === 'contact') return !staff.phone || !staff.email
  return true
}

function RiskBadges({ staff, compact = false }) {
  const badges = []
  const add = (key, label, tone = 'amber') => badges.push({ key, label, tone })
  if (numberValue(staff.expired_documents)) add('expired-docs', `${staff.expired_documents} süresi dolmuş belge`, 'red')
  if (numberValue(staff.missing_documents)) add('missing-docs', `${staff.missing_documents} eksik belge`)
  if (numberValue(staff.overdue_followups)) add('overdue', `${staff.overdue_followups} gecikmiş görev`, 'red')
  else if (numberValue(staff.open_followups)) add('followups', `${staff.open_followups} açık görev`, 'blue')
  if (numberValue(staff.open_attendance_exceptions)) add('attendance', `${staff.open_attendance_exceptions} devam sorunu`, 'red')
  if (numberValue(staff.expired_certificates)) add('certificates', `${staff.expired_certificates} sertifika dolmuş`, 'red')
  if (numberValue(staff.open_onboarding) + numberValue(staff.open_offboarding)) add('checklists', 'Açık İK süreci', 'purple')
  if (!staff.project_id || !staff.department_id || !staff.role_id || !staff.primary_work_location_id) add('assignment', 'Atama eksik')

  if (badges.length === 0) {
    return <span style={{ color: 'var(--green)', fontSize: '10px', fontFamily: 'var(--mono)' }}>Kontroller temiz</span>
  }
  const tone = {
    red: ['rgba(231,76,60,.11)', 'var(--red)', 'rgba(231,76,60,.3)'],
    amber: ['rgba(240,165,0,.11)', 'var(--accent)', 'rgba(240,165,0,.3)'],
    blue: ['rgba(59,140,240,.11)', 'var(--blue)', 'rgba(59,140,240,.3)'],
    purple: ['rgba(168,85,247,.11)', 'var(--purple)', 'rgba(168,85,247,.3)'],
  }
  return (
    <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
      {badges.slice(0, compact ? 3 : badges.length).map(badge => {
        const colors = tone[badge.tone] || tone.amber
        return (
          <span key={badge.key} style={{
            padding: '2px 6px', borderRadius: '5px', fontFamily: 'var(--mono)', fontSize: '8px',
            background: colors[0], color: colors[1], border: `1px solid ${colors[2]}`,
          }}>{badge.label}</span>
        )
      })}
      {compact && badges.length > 3 && (
        <span style={{ color: 'var(--text3)', fontFamily: 'var(--mono)', fontSize: '8px', padding: '3px' }}>+{badges.length - 3}</span>
      )}
    </div>
  )
}

function SummaryCard({ value, label, color, active = false, onClick }) {
  return (
    <button type="button" onClick={onClick} aria-pressed={active} aria-label={`${label}: ${value}`} style={{
      padding: '16px 18px', background: active ? `color-mix(in srgb, ${color} 12%, var(--surface2))` : 'var(--surface2)',
      borderStyle: 'solid', borderWidth: '1px 1px 1px 3px',
      borderColor: active ? color : `var(--border) var(--border) var(--border) ${color}`, borderRadius: '12px',
      color: 'inherit', textAlign: 'left', cursor: onClick ? 'pointer' : 'default', width: '100%',
      boxShadow: active ? `0 0 0 2px color-mix(in srgb, ${color} 16%, transparent)` : 'none',
      transition: 'border-color .18s ease, transform .18s ease, box-shadow .18s ease',
    }}>
      <div style={{ fontFamily: 'var(--display)', fontSize: '28px', color, lineHeight: 1 }}>{value}</div>
      <div style={{ fontFamily: 'var(--mono)', fontSize: '8px', color: 'var(--text3)', letterSpacing: '1px', marginTop: '6px' }}>{label}</div>
      {onClick && <div style={{ fontFamily: 'var(--mono)', fontSize: '7px', color: active ? color : 'var(--text3)', marginTop: '7px' }}>{active ? 'FİLTRE AKTİF' : 'FİLTRELE'}</div>}
    </button>
  )
}

function BulkAssignmentSheet({ count, projects, departments, roles = [], workLocations, isPending, onSubmit, onClose }) {
  const [bulkForm, setBulkForm] = useState({
    project_id: '__keep__',
    department_id: '__keep__',
    role_id: '__keep__',
    work_location_id: '__keep__',
    effective_from: localIsoDate(),
    note: '',
  })
  const hasChange = bulkForm.project_id !== '__keep__' || bulkForm.department_id !== '__keep__'
    || bulkForm.role_id !== '__keep__' || bulkForm.work_location_id !== '__keep__'
  const submit = () => {
    const payload = {
      effective_from: bulkForm.effective_from,
      note: bulkForm.note,
    }
    if (bulkForm.project_id !== '__keep__') payload.project_id = bulkForm.project_id ? Number(bulkForm.project_id) : null
    if (bulkForm.department_id !== '__keep__') payload.department_id = bulkForm.department_id ? Number(bulkForm.department_id) : null
    if (bulkForm.role_id !== '__keep__') payload.role_id = bulkForm.role_id ? Number(bulkForm.role_id) : null
    if (bulkForm.work_location_id !== '__keep__') payload.work_location_id = bulkForm.work_location_id ? Number(bulkForm.work_location_id) : null
    onSubmit(payload)
  }
  return (
    <BottomSheet onClose={onClose}>
      <div style={{ padding: '0 20px 14px', borderBottom: '1px solid var(--border)' }}>
        <div style={{ fontFamily: 'var(--display)', fontSize: '17px' }}>TOPLU PERSONEL ATAMASI</div>
        <div style={{ color: 'var(--text3)', fontFamily: 'var(--mono)', fontSize: '9px', marginTop: '4px' }}>{count} personel seçildi</div>
      </div>
      <div style={{ padding: '18px 20px', display: 'grid', gap: '14px', overflowY: 'auto' }}>
        <div>
          <label className="form-label">Kadro / Proje</label>
          <select aria-label="Toplu proje ataması" className="form-select" value={bulkForm.project_id} onChange={e => setBulkForm(p => ({ ...p, project_id: e.target.value }))}>
            <option value="__keep__">Değiştirme</option>
            <option value="">Kadro bağlantısını kaldır</option>
            {projects.map(project => <option key={project.id} value={project.id}>{project.name}</option>)}
          </select>
        </div>
        <div>
          <label className="form-label">Departman</label>
          <select className="form-select" value={bulkForm.department_id} onChange={e => setBulkForm(p => ({ ...p, department_id: e.target.value }))}>
            <option value="__keep__">Değiştirme</option>
            <option value="">Atamayı kaldır</option>
            {departments.map(department => <option key={department.id} value={department.id}>{department.name}</option>)}
          </select>
        </div>
        <div>
          {/* Rol toplu atanabilir: canlıda 195 personelde rol boştu ve bu ekran
              rolü değiştiremediği için tek çare tek tek düzeltmekti. */}
          <label className="form-label">Rol</label>
          <select aria-label="Toplu rol ataması" className="form-select" value={bulkForm.role_id} onChange={e => setBulkForm(p => ({ ...p, role_id: e.target.value }))}>
            <option value="__keep__">Değiştirme</option>
            <option value="">Rolü kaldır</option>
            {roles.map(role => <option key={role.id} value={role.id}>{role.name}</option>)}
          </select>
        </div>
        <div>
          <label className="form-label">Çalışma lokasyonu</label>
          <select className="form-select" value={bulkForm.work_location_id} onChange={e => setBulkForm(p => ({ ...p, work_location_id: e.target.value }))}>
            <option value="__keep__">Değiştirme</option>
            <option value="">Atamayı kaldır</option>
            {workLocations.map(location => <option key={location.id} value={location.id}>{location.name}</option>)}
          </select>
        </div>
        <div>
          <label className="form-label">Geçerlilik başlangıcı</label>
          <input type="date" className="form-input" value={bulkForm.effective_from} onChange={e => setBulkForm(p => ({ ...p, effective_from: e.target.value }))} />
        </div>
        <div>
          <label className="form-label">İşlem notu</label>
          <textarea className="form-textarea" rows={3} value={bulkForm.note} onChange={e => setBulkForm(p => ({ ...p, note: e.target.value }))} placeholder="Örn. Yeni saha organizasyonu" />
        </div>
      </div>
      <div style={{ padding: '12px 20px', borderTop: '1px solid var(--border)', display: 'flex', gap: '8px' }}>
        <button className="btn btn-primary" style={{ flex: 1 }} disabled={!hasChange || isPending} onClick={submit}>
          {isPending ? 'Uygulanıyor...' : `${count} Personele Uygula`}
        </button>
        <button className="btn btn-ghost" onClick={onClose}>İptal</button>
      </div>
    </BottomSheet>
  )
}

function DepartmentOverview({ rows, selectedDepartment, onSelect }) {
  const [open, setOpen] = usePersistentState('yys-shifts-staff-department-overview', true)
  const distribution = useMemo(() => {
    const counts = new Map()
    rows.forEach(staff => {
      const key = String(staff.department_id || 'none')
      const current = counts.get(key) || { id: key, name: staff.dept_name || 'Departmansız', count: 0, color: staff.dept_color }
      current.count += 1
      counts.set(key, current)
    })
    return [...counts.values()].sort((left, right) => right.count - left.count || left.name.localeCompare(right.name, 'tr'))
  }, [rows])
  const maximum = Math.max(1, ...distribution.map(item => item.count))

  return (
    <div className="panel" style={{ marginBottom: 12 }}>
      <div className="panel-header" style={{ alignItems: 'center', padding: '10px 14px' }}>
        <div>
          <div className="panel-title">BÖLÜM DAĞILIMI</div>
          <div className="panel-subtitle">Bölüme dokunarak personel listesini anında süzün</div>
        </div>
        <button type="button" className="btn btn-ghost btn-xs" onClick={() => setOpen(value => !value)}>{open ? 'Daralt' : 'Göster'}</button>
      </div>
      {open && (
        <div className="panel-body" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(135px, 1fr))', gap: 7, paddingTop: 0 }}>
          {distribution.map(item => {
            const active = String(selectedDepartment || '') === item.id
            const dc = deptColor(item.color)
            return (
              <button key={item.id} type="button" aria-pressed={active} onClick={() => onSelect(active ? '' : item.id)} style={{
                border: `1px solid ${active ? dc.text : 'var(--border)'}`, borderRadius: 9, padding: '8px 9px',
                background: active ? dc.bg : 'var(--surface2)', color: 'inherit', cursor: 'pointer', textAlign: 'left', minWidth: 0,
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 6, alignItems: 'center' }}>
                  <strong style={{ color: active ? dc.text : 'var(--text2)', fontSize: 10, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.name}</strong>
                  <span style={{ fontFamily: 'var(--display)', color: dc.text, fontSize: 15 }}>{item.count}</span>
                </div>
                <div style={{ height: 3, borderRadius: 3, background: 'var(--border)', overflow: 'hidden', marginTop: 6 }}>
                  <div style={{ height: '100%', width: `${Math.max(8, (item.count / maximum) * 100)}%`, background: dc.text, borderRadius: 3 }} />
                </div>
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}

function StaffCompareSheet({ staffRows, onPersonClick, onClose }) {
  const compareMetrics = [
    ['Bölüm / rol', staff => `${staff.dept_name || '—'} · ${staff.role_name || '—'}`],
    ['Ana lokasyon', staff => staff.primary_work_location_name || 'Atanmamış'],
    ['Bugünkü durum', staff => staff.today_shift_name || (staff.today_status === 'on_leave' ? 'İzinli' : 'Plan yok')],
    ['Yıllık izin', staff => staff.annual_leave_started ? `${numberValue(staff.annual_leave_remaining)} / ${numberValue(staff.annual_leave_entitled)} gün` : 'Hak oluşmadı'],
    ['Belge durumu', staff => `${numberValue(staff.missing_documents)} eksik · ${numberValue(staff.expired_documents)} süresi dolmuş`],
    ['Açık görev', staff => `${numberValue(staff.open_followups)} açık · ${numberValue(staff.overdue_followups)} gecikmiş`],
    ['Devam sorunu', staff => numberValue(staff.open_attendance_exceptions)],
    ['Zimmet / KKD', staff => numberValue(staff.equipment_count)],
    ['Performans', staff => staff.latest_performance_score ?? '—'],
    ['Toplam risk', staff => numberValue(staff.risk_count)],
  ]
  return (
    <BottomSheet onClose={onClose}>
      <div style={{ padding: '0 20px 12px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10 }}>
        <div>
          <div style={{ fontFamily: 'var(--display)', fontSize: 17 }}>PERSONEL KARŞILAŞTIRMA</div>
          <div style={{ color: 'var(--text3)', fontFamily: 'var(--mono)', fontSize: 9, marginTop: 4 }}>{staffRows.length} personelin operasyon bilgileri yan yana</div>
        </div>
        <button type="button" className="btn btn-ghost btn-sm" onClick={onClose}>Kapat</button>
      </div>
      <div style={{ flex: 1, overflow: 'auto', padding: '14px 20px' }}>
        <table className="data-table staff-compare-table" style={{ minWidth: Math.max(720, 190 + staffRows.length * 220) }}>
          <thead>
            <tr>
              <th style={{ width: 170 }}>KARŞILAŞTIRMA</th>
              {staffRows.map(staff => (
                <th key={staff.id}>
                  <div style={{ color: 'var(--text)', fontSize: 11, letterSpacing: 0, textTransform: 'none' }}>{staff.full_name}</div>
                  <div style={{ color: 'var(--text3)', fontSize: 8, letterSpacing: 0, marginTop: 3 }}>{staff.position || 'Pozisyon yok'}</div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {compareMetrics.map(([label, renderValue]) => (
              <tr key={label}>
                <td style={{ color: 'var(--text3)', fontFamily: 'var(--mono)', fontSize: 9 }}>{label}</td>
                {staffRows.map(staff => <td key={staff.id} style={{ fontWeight: label === 'Toplam risk' ? 800 : 500 }}>{renderValue(staff)}</td>)}
              </tr>
            ))}
            <tr>
              <td>İşlem</td>
              {staffRows.map(staff => (
                <td key={staff.id}><button type="button" className="btn btn-primary btn-xs" onClick={() => { onPersonClick?.(staff.id); onClose() }}>Dosyayı Aç</button></td>
              ))}
            </tr>
          </tbody>
        </table>
      </div>
    </BottomSheet>
  )
}

export default function StaffTab({ departments, onPersonClick }) {
  const qc = useQueryClient()
  const [searchParams, setSearchParams] = useSearchParams()
  const searchInputRef = useRef(null)
  const user = useAuthStore(s => s.user)
  const canEdit = ['campus_manager', 'shift_supervisor'].includes(user?.role)
  const canViewSensitive = user?.role === 'campus_manager'
  const canDeactivate = user?.role === 'campus_manager'
  const { projects } = useProjects()

  const [filters, setFilters] = useState(DEFAULT_FILTERS)
  const [viewMode, setViewMode] = usePersistentState('yys-shifts-staff-view', 'table')
  const [visibleColumns, setVisibleColumns] = usePersistentState('yys-shifts-staff-columns-v2', DEFAULT_COLUMNS)
  const [sort, setSort] = usePersistentState('yys-shifts-staff-sort', { key: 'name', direction: 'asc' })
  const [pageSize, setPageSize] = usePersistentState('yys-shifts-staff-page-size', 20)
  const [density, setDensity] = usePersistentState('yys-shifts-staff-density', 'comfortable')
  const [groupByDepartment, setGroupByDepartment] = usePersistentState('yys-shifts-staff-group-department', false)
  const [viewProfile, setViewProfile] = usePersistentState('yys-shifts-staff-view-profile', 'custom')
  const [favoriteIds, setFavoriteIds] = usePersistentState('yys-shifts-staff-favorites', [])
  const [showAdvancedFilters, setShowAdvancedFilters] = useState(false)
  const [page, setPage] = useState(1)
  const [selected, setSelected] = useState(() => new Set())
  const [showForm, setShowForm] = useState(false)
  const [showBulkAssignment, setShowBulkAssignment] = useState(false)
  const [showCompare, setShowCompare] = useState(false)
  const [editStaff, setEditStaff] = useState(null)
  const [form, setForm] = useState({})

  const staffSavedFilters = useSavedFilters('shifts-staff', filters, setFilters)
  const hasActiveStaffFilter = !!(
    filters.project_id || filters.dept_id || filters.role_id || filters.work_location_id || filters.gender
    || filters.search || filters.risk || filters.focus || filters.is_active !== '1'
  )
  const debouncedSearch = useDebounce(filters.search, 300)
  const effectiveFilters = useMemo(() => ({
    project_id: filters.project_id,
    dept_id: filters.dept_id,
    role_id: filters.role_id,
    work_location_id: filters.work_location_id,
    gender: filters.gender,
    is_active: filters.is_active,
    search: debouncedSearch,
  }), [filters.project_id, filters.dept_id, filters.role_id, filters.work_location_id, filters.gender, filters.is_active, debouncedSearch])

  const { data: staffList = EMPTY_LIST, isLoading } = useQuery({
    queryKey: ['staff-list', effectiveFilters],
    queryFn: () => api.get('/shifts/staff', {
      params: { ...effectiveFilters, directory: 1, is_active: effectiveFilters.is_active || undefined },
    }).then(r => r.data),
  })
  const { data: directoryOverview = EMPTY_LIST } = useQuery({
    queryKey: ['staff-directory-overview'],
    queryFn: () => api.get('/shifts/staff', { params: { directory: 1, is_active: 1 } }).then(r => r.data),
  })
  const { data: staffRoles = EMPTY_LIST } = useQuery({
    queryKey: ['shift-roles'],
    queryFn: () => api.get('/shifts/roles').then(r => r.data),
  })
  const { data: workLocations = EMPTY_LIST } = useQuery({
    queryKey: ['shift-work-locations'],
    queryFn: () => api.get('/shifts/work-locations').then(r => r.data),
  })
  const { data: staffQuality = EMPTY_QUALITY } = useQuery({
    queryKey: ['staff-quality'],
    queryFn: () => api.get('/shifts/staff/quality').then(r => r.data),
    enabled: canViewSensitive,
  })
  const departmentOverviewRows = useMemo(() => {
    if (!filters.project_id) return directoryOverview
    if (filters.project_id === NO_PROJECT) return directoryOverview.filter(staff => !staff.project_id)
    return directoryOverview.filter(staff => String(staff.project_id) === String(filters.project_id))
  }, [directoryOverview, filters.project_id])

  const refreshPlan = () => {
    const keys = ['staff-list', 'staff-list-active', 'staff-directory-overview', 'staff-detail', 'staff-quality', 'schedule', 'departments-summary', 'shift-breakdown', 'shift-coverage']
    keys.forEach(key => qc.invalidateQueries({ queryKey: [key] }))
  }

  const createMut = useMutation({
    mutationFn: data => api.post('/shifts/staff', data),
    onSuccess: () => {
      refreshPlan()
      setShowForm(false)
      setForm({})
      toastOk('Personel kaydı oluşturuldu')
    },
    onError: toastErr,
  })
  const updateMut = useMutation({
    mutationFn: ({ id, ...data }) => api.put(`/shifts/staff/${id}`, data),
    onSuccess: () => {
      refreshPlan()
      setShowForm(false)
      setEditStaff(null)
      setForm({})
      toastOk('Personel bilgileri güncellendi')
    },
    onError: toastErr,
  })
  const deleteMut = useMutation({
    mutationFn: id => api.delete(`/shifts/staff/${id}`),
    onSuccess: () => {
      refreshPlan()
      toastOk('Personel pasife alındı')
    },
    onError: toastErr,
  })
  const bulkAssignmentMut = useMutation({
    mutationFn: data => api.post('/shifts/staff/bulk/assignment', { ...data, staff_ids: [...selected] }),
    onSuccess: response => {
      refreshPlan()
      setShowBulkAssignment(false)
      setSelected(new Set())
      toastOk(`${response.data.updated.length} personelin ataması güncellendi`)
    },
    onError: toastErr,
  })
  const bulkDeactivateMut = useMutation({
    mutationFn: () => api.post('/shifts/staff/bulk/deactivate', { staff_ids: [...selected] }),
    onSuccess: response => {
      refreshPlan()
      setSelected(new Set())
      toastOk(`${response.data.updated.length} personel pasife alındı`)
    },
    onError: toastErr,
  })

  const openNew = () => {
    setForm({
      full_name: '', tc_no: '', phone: '', email: '', position: '', department_id: '', role_id: '',
      project_id: '',
      hire_date: '', contract_end: '', birth_date: '', address: '', emergency_contact: '', emergency_phone: '',
      blood_type: '', gender: 'male', salary: '', iban: '', notes: '', is_active: 1,
      primary_work_location_id: '', assignment_effective_from: localIsoDate(), assignment_note: '',
    })
    setEditStaff(null)
    setShowForm(true)
  }
  const openEdit = staff => {
    setForm({
      full_name: staff.full_name || '', tc_no: canViewSensitive ? staff.tc_no || '' : '', phone: staff.phone || '', email: staff.email || '',
      position: staff.position || '', department_id: staff.department_id?.toString() || '', role_id: staff.role_id?.toString() || '',
      project_id: staff.project_id?.toString() || '',
      hire_date: staff.hire_date || '', contract_end: staff.contract_end || '', birth_date: staff.birth_date || '', address: staff.address || '',
      emergency_contact: staff.emergency_contact || '', emergency_phone: staff.emergency_phone || '',
      blood_type: staff.blood_type || '', gender: staff.gender || 'male',
      salary: canViewSensitive ? staff.salary?.toString() || '' : '', iban: canViewSensitive ? staff.iban || '' : '',
      notes: staff.notes || '', is_active: staff.is_active,
      primary_work_location_id: staff.primary_work_location_id?.toString() || '',
      assignment_effective_from: localIsoDate(), assignment_note: '',
    })
    setEditStaff(staff)
    setShowForm(true)
  }
  const handleSubmit = () => {
    const payload = {
      ...form,
      project_id: form.project_id ? Number(form.project_id) : null,
      department_id: form.department_id ? Number(form.department_id) : null,
      role_id: form.role_id ? Number(form.role_id) : null,
      primary_work_location_id: form.primary_work_location_id ? Number(form.primary_work_location_id) : null,
      is_active: form.is_active ? 1 : 0,
    }
    if (canViewSensitive) payload.salary = form.salary ? Number(form.salary) : null
    else {
      delete payload.tc_no
      delete payload.salary
      delete payload.iban
    }
    if (editStaff) updateMut.mutate({ id: editStaff.id, ...payload })
    else createMut.mutate(payload)
  }

  const filteredAndSorted = useMemo(() => {
    const rows = staffList.filter(staff => riskMatches(staff, filters.risk) && focusMatches(staff, filters.focus, favoriteIds))
    const direction = sort.direction === 'desc' ? -1 : 1
    return [...rows].sort((left, right) => {
      if (groupByDepartment) {
        const departmentOrder = String(left.dept_name || 'Departmansız').localeCompare(String(right.dept_name || 'Departmansız'), 'tr')
        if (departmentOrder !== 0) return departmentOrder
      }
      let a
      let b
      if (sort.key === 'risk') {
        a = numberValue(left.risk_count)
        b = numberValue(right.risk_count)
      } else if (sort.key === 'documents') {
        a = numberValue(left.missing_documents) + numberValue(left.expired_documents)
        b = numberValue(right.missing_documents) + numberValue(right.expired_documents)
      } else if (sort.key === 'followups') {
        a = numberValue(left.overdue_followups) + numberValue(left.open_followups)
        b = numberValue(right.overdue_followups) + numberValue(right.open_followups)
      } else if (sort.key === 'hire_date') {
        a = left.hire_date || ''
        b = right.hire_date || ''
      } else {
        a = left.full_name || ''
        b = right.full_name || ''
      }
      if (typeof a === 'number' && typeof b === 'number') return (a - b) * direction
      return String(a).localeCompare(String(b), 'tr') * direction
    })
  }, [staffList, filters.risk, filters.focus, favoriteIds, sort, groupByDepartment])

  const totalPages = Math.max(1, Math.ceil(filteredAndSorted.length / pageSize))
  const pageRows = filteredAndSorted.slice((page - 1) * pageSize, page * pageSize)
  useEffect(() => { setPage(1) }, [filters, sort, pageSize])
  useEffect(() => { if (page > totalPages) setPage(totalPages) }, [page, totalPages])
  useEffect(() => {
    const available = new Set(staffList.map(staff => staff.id))
    setSelected(previous => new Set([...previous].filter(id => available.has(id))))
  }, [staffList])
  useEffect(() => {
    const handleShortcut = event => {
      if (event.key === '/' && !['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement?.tagName)) {
        event.preventDefault()
        searchInputRef.current?.focus()
      }
      if (event.key === 'Escape' && document.activeElement === searchInputRef.current && filters.search) {
        setFilters(previous => ({ ...previous, search: '' }))
      }
    }
    document.addEventListener('keydown', handleShortcut)
    return () => document.removeEventListener('keydown', handleShortcut)
  }, [filters.search])

  const pageAllSelected = pageRows.length > 0 && pageRows.every(staff => selected.has(staff.id))
  const filteredAllSelected = filteredAndSorted.length > 0 && filteredAndSorted.every(staff => selected.has(staff.id))
  const togglePage = () => setSelected(previous => {
    const next = new Set(previous)
    if (pageAllSelected) pageRows.forEach(staff => next.delete(staff.id))
    else pageRows.forEach(staff => next.add(staff.id))
    return next
  })
  const toggleSelected = id => setSelected(previous => {
    const next = new Set(previous)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    return next
  })
  const toggleAllFiltered = () => setSelected(previous => {
    const next = new Set(previous)
    if (filteredAllSelected) filteredAndSorted.forEach(staff => next.delete(staff.id))
    else filteredAndSorted.forEach(staff => next.add(staff.id))
    return next
  })
  const invertPageSelection = () => setSelected(previous => {
    const next = new Set(previous)
    pageRows.forEach(staff => {
      if (next.has(staff.id)) next.delete(staff.id)
      else next.add(staff.id)
    })
    return next
  })
  const toggleColumn = key => {
    setViewProfile('custom')
    setVisibleColumns(previous => previous.includes(key) ? previous.filter(column => column !== key) : [...previous, key])
  }
  const toggleFavorite = id => setFavoriteIds(previous => previous.includes(id) ? previous.filter(item => item !== id) : [...previous, id])
  const applyViewProfile = profile => {
    setViewMode(profile.viewMode)
    setDensity(profile.density)
    setGroupByDepartment(profile.group)
    setVisibleColumns(profile.columns)
    setViewProfile(profile.key)
  }
  const deactivateOne = async staff => {
    const confirmed = await confirmDialog({
      title: 'Personeli Pasifleştir',
      body: `${staff.full_name} pasif yapılsın mı?`,
      confirmLabel: 'Pasifleştir',
      danger: true,
    })
    if (confirmed) deleteMut.mutate(staff.id)
  }
  const deactivateSelected = async () => {
    const confirmed = await confirmDialog({
      title: 'Seçili Personeli Pasifleştir',
      body: `${selected.size} personel pasif yapılacak. Bu işlem vardiya listelerinden kaldırır.`,
      confirmLabel: 'Personelleri Pasifleştir',
      danger: true,
    })
    if (confirmed) bulkDeactivateMut.mutate()
  }
  const getExportRows = () => selected.size
      ? filteredAndSorted.filter(staff => selected.has(staff.id))
      : filteredAndSorted
  const exportSelectedCsv = () => {
    exportRowsToCsv(PERSONNEL_EXPORT_COLUMNS, getExportRows(), `personel-detayli-${localIsoDate()}.csv`)
  }
  const exportSelectedExcel = async () => {
    try {
      await exportRowsToXlsx(PERSONNEL_EXPORT_COLUMNS, getExportRows(), `personel-detayli-${localIsoDate()}.xlsx`, 'Personel Listesi')
      toastOk('Detaylı personel Excel listesi hazırlandı')
    } catch (error) {
      toastErr(error)
    }
  }

  const riskStaffCount = staffList.filter(staff => numberValue(staff.risk_count) > 0).length
  const missingDocumentCount = staffList.reduce((sum, staff) => sum + numberValue(staff.missing_documents), 0)
  const overdueFollowupCount = staffList.reduce((sum, staff) => sum + numberValue(staff.overdue_followups), 0)
  const equipmentCount = staffList.reduce((sum, staff) => sum + numberValue(staff.equipment_count), 0)
  const quickFocusCounts = Object.fromEntries(FOCUS_FILTERS.map(option => [
    option.key,
    staffList.filter(staff => focusMatches(staff, option.key, favoriteIds)).length,
  ]))
  const visibleColumnCount = visibleColumns.length + 3
  const pageGroups = useMemo(() => {
    if (!groupByDepartment) return [{ key: 'all', label: '', rows: pageRows }]
    const groups = []
    pageRows.forEach(staff => {
      const label = staff.dept_name || 'Departmansız'
      const last = groups[groups.length - 1]
      if (last?.label === label) last.rows.push(staff)
      else groups.push({ key: `${label}-${staff.department_id || 'none'}`, label, rows: [staff] })
    })
    return groups
  }, [groupByDepartment, pageRows])

  const filterLabels = {
    search: filters.search ? `Arama: ${filters.search}` : '',
    project_id: filters.project_id === NO_PROJECT
      ? 'Kadrosuz personel'
      : projects.find(item => String(item.id) === String(filters.project_id))?.name,
    dept_id: departments.find(item => String(item.id) === String(filters.dept_id))?.name,
    role_id: staffRoles.find(item => String(item.id) === String(filters.role_id))?.name,
    work_location_id: workLocations.find(item => String(item.id) === String(filters.work_location_id))?.name,
    gender: filters.gender === 'female' ? 'Kadın' : filters.gender === 'male' ? 'Erkek' : '',
    is_active: filters.is_active === '0' ? 'Pasif' : filters.is_active === '' ? 'Aktif + pasif' : '',
    risk: {
      any: 'Riski olanlar', documents: 'Belge riski', followups: 'Görev riski', attendance: 'Devam riski',
      equipment: 'Zimmet / KKD', certificates: 'Sertifika riski', checklists: 'İK süreci', assignment: 'Atama eksiği', contract: 'Sözleşme bitişi',
    }[filters.risk],
    focus: filters.focus ? FOCUS_FILTERS.find(item => item.key === filters.focus)?.label : '',
  }
  const activeFilterEntries = Object.entries(filterLabels).filter(([, label]) => label)
  const clearAllFilters = () => setFilters({ ...DEFAULT_FILTERS })
  const toggleRiskFilter = risk => setFilters(previous => ({ ...previous, risk: previous.risk === risk ? '' : risk, focus: '' }))
  const selectedStaffRows = staffList.filter(staff => selected.has(staff.id))

  const trackingMode = searchParams.get('view') === 'tracking'
  const setSectionMode = mode => {
    setSearchParams(previous => {
      const next = new URLSearchParams(previous)
      if (mode === 'tracking') next.set('view', 'tracking')
      else {
        next.delete('view')
        ;['range', 'from', 'to', 'project_id', 'department_id', 'status', 'event_type', 'q', 'alert'].forEach(key => next.delete(key))
      }
      return next
    }, { replace: true })
  }
  const sectionSwitcher = (
    <div className="staff-section-switcher" role="tablist" aria-label="Personel görünümü">
      <button type="button" role="tab" aria-selected={!trackingMode} onClick={() => setSectionMode('list')}>Personel Listesi</button>
      <button type="button" role="tab" aria-selected={trackingMode} onClick={() => setSectionMode('tracking')}>Takip Merkezi</button>
    </div>
  )

  if (trackingMode) {
    return (
      <div className="fade-up">
        {sectionSwitcher}
        <PersonnelTrackingCenter projects={projects} departments={departments} onPersonClick={onPersonClick} />
      </div>
    )
  }

  return (
    <div className="fade-up">
      {sectionSwitcher}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '10px', marginBottom: '14px' }}>
        <SummaryCard value={staffList.length} label="TOPLAM PERSONEL" color="var(--text)" active={!hasActiveStaffFilter} onClick={clearAllFilters} />
        <SummaryCard value={riskStaffCount} label="RİSK / EKSİK KAYIT" color={riskStaffCount ? 'var(--red)' : 'var(--green)'} active={filters.risk === 'any'} onClick={() => toggleRiskFilter('any')} />
        <SummaryCard value={missingDocumentCount} label="EKSİK BELGE" color={missingDocumentCount ? 'var(--accent)' : 'var(--green)'} active={filters.risk === 'documents'} onClick={() => toggleRiskFilter('documents')} />
        <SummaryCard value={overdueFollowupCount} label="GECİKMİŞ GÖREV" color={overdueFollowupCount ? 'var(--red)' : 'var(--green)'} active={filters.risk === 'followups'} onClick={() => toggleRiskFilter('followups')} />
        <SummaryCard value={equipmentCount} label="AKTİF ZİMMET / KKD" color="var(--blue)" active={filters.risk === 'equipment'} onClick={() => toggleRiskFilter('equipment')} />
      </div>

      {departmentOverviewRows.length > 0 && (
        <DepartmentOverview
          rows={departmentOverviewRows}
          selectedDepartment={filters.dept_id}
          onSelect={departmentId => setFilters(previous => ({
            ...previous,
            dept_id: departmentId === 'none' ? '' : departmentId,
            risk: departmentId === 'none' ? 'assignment' : '',
            focus: '',
          }))}
        />
      )}

      {canViewSensitive && <StaffQualityPanel quality={staffQuality} onEdit={openEdit} />}

      <SavedFiltersBar
        presets={staffSavedFilters.presets}
        onApply={staffSavedFilters.apply}
        onSave={staffSavedFilters.save}
        onRemove={staffSavedFilters.remove}
        hasActiveFilter={hasActiveStaffFilter}
      />

      <div className="panel" style={{ marginBottom: '12px', overflow: 'visible' }}>
        <div className="panel-body" style={{ display: 'grid', gap: '12px' }}>
          <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '8px' }}>
            <div style={{ position: 'relative', flex: '1 1 320px', maxWidth: '560px' }}>
              <input ref={searchInputRef} aria-label="Personel ara" className="form-input" placeholder="Ad, TC, telefon, e-posta veya pozisyon ara..." value={filters.search}
                onChange={e => setFilters(p => ({ ...p, search: e.target.value }))}
                style={{ width: '100%', padding: '10px 76px 10px 38px', fontSize: '13px' }} />
              <span aria-hidden="true" style={{ position: 'absolute', left: 13, top: 10, color: 'var(--text3)', fontSize: 15 }}>⌕</span>
              {filters.search ? (
                <button type="button" className="btn btn-ghost btn-xs" onClick={() => setFilters(previous => ({ ...previous, search: '' }))}
                  style={{ position: 'absolute', right: 7, top: 7 }}>Temizle</button>
              ) : (
                <span style={{ position: 'absolute', right: 10, top: 11, color: 'var(--text3)', fontFamily: 'var(--mono)', fontSize: 8 }}>/ ARA</span>
              )}
            </div>
            <select aria-label="Proje filtresi" className="form-select" value={filters.project_id}
              onChange={e => setFilters(previous => ({ ...previous, project_id: e.target.value }))}
              style={{ width: 'auto', minWidth: 170, flex: '0 1 210px' }}>
              <option value="">Tüm projeler</option>
              {projects.map(project => <option key={project.id} value={project.id}>{project.name} ({project.staff_count ?? 0})</option>)}
              <option value={NO_PROJECT}>Kadrosuz personel</option>
            </select>
            <select aria-label="Departman filtresi" className="form-select" value={filters.dept_id}
              onChange={e => setFilters(previous => ({ ...previous, dept_id: e.target.value }))}
              style={{ width: 'auto', minWidth: 170, flex: '0 1 210px' }}>
              <option value="">Tüm departmanlar</option>
              {departments.map(department => <option key={department.id} value={department.id}>{department.name}</option>)}
            </select>
            <button type="button" className={`btn btn-sm ${showAdvancedFilters ? 'btn-primary' : 'btn-ghost'}`} aria-expanded={showAdvancedFilters} onClick={() => setShowAdvancedFilters(value => !value)}>
              ⚙ Gelişmiş Filtreler{activeFilterEntries.length ? ` (${activeFilterEntries.length})` : ''}
            </button>
            {hasActiveStaffFilter && <button type="button" className="btn btn-ghost btn-sm" onClick={clearAllFilters}>Filtreleri Sıfırla</button>}
            {canEdit && <button className="btn btn-primary btn-sm" onClick={openNew} style={{ marginLeft: 'auto' }}>+ Yeni Personel</button>}
          </div>

          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', alignItems: 'center' }}>
            <span style={{ color: 'var(--text3)', fontFamily: 'var(--mono)', fontSize: 8, marginRight: 3 }}>HIZLI ODAK</span>
            {FOCUS_FILTERS.map(option => {
              const active = filters.focus === option.key && !filters.risk
              return (
                <button key={option.key || 'all'} type="button" aria-pressed={active} onClick={() => setFilters(previous => ({ ...previous, focus: option.key, risk: '' }))}
                  style={{
                    border: `1px solid ${active ? 'var(--blue)' : 'var(--border)'}`, borderRadius: 999, padding: '5px 9px',
                    background: active ? 'rgba(59,140,240,.13)' : 'var(--surface2)', color: active ? 'var(--blue)' : 'var(--text2)',
                    cursor: 'pointer', fontSize: 10, display: 'inline-flex', gap: 6, alignItems: 'center',
                  }}>
                  {option.label}<strong style={{ fontFamily: 'var(--mono)', fontSize: 8 }}>{quickFocusCounts[option.key] || 0}</strong>
                </button>
              )
            })}
          </div>

          {activeFilterEntries.length > 0 && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, padding: '8px 10px', borderRadius: 8, background: 'rgba(59,140,240,.06)', border: '1px dashed rgba(59,140,240,.25)' }}>
              <span style={{ color: 'var(--text3)', fontFamily: 'var(--mono)', fontSize: 8, alignSelf: 'center' }}>AKTİF</span>
              {activeFilterEntries.map(([key, label]) => (
                <button key={key} type="button" onClick={() => setFilters(previous => ({ ...previous, [key]: key === 'is_active' ? '1' : '' }))}
                  title={`${label} filtresini kaldır`} style={{ border: 0, borderRadius: 6, background: 'rgba(59,140,240,.14)', color: 'var(--blue)', padding: '4px 7px', cursor: 'pointer', fontSize: 9 }}>
                  {label} ×
                </button>
              ))}
            </div>
          )}

          {showAdvancedFilters && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(155px, 1fr))', gap: 9, padding: 12, borderRadius: 10, background: 'var(--surface2)', border: '1px solid var(--border)' }}>
              <select aria-label="Rol filtresi" className="form-select" value={filters.role_id} onChange={e => setFilters(p => ({ ...p, role_id: e.target.value }))}>
                <option value="">Tüm roller</option>
                {staffRoles.map(role => <option key={role.id} value={role.id}>{role.name}</option>)}
              </select>
              <select aria-label="Lokasyon filtresi" className="form-select" value={filters.work_location_id} onChange={e => setFilters(p => ({ ...p, work_location_id: e.target.value }))}>
                <option value="">Tüm lokasyonlar</option>
                {workLocations.map(location => <option key={location.id} value={location.id}>{location.name}</option>)}
              </select>
              <select aria-label="Risk filtresi" className="form-select" value={filters.risk} onChange={e => setFilters(p => ({ ...p, risk: e.target.value, focus: '' }))}>
                <option value="">Tüm riskler</option>
                <option value="any">Riski olanlar</option>
                <option value="documents">Belge eksiği / süresi</option>
                <option value="followups">Açık / gecikmiş görev</option>
                <option value="attendance">Devam problemi</option>
                <option value="equipment">Aktif zimmet / KKD</option>
                <option value="certificates">Sertifika süresi</option>
                <option value="checklists">Açık giriş / çıkış süreci</option>
                <option value="assignment">Atama eksiği</option>
                <option value="contract">Sözleşme bitişi</option>
              </select>
              <select aria-label="Cinsiyet filtresi" className="form-select" value={filters.gender} onChange={e => setFilters(p => ({ ...p, gender: e.target.value }))}>
                <option value="">Tüm cinsiyetler</option>
                <option value="female">Kadın</option>
                <option value="male">Erkek</option>
              </select>
              <select aria-label="Durum filtresi" className="form-select" value={filters.is_active} onChange={e => setFilters(p => ({ ...p, is_active: e.target.value }))}>
                <option value="1">Aktif personel</option>
                <option value="0">Pasif personel</option>
                <option value="">Aktif + pasif</option>
              </select>
              <select aria-label="Personel sıralaması" className="form-select" value={`${sort.key}:${sort.direction}`} onChange={e => {
                const [key, direction] = e.target.value.split(':')
                setSort({ key, direction })
              }}>
                <option value="name:asc">Ada göre A-Z</option>
                <option value="name:desc">Ada göre Z-A</option>
                <option value="risk:desc">Risk en yüksek</option>
                <option value="documents:desc">Belge eksiği en yüksek</option>
                <option value="followups:desc">Görev sayısı en yüksek</option>
                <option value="hire_date:desc">İşe giriş en yeni</option>
              </select>
            </div>
          )}

          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center' }}>
            <span style={{ color: 'var(--text3)', fontFamily: 'var(--mono)', fontSize: 8, marginRight: 3 }}>HAZIR GÖRÜNÜM</span>
            {VIEW_PROFILES.map(profile => (
              <button key={profile.key} type="button" aria-pressed={viewProfile === profile.key} title={profile.description} onClick={() => applyViewProfile(profile)}
                className={`btn btn-xs ${viewProfile === profile.key ? 'btn-primary' : 'btn-ghost'}`}>
                {profile.label}
              </button>
            ))}
            {viewProfile === 'custom' && <span style={{ color: 'var(--purple)', fontFamily: 'var(--mono)', fontSize: 8 }}>ÖZEL DÜZEN</span>}
          </div>

          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', alignItems: 'center', borderTop: '1px solid var(--border)', paddingTop: '10px' }}>
            <div style={{ display: 'flex', border: '1px solid var(--border)', borderRadius: '7px', overflow: 'hidden' }}>
              <button aria-pressed={viewMode === 'table'} className={`btn btn-xs ${viewMode === 'table' ? 'btn-primary' : 'btn-ghost'}`} onClick={() => { setViewMode('table'); setViewProfile('custom') }}>Tablo</button>
              <button aria-pressed={viewMode === 'cards'} className={`btn btn-xs ${viewMode === 'cards' ? 'btn-primary' : 'btn-ghost'}`} onClick={() => { setViewMode('cards'); setViewProfile('custom') }}>Kartlar</button>
            </div>
            <div style={{ display: 'flex', border: '1px solid var(--border)', borderRadius: '7px', overflow: 'hidden' }}>
              <button aria-pressed={density === 'compact'} className={`btn btn-xs ${density === 'compact' ? 'btn-primary' : 'btn-ghost'}`} onClick={() => { setDensity('compact'); setViewProfile('custom') }}>Sıkı</button>
              <button aria-pressed={density === 'comfortable'} className={`btn btn-xs ${density === 'comfortable' ? 'btn-primary' : 'btn-ghost'}`} onClick={() => { setDensity('comfortable'); setViewProfile('custom') }}>Rahat</button>
            </div>
            <label style={{ display: 'inline-flex', gap: 6, alignItems: 'center', fontSize: 10, cursor: 'pointer', padding: '4px 7px', border: '1px solid var(--border)', borderRadius: 7 }}>
              <input type="checkbox" checked={groupByDepartment} onChange={e => { setGroupByDepartment(e.target.checked); setViewProfile('custom') }} /> Bölüme göre grupla
            </label>
            <details style={{ position: 'relative' }}>
              <summary className="btn btn-ghost btn-xs" style={{ listStyle: 'none', cursor: 'pointer' }}>Kolonlar</summary>
              <div style={{
                position: 'absolute', zIndex: 20, top: '32px', left: 0, minWidth: '190px',
                padding: '10px', border: '1px solid var(--border)', borderRadius: '8px',
                background: 'var(--surface)', boxShadow: '0 12px 30px rgba(0,0,0,.28)',
              }}>
                {DIRECTORY_COLUMNS.map(column => (
                  <label key={column.key} style={{ display: 'flex', gap: '8px', alignItems: 'center', padding: '5px', fontSize: '11px' }}>
                    <input type="checkbox" checked={visibleColumns.includes(column.key)} onChange={() => toggleColumn(column.key)} />
                    {column.label}
                  </label>
                ))}
              </div>
            </details>
            <button className="btn btn-ghost btn-xs" onClick={exportSelectedCsv} disabled={!filteredAndSorted.length}>CSV Listesi</button>
            <button className="btn btn-primary btn-xs" onClick={exportSelectedExcel} disabled={!filteredAndSorted.length}>Detaylı Excel</button>
            <span aria-live="polite" style={{ color: 'var(--text3)', fontFamily: 'var(--mono)', fontSize: '9px', marginLeft: 'auto' }}>
              {filteredAndSorted.length} sonuç · {selected.size} seçili
            </span>
          </div>
        </div>
      </div>

      {selected.size > 0 && (
        <div style={{
          position: 'sticky', top: 8, zIndex: 12, marginBottom: '12px', padding: '10px 12px', borderRadius: '10px',
          border: '1px solid rgba(59,140,240,.35)', background: 'rgba(59,140,240,.08)',
          backdropFilter: 'blur(12px)', display: 'flex', flexWrap: 'wrap', gap: '8px', alignItems: 'center',
        }}>
          <strong style={{ fontSize: '12px' }}>{selected.size} personel seçildi</strong>
          <button className="btn btn-ghost btn-xs" onClick={togglePage}>{pageAllSelected ? 'Sayfa Seçimini Kaldır' : 'Sayfadakileri Seç'}</button>
          <button className="btn btn-ghost btn-xs" onClick={toggleAllFiltered}>{filteredAllSelected ? 'Tüm Sonuçları Bırak' : `${filteredAndSorted.length} Sonucun Tümünü Seç`}</button>
          <button className="btn btn-ghost btn-xs" onClick={invertPageSelection}>Sayfa Seçimini Ters Çevir</button>
          {selected.size >= 2 && (
            <button className="btn btn-primary btn-xs" onClick={() => setShowCompare(true)} disabled={selected.size > 4}
              title={selected.size > 4 ? 'Karşılaştırmak için en fazla 4 personel seçin' : 'Seçili personelleri yan yana karşılaştır'}>
              {selected.size > 4 ? 'Karşılaştırma için 2–4 kişi seçin' : `${selected.size} Kişiyi Karşılaştır`}
            </button>
          )}
          <button className="btn btn-primary btn-xs" onClick={() => setShowBulkAssignment(true)}>Proje / Departman / Lokasyon Ata</button>
          <button className="btn btn-ghost btn-xs" onClick={exportSelectedCsv}>Seçilileri CSV Al</button>
          <button className="btn btn-primary btn-xs" onClick={exportSelectedExcel}>Seçilileri Excel Al</button>
          {canDeactivate && <button className="btn btn-danger btn-xs" onClick={deactivateSelected} disabled={bulkDeactivateMut.isPending}>Toplu Pasifleştir</button>}
          <button className="btn btn-ghost btn-xs" onClick={() => setSelected(new Set())} style={{ marginLeft: 'auto' }}>Seçimi Temizle</button>
        </div>
      )}

      {isLoading ? (
        <SkeletonGrid count={6} minWidth={260} />
      ) : filteredAndSorted.length === 0 ? (
        <div className="empty-state">
          <div className="empty-icon">👥</div>
          <div className="empty-title">PERSONEL BULUNAMADI</div>
          <div className="empty-sub">Arama ve risk filtrelerini değiştirerek yeniden deneyin.</div>
        </div>
      ) : viewMode === 'table' ? (
        <div className="panel" style={{ overflow: 'hidden' }}>
          <div style={{ overflowX: 'auto' }}>
            <table className={`data-table staff-directory-table ${density === 'compact' ? 'staff-directory-table--compact' : ''}`} style={{ minWidth: '1040px', fontSize: '10px' }}>
              <thead style={{ position: 'sticky', top: 0, zIndex: 3, background: 'var(--surface)' }}>
                <tr>
                  <th style={{ width: 34 }}><input aria-label="Sayfadaki personeli seç" type="checkbox" checked={pageAllSelected} onChange={togglePage} /></th>
                  <th>PERSONEL / RİSKLER</th>
                  {visibleColumns.includes('assignment') && <th>PROJE / GÖREV / TAM KONUM</th>}
                  {visibleColumns.includes('contact') && <th>İLETİŞİM</th>}
                  {visibleColumns.includes('today') && <th>BUGÜN</th>}
                  {visibleColumns.includes('leave') && <th>YILLIK İZİN</th>}
                  {visibleColumns.includes('documents') && <th>BELGELER</th>}
                  {visibleColumns.includes('followups') && <th>GÖREVLER</th>}
                  {visibleColumns.includes('equipment') && <th>AKTİF ZİMMET</th>}
                  {visibleColumns.includes('performance') && <th>PERFORMANS</th>}
                  {visibleColumns.includes('status') && <th>DURUM</th>}
                  <th>İŞLEM</th>
                </tr>
              </thead>
              <tbody>
                {pageGroups.map(group => (
                  <Fragment key={group.key}>
                    {group.label && (
                      <tr className="staff-directory-group-row">
                        <td colSpan={visibleColumnCount}>
                          <span>{group.label}</span>
                          <strong>{group.rows.length} kişi</strong>
                        </td>
                      </tr>
                    )}
                    {group.rows.map(staff => {
                  const dc = deptColor(staff.dept_color)
                  return (
                    <tr key={staff.id} onClick={() => onPersonClick?.(staff.id)} style={{ cursor: 'pointer' }}>
                      <td onClick={event => event.stopPropagation()}>
                        <input aria-label={`${staff.full_name} seç`} type="checkbox" checked={selected.has(staff.id)} onChange={() => toggleSelected(staff.id)} />
                      </td>
                      <td style={{ minWidth: '220px' }}>
                        <div style={{ display: 'flex', gap: '9px', alignItems: 'flex-start' }}>
                          <div style={{
                            width: 34, height: 34, borderRadius: '50%', flexShrink: 0,
                            background: staff.gender === 'female' ? 'rgba(244,114,182,.18)' : 'rgba(59,140,240,.18)',
                            color: staff.gender === 'female' ? '#f472b6' : 'var(--blue)',
                            display: 'grid', placeItems: 'center', fontFamily: 'var(--display)', fontSize: '15px',
                          }}>{staff.full_name?.charAt(0)?.toUpperCase() || '?'}</div>
                          <div style={{ minWidth: 0 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginBottom: 2 }}>
                              <button type="button" aria-label={`${staff.full_name} ${favoriteIds.includes(staff.id) ? 'favorilerden çıkar' : 'favorilere ekle'}`}
                                title={favoriteIds.includes(staff.id) ? 'Favorilerden çıkar' : 'Favorilere ekle'} onClick={event => { event.stopPropagation(); toggleFavorite(staff.id) }}
                                style={{ border: 0, background: 'transparent', color: favoriteIds.includes(staff.id) ? 'var(--accent)' : 'var(--text3)', padding: 0, cursor: 'pointer', fontSize: 14 }}>
                                {favoriteIds.includes(staff.id) ? '★' : '☆'}
                              </button>
                              <div style={{ fontWeight: 700, color: 'var(--text)' }}>{staff.full_name}</div>
                            </div>
                            <div style={{ color: 'var(--text3)', marginBottom: '5px' }}>{staff.position || 'Pozisyon belirtilmemiş'}{staff.tc_no ? ` · ${staff.tc_no}` : ''}</div>
                            <RiskBadges staff={staff} compact />
                          </div>
                        </div>
                      </td>
                      {visibleColumns.includes('assignment') && (
                        <td>
                          <div style={{ marginBottom: 5 }}><ProjectBadge project={staff} /></div>
                          <div><span style={{ color: dc.text, fontWeight: 700 }}>{staff.dept_name || 'Departman yok'}</span></div>
                          <div style={{ color: 'var(--text2)', marginTop: '3px' }}>{staff.role_name || 'Rol yok'}</div>
                          <div title={organizationPath(staff)} style={{ color: 'var(--text3)', marginTop: '3px', maxWidth: 210, lineHeight: 1.45 }}>
                            {fullWorkLocation(staff)}
                          </div>
                        </td>
                      )}
                      {visibleColumns.includes('contact') && (
                        <td>
                          <div>{staff.phone || '—'}</div>
                          <div style={{ color: 'var(--text3)', marginTop: '3px', maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis' }}>{staff.email || 'E-posta yok'}</div>
                        </td>
                      )}
                      {visibleColumns.includes('today') && (
                        <td>
                          <div style={{ fontWeight: 700 }}>{staff.today_shift_name || (staff.today_status === 'on_leave' ? 'İzinli' : 'Plan yok')}</div>
                          <div style={{ color: 'var(--text3)', marginTop: '3px' }}>{staff.today_status || '—'}</div>
                          {staff.next_shift_date && <div style={{ color: 'var(--blue)', marginTop: '3px' }}>Sonraki: {staff.next_shift_date}</div>}
                        </td>
                      )}
                      {visibleColumns.includes('leave') && (
                        <td>
                          {staff.annual_leave_started ? (
                            <>
                              <div style={{ fontFamily: 'var(--display)', fontSize: '16px', color: numberValue(staff.annual_leave_remaining) > 0 ? 'var(--green)' : 'var(--red)' }}>
                                {numberValue(staff.annual_leave_remaining)}g
                              </div>
                              <div style={{ color: 'var(--text3)', marginTop: '2px' }}>/ {numberValue(staff.annual_leave_entitled)}g hak</div>
                            </>
                          ) : (
                            <div style={{ color: 'var(--text3)' }}>{staff.hire_date ? 'Hak doğmadı' : 'Giriş tarihi yok'}</div>
                          )}
                        </td>
                      )}
                      {visibleColumns.includes('documents') && (
                        <td>
                          <div style={{ color: numberValue(staff.missing_documents) ? 'var(--accent)' : 'var(--green)' }}>{numberValue(staff.missing_documents)} eksik</div>
                          <div style={{ color: numberValue(staff.expired_documents) ? 'var(--red)' : 'var(--text3)', marginTop: '3px' }}>{numberValue(staff.expired_documents)} süresi dolmuş</div>
                        </td>
                      )}
                      {visibleColumns.includes('followups') && (
                        <td>
                          <div>{numberValue(staff.open_followups)} açık</div>
                          <div style={{ color: numberValue(staff.overdue_followups) ? 'var(--red)' : 'var(--text3)', marginTop: '3px' }}>{numberValue(staff.overdue_followups)} gecikmiş</div>
                        </td>
                      )}
                      {visibleColumns.includes('equipment') && (
                        <td>
                          <div style={{ fontFamily: 'var(--display)', fontSize: '16px', color: numberValue(staff.equipment_count) ? 'var(--accent)' : 'var(--text3)' }}>
                            {numberValue(staff.equipment_count)}
                          </div>
                          <div style={{ color: 'var(--text3)', marginTop: '2px' }}>
                            {numberValue(staff.active_inventory)} env · {numberValue(staff.active_kkd)} KKD · {numberValue(staff.active_uniform)} kıyafet
                          </div>
                        </td>
                      )}
                      {visibleColumns.includes('performance') && (
                        <td>
                          <div style={{ fontFamily: 'var(--display)', fontSize: '16px', color: staff.latest_performance_score ? 'var(--blue)' : 'var(--text3)' }}>
                            {staff.latest_performance_score ?? '—'}
                          </div>
                          <div style={{ color: 'var(--text3)', marginTop: '2px' }}>son puan</div>
                        </td>
                      )}
                      {visibleColumns.includes('status') && (
                        <td>
                          <span className={`badge ${staff.is_active ? 'badge-green' : 'badge-gray'}`}>{staff.is_active ? 'Aktif' : 'Pasif'}</span>
                          {staff.hire_date && <div style={{ color: 'var(--text3)', marginTop: '5px' }}>Giriş: {staff.hire_date}</div>}
                        </td>
                      )}
                      <td onClick={event => event.stopPropagation()}>
                        <div style={{ display: 'flex', gap: '4px' }}>
                          <button className="btn btn-ghost btn-xs" onClick={() => onPersonClick?.(staff.id)}>Dosya</button>
                          {canEdit && <button className="btn btn-ghost btn-xs" onClick={() => openEdit(staff)}>Düzenle</button>}
                          {canDeactivate && staff.is_active === 1 && <button className="btn btn-danger btn-xs" onClick={() => deactivateOne(staff)}>Pasif</button>}
                        </div>
                      </td>
                    </tr>
                  )
                    })}
                  </Fragment>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        <div style={{ display: 'grid', gap: 14 }}>
          {pageGroups.map(group => (
            <section key={group.key}>
              {group.label && (
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8, padding: '7px 10px', borderRadius: 8, background: 'rgba(59,140,240,.08)', borderLeft: '3px solid var(--blue)' }}>
                  <strong style={{ color: 'var(--blue)', fontSize: 11 }}>{group.label}</strong>
                  <span style={{ color: 'var(--text3)', fontFamily: 'var(--mono)', fontSize: 8 }}>{group.rows.length} kişi</span>
                </div>
              )}
              <div style={{ display: 'grid', gridTemplateColumns: `repeat(auto-fill, minmax(${density === 'compact' ? 255 : 285}px, 1fr))`, gap: density === 'compact' ? 8 : 12 }}>
          {group.rows.map(staff => {
            const dc = deptColor(staff.dept_color)
            return (
              <article key={staff.id} onClick={() => onPersonClick?.(staff.id)} style={{
                background: 'var(--surface)', border: selected.has(staff.id) ? '1px solid var(--blue)' : '1px solid var(--border)',
                borderRadius: '14px', overflow: 'hidden', cursor: 'pointer',
              }}>
                <div style={{ height: 4, background: dc.bg || 'var(--border)' }} />
                <div style={{ padding: density === 'compact' ? '10px' : '14px' }}>
                  <div style={{ display: 'flex', gap: '10px', alignItems: 'flex-start' }}>
                    <input aria-label={`${staff.full_name} seç`} type="checkbox" checked={selected.has(staff.id)}
                      onClick={event => event.stopPropagation()} onChange={() => toggleSelected(staff.id)} />
                    <div style={{
                      width: 42, height: 42, borderRadius: '50%', flexShrink: 0,
                      background: staff.gender === 'female' ? 'rgba(244,114,182,.18)' : 'rgba(59,140,240,.18)',
                      color: staff.gender === 'female' ? '#f472b6' : 'var(--blue)',
                      display: 'grid', placeItems: 'center', fontFamily: 'var(--display)', fontSize: '18px',
                    }}>{staff.full_name?.charAt(0)?.toUpperCase() || '?'}</div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                        <button type="button" aria-label={`${staff.full_name} ${favoriteIds.includes(staff.id) ? 'favorilerden çıkar' : 'favorilere ekle'}`}
                          title={favoriteIds.includes(staff.id) ? 'Favorilerden çıkar' : 'Favorilere ekle'} onClick={event => { event.stopPropagation(); toggleFavorite(staff.id) }}
                          style={{ border: 0, background: 'transparent', color: favoriteIds.includes(staff.id) ? 'var(--accent)' : 'var(--text3)', padding: 0, cursor: 'pointer', fontSize: 16 }}>
                          {favoriteIds.includes(staff.id) ? '★' : '☆'}
                        </button>
                        <div style={{ fontWeight: 700, fontSize: '14px' }}>{staff.full_name}</div>
                      </div>
                      <div style={{ color: 'var(--text3)', fontSize: '10px', marginTop: '3px' }}>{staff.position || 'Pozisyon belirtilmemiş'}</div>
                      <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap', marginTop: '7px' }}>
                        <ProjectBadge project={staff} />
                        <span style={{ padding: '2px 7px', borderRadius: 12, background: dc.bg, color: dc.text, fontSize: '9px' }}>{staff.dept_name || 'Departman yok'}</span>
                        <span style={{ padding: '2px 7px', borderRadius: 12, background: 'var(--surface2)', color: 'var(--text2)', fontSize: '9px' }}>{staff.role_name || 'Rol yok'}</span>
                      </div>
                    </div>
                  </div>
                  <div style={{ marginTop: '12px' }}><RiskBadges staff={staff} /></div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '6px', marginTop: '12px' }}>
                    {[
                      [numberValue(staff.missing_documents), 'Eksik belge'],
                      [numberValue(staff.open_followups), 'Açık görev'],
                      [numberValue(staff.open_attendance_exceptions), 'Devam'],
                      [numberValue(staff.equipment_count), 'Zimmet'],
                    ].map(([value, label]) => (
                      <div key={label} style={{ padding: '7px 5px', textAlign: 'center', background: 'var(--surface2)', borderRadius: '7px' }}>
                        <div style={{ fontFamily: 'var(--display)', fontSize: '15px' }}>{value}</div>
                        <div style={{ color: 'var(--text3)', fontFamily: 'var(--mono)', fontSize: '7px', marginTop: '2px' }}>{label}</div>
                      </div>
                    ))}
                  </div>
                  <div style={{ marginTop: '10px', paddingTop: '9px', borderTop: '1px solid var(--border)', display: 'grid', gap: 4, color: 'var(--text3)', fontSize: '10px' }}>
                    <div title={organizationPath(staff)}><strong style={{ color: 'var(--text2)' }}>Tam konum:</strong> {organizationPath(staff)}</div>
                    <div><strong style={{ color: 'var(--text2)' }}>İletişim:</strong> {staff.phone || 'Telefon yok'}{staff.email ? ` · ${staff.email}` : ''}</div>
                  </div>
                  <div style={{ display: 'flex', gap: '6px', marginTop: '10px' }} onClick={event => event.stopPropagation()}>
                    <button className="btn btn-primary btn-xs" style={{ flex: 1 }} onClick={() => onPersonClick?.(staff.id)}>Personel Dosyası</button>
                    {canEdit && <button className="btn btn-ghost btn-xs" onClick={() => openEdit(staff)}>Düzenle</button>}
                    {canDeactivate && staff.is_active === 1 && <button className="btn btn-danger btn-xs" onClick={() => deactivateOne(staff)}>Pasif</button>}
                  </div>
                </div>
              </article>
            )
          })}
              </div>
            </section>
          ))}
        </div>
      )}

      {!isLoading && filteredAndSorted.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'center', gap: '8px', marginTop: '14px' }}>
          <div style={{ color: 'var(--text3)', fontFamily: 'var(--mono)', fontSize: '9px' }}>
            {(page - 1) * pageSize + 1}-{Math.min(page * pageSize, filteredAndSorted.length)} / {filteredAndSorted.length}
          </div>
          <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
            <select className="form-select" value={pageSize} onChange={e => setPageSize(Number(e.target.value))} style={{ width: 'auto', padding: '5px 8px', fontSize: '10px' }}>
              <option value={10}>10 / sayfa</option>
              <option value={20}>20 / sayfa</option>
              <option value={50}>50 / sayfa</option>
              <option value={100}>100 / sayfa</option>
            </select>
            <button className="btn btn-ghost btn-xs" disabled={page <= 1} onClick={() => setPage(value => value - 1)}>Önceki</button>
            <span style={{ fontFamily: 'var(--mono)', fontSize: '9px' }}>{page} / {totalPages}</span>
            <button className="btn btn-ghost btn-xs" disabled={page >= totalPages} onClick={() => setPage(value => value + 1)}>Sonraki</button>
          </div>
        </div>
      )}

      {showForm && (
        <StaffFormSheet
          editStaff={editStaff}
          form={form}
          setForm={setForm}
          handleSubmit={handleSubmit}
          createMut={createMut}
          updateMut={updateMut}
          departments={departments}
          staffRoles={staffRoles}
          workLocations={workLocations}
          canViewSensitive={canViewSensitive}
          onClose={() => { setShowForm(false); setEditStaff(null) }}
        />
      )}
      {showBulkAssignment && (
        <BulkAssignmentSheet
          count={selected.size}
          projects={projects}
          departments={departments}
          roles={staffRoles}
          workLocations={workLocations}
          isPending={bulkAssignmentMut.isPending}
          onSubmit={data => bulkAssignmentMut.mutate(data)}
          onClose={() => setShowBulkAssignment(false)}
        />
      )}
      {showCompare && (
        <StaffCompareSheet staffRows={selectedStaffRows} onPersonClick={onPersonClick} onClose={() => setShowCompare(false)} />
      )}
    </div>
  )
}
