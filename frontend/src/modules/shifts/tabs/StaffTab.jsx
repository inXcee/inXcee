import { useState, useEffect, useMemo } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import api from '../../../shared/api/client.js'
import { useAuthStore } from '../../../shared/store/authStore.js'
import { confirmDialog } from '../../../shared/components/ConfirmDialog.jsx'
import { useDebounce } from '../../../shared/hooks/useDebounce.js'
import { useSavedFilters, SavedFiltersBar } from '../../../shared/hooks/useSavedFilters.jsx'
import { SkeletonGrid } from '../../../shared/components/Skeleton.jsx'
import { toastErr, deptColor, BottomSheet } from '../shared.jsx'

function localIsoDate() {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
}

function StaffQualityPanel({ quality, onEdit }) {
  const [open, setOpen] = useState(true)
  const summary = quality?.summary || {}
  const rows = Array.isArray(quality?.rows) ? quality.rows : []
  const byCode = summary.by_code || {}
  const metrics = [
    ['Sorunlu Personel', summary.staff_with_issues || 0, 'var(--red)'],
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

function StaffFormSheet({ editStaff, form, setForm, handleSubmit, createMut, updateMut, departments, staffRoles = [], workLocations = [], onClose }) {
  const [tab, setTab] = useState('temel')
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
            <div>
              <label className="form-label">TC Kimlik No</label>
              <input className="form-input" value={form.tc_no || ''} maxLength={11}
                onChange={e => setForm(p => ({ ...p, tc_no: e.target.value }))} />
            </div>
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
export default function StaffTab({ departments, onPersonClick }) {
  const qc = useQueryClient()
  const user = useAuthStore(s => s.user)
  const canEdit = ['campus_manager', 'shift_supervisor'].includes(user?.role)

  const [filters, setFilters] = useState({ dept_id: '', role_id: '', gender: '', search: '', is_active: '1' })
  const [showForm, setShowForm] = useState(false)
  const [editStaff, setEditStaff] = useState(null)
  const [form, setForm] = useState({})

  const staffSavedFilters = useSavedFilters('shifts-staff', filters, setFilters)
  const hasActiveStaffFilter = !!(filters.dept_id || filters.role_id || filters.gender || filters.search || filters.is_active !== '1')

  const debouncedSearch = useDebounce(filters.search, 300)
  const effectiveFilters = useMemo(
    () => ({ ...filters, search: debouncedSearch }),
    [filters.dept_id, filters.role_id, filters.gender, filters.is_active, debouncedSearch]
  )

  const { data: staffList = [], isLoading } = useQuery({
    queryKey: ['staff-list', effectiveFilters],
    queryFn: () => api.get('/shifts/staff', { params: { ...effectiveFilters, is_active: effectiveFilters.is_active || undefined } }).then(r => r.data),
  })

  const { data: staffRoles = [] } = useQuery({
    queryKey: ['shift-roles'],
    queryFn: () => api.get('/shifts/roles').then(r => r.data),
  })

  const { data: workLocations = [] } = useQuery({
    queryKey: ['shift-work-locations'],
    queryFn: () => api.get('/shifts/work-locations').then(r => r.data),
  })

  const { data: staffQuality = { summary: {}, rows: [] } } = useQuery({
    queryKey: ['staff-quality'],
    queryFn: () => api.get('/shifts/staff/quality').then(r => r.data),
  })

  // Personel (dept/rol/aktiflik) değişikliği açık çizelgeyi/kırılımı da tazelesin — çizelge 'staff-list-active' kullanır
  const refreshPlan = () => {
    const keys = ['staff-list', 'staff-list-active', 'staff-detail', 'staff-quality', 'schedule', 'departments-summary', 'shift-breakdown', 'shift-coverage']
    keys.forEach(k => qc.invalidateQueries({ queryKey: [k] }))
  }

  const createMut = useMutation({
    mutationFn: data => api.post('/shifts/staff', data),
    onSuccess: () => {
      refreshPlan()
      setShowForm(false)
      setForm({})
    },
    onError: toastErr,
  })

  const updateMut = useMutation({
    mutationFn: ({ id, ...data }) => api.put(`/shifts/staff/${id}`, data),
    onSuccess: () => {
      refreshPlan()
      setEditStaff(null)
      setForm({})
    },
    onError: toastErr,
  })

  const deleteMut = useMutation({
    mutationFn: id => api.delete(`/shifts/staff/${id}`),
    onSuccess: refreshPlan,
  })

  const openNew = () => {
    setForm({
      full_name: '', tc_no: '', phone: '', email: '', position: '', department_id: '', role_id: '',
      hire_date: '', birth_date: '', address: '', emergency_contact: '', emergency_phone: '',
      blood_type: '', gender: 'male', salary: '', iban: '', notes: '', is_active: 1,
      primary_work_location_id: '', assignment_effective_from: localIsoDate(), assignment_note: '',
    })
    setEditStaff(null)
    setShowForm(true)
  }

  const openEdit = (s) => {
    setForm({
      full_name: s.full_name || '', tc_no: s.tc_no || '', phone: s.phone || '', email: s.email || '',
      position: s.position || '', department_id: s.department_id?.toString() || '', role_id: s.role_id?.toString() || '',
      hire_date: s.hire_date || '', birth_date: s.birth_date || '', address: s.address || '',
      emergency_contact: s.emergency_contact || '', emergency_phone: s.emergency_phone || '',
      blood_type: s.blood_type || '', gender: s.gender || 'male', salary: s.salary?.toString() || '',
      iban: s.iban || '', notes: s.notes || '', is_active: s.is_active,
      primary_work_location_id: s.primary_work_location_id?.toString() || '',
      assignment_effective_from: localIsoDate(), assignment_note: '',
    })
    setEditStaff(s)
    setShowForm(true)
  }

  const handleSubmit = () => {
    const payload = {
      ...form,
      department_id: form.department_id ? parseInt(form.department_id) : null,
      role_id: form.role_id ? parseInt(form.role_id) : null,
      primary_work_location_id: form.primary_work_location_id ? parseInt(form.primary_work_location_id) : null,
      salary: form.salary ? parseFloat(form.salary) : null,
      is_active: form.is_active ? 1 : 0,
    }
    if (editStaff) {
      updateMut.mutate({ id: editStaff.id, ...payload })
    } else {
      createMut.mutate(payload)
    }
  }

  // Group by department for summary
  const deptCounts = useMemo(() => {
    const counts = {}
    staffList.forEach(s => {
      const name = s.dept_name || 'Atanmamis'
      counts[name] = (counts[name] || 0) + 1
    })
    return counts
  }, [staffList])

  const maleCount = staffList.filter(s => s.gender === 'male').length
  const femaleCount = staffList.filter(s => s.gender === 'female').length

  return (
    <div className="fade-up">
      {/* Summary cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(130px, 1fr))', gap: '10px', marginBottom: '20px' }}>
        <div style={{ padding: '16px 18px', background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: '12px', borderLeft: '3px solid var(--text2)' }}>
          <div style={{ fontFamily: 'var(--display)', fontSize: '28px', color: 'var(--text)', lineHeight: 1 }}>{staffList.length}</div>
          <div style={{ fontFamily: 'var(--mono)', fontSize: '8px', color: 'var(--text3)', letterSpacing: '1px', marginTop: '6px' }}>TOPLAM PERSONEL</div>
        </div>
        <div style={{ padding: '16px 18px', background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: '12px', borderLeft: '3px solid var(--blue)' }}>
          <div style={{ fontFamily: 'var(--display)', fontSize: '28px', color: 'var(--blue)', lineHeight: 1 }}>{maleCount}</div>
          <div style={{ fontFamily: 'var(--mono)', fontSize: '8px', color: 'var(--text3)', letterSpacing: '1px', marginTop: '6px' }}>ERKEK</div>
        </div>
        <div style={{ padding: '16px 18px', background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: '12px', borderLeft: '3px solid #f472b6' }}>
          <div style={{ fontFamily: 'var(--display)', fontSize: '28px', color: '#f472b6', lineHeight: 1 }}>{femaleCount}</div>
          <div style={{ fontFamily: 'var(--mono)', fontSize: '8px', color: 'var(--text3)', letterSpacing: '1px', marginTop: '6px' }}>KADIN</div>
        </div>
        <div style={{ padding: '16px 18px', background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: '12px', borderLeft: '3px solid var(--green)' }}>
          <div style={{ fontFamily: 'var(--display)', fontSize: '28px', color: 'var(--green)', lineHeight: 1 }}>{Object.keys(deptCounts).length}</div>
          <div style={{ fontFamily: 'var(--mono)', fontSize: '8px', color: 'var(--text3)', letterSpacing: '1px', marginTop: '6px' }}>DEPARTMAN</div>
        </div>
      </div>

      <StaffQualityPanel quality={staffQuality} onEdit={openEdit} />

      {/* Filters */}
      <SavedFiltersBar
        presets={staffSavedFilters.presets}
        onApply={staffSavedFilters.apply}
        onSave={staffSavedFilters.save}
        onRemove={staffSavedFilters.remove}
        hasActiveFilter={hasActiveStaffFilter}
      />
      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '8px', marginBottom: '16px' }}>
        <input
          className="form-input"
          placeholder="Ad, TC, telefon veya pozisyon ara..."
          value={filters.search}
          onChange={e => setFilters(p => ({ ...p, search: e.target.value }))}
          style={{ flex: '1 1 200px', maxWidth: '320px', padding: '6px 12px', fontSize: '12px' }}
        />
        <select className="form-select" value={filters.dept_id} onChange={e => setFilters(p => ({ ...p, dept_id: e.target.value }))}
          style={{ width: 'auto', minWidth: '140px', padding: '5px 11px', fontSize: '11px' }}>
          <option value="">Tum Bolumler</option>
          {departments.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
        </select>
        <select className="form-select" value={filters.role_id} onChange={e => setFilters(p => ({ ...p, role_id: e.target.value }))}
          style={{ width: 'auto', minWidth: '130px', padding: '5px 11px', fontSize: '11px' }}>
          <option value="">Tum Roller</option>
          {staffRoles.map(role => <option key={role.id} value={role.id}>{role.name}</option>)}
        </select>
        <select className="form-select" value={filters.gender} onChange={e => setFilters(p => ({ ...p, gender: e.target.value }))}
          style={{ width: 'auto', padding: '5px 11px', fontSize: '11px' }}>
          <option value="">Tum Cinsiyet</option>
          <option value="male">Erkek</option>
          <option value="female">Kadin</option>
        </select>
        <select className="form-select" value={filters.is_active} onChange={e => setFilters(p => ({ ...p, is_active: e.target.value }))}
          style={{ width: 'auto', padding: '5px 11px', fontSize: '11px' }}>
          <option value="1">Aktif</option>
          <option value="0">Pasif</option>
          <option value="">Tumunu</option>
        </select>
        {canEdit && (
          <button className="btn btn-primary btn-sm" onClick={openNew} style={{ marginLeft: 'auto' }}>
            + Yeni Personel
          </button>
        )}
      </div>

      {/* Staff card grid */}
      {isLoading ? (
        <SkeletonGrid count={6} minWidth={260} />
      ) : staffList.length === 0 ? (
        <div className="empty-state">
          <div className="empty-icon">👥</div>
          <div className="empty-title">PERSONEL YOK</div>
          <div className="empty-sub">Filtrelerinize uygun personel bulunamadı</div>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: '12px' }}>
          {staffList.map(s => {
            const dc = deptColor(s.dept_color)
            const avatarBg = s.gender === 'female' ? 'rgba(244,114,182,.18)' : 'rgba(59,140,240,.18)'
            const avatarColor = s.gender === 'female' ? '#f472b6' : 'var(--blue)'
            return (
              <div key={s.id} style={{
                background: 'var(--surface)', border: '1px solid var(--border)',
                borderRadius: '14px', overflow: 'hidden',
                transition: 'box-shadow .2s, transform .15s',
                cursor: 'pointer',
              }}
                onMouseEnter={e => { e.currentTarget.style.boxShadow = '0 8px 32px rgba(0,0,0,.25)'; e.currentTarget.style.transform = 'translateY(-2px)' }}
                onMouseLeave={e => { e.currentTarget.style.boxShadow = 'none'; e.currentTarget.style.transform = 'none' }}
              >
                {/* Card header — dept color stripe */}
                <div style={{ height: 4, background: dc.bg || 'var(--border)' }} />

                <div style={{ padding: '16px' }}>
                  {/* Avatar + name row */}
                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: '12px', marginBottom: '12px' }}>
                    <div
                      onClick={() => onPersonClick && onPersonClick(s.id)}
                      style={{
                        width: '46px', height: '46px', borderRadius: '50%', flexShrink: 0,
                        background: avatarBg, color: avatarColor,
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontFamily: 'var(--display)', fontSize: '20px', fontWeight: 700,
                      }}
                    >
                      {s.full_name?.charAt(0)?.toUpperCase() || '?'}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div
                        onClick={() => onPersonClick && onPersonClick(s.id)}
                        style={{ fontSize: '14px', fontWeight: 700, color: 'var(--text)', marginBottom: '3px', lineHeight: 1.2 }}
                      >
                        {s.full_name}
                      </div>
                      {s.position && (
                        <div style={{ fontSize: '11px', color: 'var(--text2)', marginBottom: '4px' }}>{s.position}</div>
                      )}
                      <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
                        {s.dept_name && (
                          <span style={{ padding: '2px 8px', borderRadius: '20px', fontSize: '9px', fontFamily: 'var(--mono)', fontWeight: 600, background: dc.bg, color: dc.text }}>
                            {s.dept_name}
                          </span>
                        )}
                        {s.role_name && (
                          <span style={{ padding: '2px 8px', borderRadius: '20px', fontSize: '9px', fontFamily: 'var(--mono)', fontWeight: 600, background: 'rgba(59,140,240,.10)', color: 'var(--blue)', border: '1px solid rgba(59,140,240,.25)' }}>
                            {s.role_name}
                          </span>
                        )}
                        {s.primary_work_location_name && (
                          <span style={{ padding: '2px 8px', borderRadius: '20px', fontSize: '9px', fontFamily: 'var(--mono)', fontWeight: 600, background: 'rgba(39,201,106,.10)', color: 'var(--green)', border: '1px solid rgba(39,201,106,.25)' }}>
                            {s.primary_work_location_name}
                          </span>
                        )}
                        <span style={{ padding: '2px 8px', borderRadius: '20px', fontSize: '9px', fontFamily: 'var(--mono)', fontWeight: 600, background: s.is_active ? 'rgba(39,201,106,.12)' : 'var(--surface2)', color: s.is_active ? 'var(--green)' : 'var(--text3)' }}>
                          {s.is_active ? 'AKTİF' : 'PASİF'}
                        </span>
                        {s.blood_type && (
                          <span style={{ padding: '2px 8px', borderRadius: '20px', fontSize: '9px', fontFamily: 'var(--mono)', background: 'rgba(231,76,60,.1)', color: 'var(--red)' }}>
                            {s.blood_type}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Info row */}
                  <div style={{ display: 'flex', gap: '12px', fontSize: '11px', color: 'var(--text3)', fontFamily: 'var(--mono)', borderTop: '1px solid var(--border)', paddingTop: '10px' }}>
                    {s.phone && <span>📞 {s.phone}</span>}
                    {s.hire_date && <span>📅 {new Date(s.hire_date).toLocaleDateString('tr-TR', { year: '2-digit', month: 'short' })}</span>}
                  </div>

                  {/* Actions */}
                  {canEdit && (
                    <div style={{ display: 'flex', gap: '6px', marginTop: '10px' }}>
                      <button
                        onClick={e => { e.stopPropagation(); openEdit(s) }}
                        style={{ flex: 1, padding: '6px', borderRadius: '8px', fontSize: '11px', cursor: 'pointer', background: 'var(--surface2)', border: '1px solid var(--border)', color: 'var(--text2)' }}
                      >✏️ Düzenle</button>
                      <button
                        onClick={async e => { e.stopPropagation(); if (await confirmDialog({ title: 'Personeli Pasifleştir', body: `${s.full_name} pasif yapılsın mı?`, confirmLabel: 'Pasifleştir', danger: true })) deleteMut.mutate(s.id) }}
                        style={{ padding: '6px 10px', borderRadius: '8px', fontSize: '11px', cursor: 'pointer', background: 'rgba(231,76,60,.1)', border: '1px solid rgba(231,76,60,.3)', color: 'var(--red)' }}
                      >Pasif</button>
                    </div>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Create/Edit Sheet */}
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
          onClose={() => { setShowForm(false); setEditStaff(null) }}
        />
      )}
    </div>
  )
}
