import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import api from '../../shared/api/client.js'
import { useProjects } from '../../shared/hooks/useProjects.js'
import { SkeletonCard } from '../../shared/components/Skeleton.jsx'
import {
  DossierActivity,
  DossierAnnualLeave,
  DossierField,
  DossierHeader,
  DossierMetric,
  DossierReadiness,
  DossierRisks,
  DossierSection,
  DossierUpcoming,
  DossierWorkMetrics,
  useStaffDossier,
} from '../personnel/dossier/StaffDossierShared.jsx'
import { BottomSheet, toastErr, toastOk } from './shared.jsx'
import '../personnel/StaffDossierPage.css'

function localIsoDate() {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
}

function EditField({ label, type = 'text', value, onChange }) {
  return (
    <div>
      <label className="form-label">{label}</label>
      <input className="form-input" type={type} value={value} aria-label={label} onChange={event => onChange(event.target.value)} />
    </div>
  )
}

function QuickEditForm({ person, departments, roles, projects, workLocations, isPending, onSave, onCancel }) {
  const [form, setForm] = useState(() => ({
    full_name: person.full_name || '', phone: person.phone || '', email: person.email || '',
    position: person.position || '', emergency_contact: person.emergency_contact || '',
    emergency_phone: person.emergency_phone || '', address: person.address || '',
    hire_date: (person.hire_date || '').slice(0, 10), birth_date: (person.birth_date || '').slice(0, 10),
    contract_end: (person.contract_end || '').slice(0, 10), blood_type: person.blood_type || '',
    gender: person.gender || '', department_id: person.department_id || '', role_id: person.role_id || '',
    project_id: person.project_id || '',
    primary_work_location_id: person.primary_work_location_id || '',
    assignment_effective_from: localIsoDate(), assignment_note: '',
  }))
  const set = (key, value) => setForm(prev => ({ ...prev, [key]: value }))
  const submit = () => onSave({
    ...form,
    project_id: form.project_id ? Number(form.project_id) : null,
    department_id: form.department_id ? Number(form.department_id) : null,
    role_id: form.role_id ? Number(form.role_id) : null,
    primary_work_location_id: form.primary_work_location_id ? Number(form.primary_work_location_id) : null,
  })
  return (
    <div style={{ display: 'grid', gap: 10 }}>
      <div className="quick-edit-groups">
        <div className="quick-edit-group">
          <div className="quick-edit-group__title">TEMEL BİLGİLER</div>
          <div className="quick-edit-grid">
            <EditField label="Ad Soyad" value={form.full_name} onChange={value => set('full_name', value)} />
            <EditField label="Pozisyon" value={form.position} onChange={value => set('position', value)} />
            <EditField label="İşe giriş" type="date" value={form.hire_date} onChange={value => set('hire_date', value)} />
            <EditField label="Sözleşme bitişi" type="date" value={form.contract_end} onChange={value => set('contract_end', value)} />
            <EditField label="Doğum tarihi" type="date" value={form.birth_date} onChange={value => set('birth_date', value)} />
            <EditField label="Kan grubu" value={form.blood_type} onChange={value => set('blood_type', value)} />
            <div>
              <label className="form-label">Cinsiyet</label>
              <select className="form-input" value={form.gender} aria-label="Cinsiyet" onChange={event => set('gender', event.target.value)}>
                <option value="">—</option><option value="male">Erkek</option><option value="female">Kadın</option>
              </select>
            </div>
          </div>
        </div>
        <div className="quick-edit-group">
          <div className="quick-edit-group__title">PROJE VE GÖREV ATAMASI</div>
          <div className="quick-edit-grid">
            <div>
              <label className="form-label">Kadro / Proje</label>
              <select className="form-input" value={form.project_id} aria-label="Kadro / Proje" onChange={event => set('project_id', event.target.value)}>
                <option value="">Kadrosu belirsiz</option>
                {(projects || []).map(project => <option key={project.id} value={project.id}>{project.name}</option>)}
              </select>
            </div>
            <div>
              <label className="form-label">Departman</label>
              <select className="form-input" value={form.department_id} aria-label="Departman" onChange={event => set('department_id', event.target.value)}>
                <option value="">—</option>
                {(departments || []).map(department => <option key={department.id} value={department.id}>{department.name}</option>)}
              </select>
            </div>
            <div>
              <label className="form-label">Rol</label>
              <select className="form-input" value={form.role_id} aria-label="Rol" onChange={event => set('role_id', event.target.value)}>
                <option value="">—</option>
                {(roles || []).map(role => <option key={role.id} value={role.id}>{role.name}</option>)}
              </select>
            </div>
            <div>
              <label className="form-label">Ana çalışma noktası</label>
              <select className="form-input" value={form.primary_work_location_id} aria-label="Ana çalışma noktası" onChange={event => set('primary_work_location_id', event.target.value)}>
                <option value="">Atanmamış</option>
                {(workLocations || []).map(location => <option key={location.id} value={location.id}>{[location.site || location.site_name, location.name].filter(Boolean).join(' / ')}</option>)}
              </select>
            </div>
            <EditField label="Atama başlangıcı" type="date" value={form.assignment_effective_from} onChange={value => set('assignment_effective_from', value)} />
            <EditField label="Atama notu" value={form.assignment_note} onChange={value => set('assignment_note', value)} />
          </div>
        </div>
        <div className="quick-edit-group">
          <div className="quick-edit-group__title">İLETİŞİM VE ACİL DURUM</div>
          <div className="quick-edit-grid">
            <EditField label="Telefon" type="tel" value={form.phone} onChange={value => set('phone', value)} />
            <EditField label="E-posta" type="email" value={form.email} onChange={value => set('email', value)} />
            <EditField label="Acil kişi" value={form.emergency_contact} onChange={value => set('emergency_contact', value)} />
            <EditField label="Acil telefon" type="tel" value={form.emergency_phone} onChange={value => set('emergency_phone', value)} />
            <div style={{ gridColumn: '1 / -1' }}>
              <label className="form-label">Adres</label>
              <textarea className="form-textarea" rows={2} value={form.address} aria-label="Adres" onChange={event => set('address', event.target.value)} />
            </div>
          </div>
        </div>
      </div>
      <div style={{
        display: 'flex', gap: 7, position: 'sticky', bottom: 0, zIndex: 1,
        padding: '10px 0 2px', background: 'var(--bg)', borderTop: '1px solid var(--border)',
      }}>
        <button className="btn btn-primary btn-sm" disabled={!form.full_name || isPending} onClick={submit}>
          {isPending ? 'Kaydediliyor…' : 'Kaydet'}
        </button>
        <button className="btn btn-ghost btn-sm" onClick={onCancel}>İptal</button>
      </div>
    </div>
  )
}

// Panelden hızlı not/görev ekleme — dosyayı açmadan interaktif ekleme.
function QuickAdd({ staffId, canManage }) {
  const qc = useQueryClient()
  const [mode, setMode] = useState(null) // 'note' | 'task' | null
  const [note, setNote] = useState('')
  const [task, setTask] = useState({ title: '', priority: 'medium', due_at: '' })
  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['staff-dossier', String(staffId)] })
    qc.invalidateQueries({ queryKey: ['staff-notes', String(staffId)] })
    qc.invalidateQueries({ queryKey: ['staff-followups', String(staffId)] })
  }
  const addNote = useMutation({
    mutationFn: () => api.post(`/personnel/${staffId}/notes`, { note }),
    onSuccess: () => { invalidate(); toastOk('Not eklendi'); setNote(''); setMode(null) },
    onError: toastErr,
  })
  const addTask = useMutation({
    mutationFn: () => api.post(`/personnel/${staffId}/followups`, { ...task, due_at: task.due_at || null }),
    onSuccess: () => { invalidate(); toastOk('Görev eklendi'); setTask({ title: '', priority: 'medium', due_at: '' }); setMode(null) },
    onError: toastErr,
  })
  if (!canManage) return null
  return (
    <DossierSection title="HIZLI EKLE" subtitle="Not veya görev — dosyayı açmadan"
      action={
        <div style={{ display: 'flex', gap: 5 }}>
          <button className={`btn btn-sm ${mode === 'note' ? 'btn-primary' : 'btn-ghost'}`} onClick={() => setMode(mode === 'note' ? null : 'note')}>+ Not</button>
          <button className={`btn btn-sm ${mode === 'task' ? 'btn-primary' : 'btn-ghost'}`} onClick={() => setMode(mode === 'task' ? null : 'task')}>+ Görev</button>
        </div>
      }>
      {mode === 'note' && (
        <form onSubmit={e => { e.preventDefault(); if (note.trim()) addNote.mutate() }} style={{ display: 'grid', gap: 6 }}>
          <textarea className="form-textarea" rows={2} placeholder="Yönetici notu…" value={note} onChange={e => setNote(e.target.value)} />
          <button type="submit" className="btn btn-primary btn-sm" disabled={addNote.isPending || !note.trim()} style={{ justifySelf: 'start' }}>Notu ekle</button>
        </form>
      )}
      {mode === 'task' && (
        <form onSubmit={e => { e.preventDefault(); if (task.title.trim()) addTask.mutate() }} style={{ display: 'grid', gap: 6 }}>
          <input className="form-input" placeholder="Görev başlığı" value={task.title} onChange={e => setTask(t => ({ ...t, title: e.target.value }))} />
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            <select className="form-input" value={task.priority} onChange={e => setTask(t => ({ ...t, priority: e.target.value }))} style={{ width: 110 }}>
              <option value="low">Düşük</option><option value="medium">Orta</option><option value="high">Yüksek</option><option value="critical">Kritik</option>
            </select>
            <input type="date" className="form-input" value={task.due_at} onChange={e => setTask(t => ({ ...t, due_at: e.target.value }))} style={{ width: 150 }} />
            <button type="submit" className="btn btn-primary btn-sm" disabled={addTask.isPending || !task.title.trim()}>Görevi ekle</button>
          </div>
        </form>
      )}
      {!mode && <div style={{ color: 'var(--text3)', fontSize: 11 }}>Hızlıca not düşmek veya görev atamak için yukarıdaki butonları kullanın.</div>}
    </DossierSection>
  )
}

export default function StaffDetailPanel({ staffId, onClose, departments = [] }) {
  const qc = useQueryClient()
  const navigate = useNavigate()
  const [editing, setEditing] = useState(false)
  const { data: dossier, isLoading, error, isFetching, refetch } = useStaffDossier(staffId)
  const canManage = dossier?.access?.can_manage_followups
  const { data: roles = [] } = useQuery({
    queryKey: ['shift-roles'], queryFn: () => api.get('/shifts/roles').then(r => r.data),
    staleTime: 5 * 60 * 1000, enabled: editing,
  })
  const { projects } = useProjects({ enabled: editing })
  const { data: workLocations = [] } = useQuery({
    queryKey: ['shift-work-locations'],
    queryFn: () => api.get('/shifts/work-locations').then(response => response.data),
    staleTime: 5 * 60 * 1000,
    enabled: editing,
  })
  const updateMutation = useMutation({
    mutationFn: payload => api.put(`/shifts/staff/${staffId}`, payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['staff-dossier', String(staffId)] })
      qc.invalidateQueries({ queryKey: ['staff-detail', String(staffId)] })
      qc.invalidateQueries({ queryKey: ['staff-list'] })
      qc.invalidateQueries({ queryKey: ['staff-directory-overview'] })
      setEditing(false)
      toastOk('Personel bilgileri güncellendi')
    },
    onError: toastErr,
  })

  useEffect(() => {
    const handleKey = event => {
      if (event.key !== 'Escape') return
      if (editing) setEditing(false)
      else onClose()
    }
    document.addEventListener('keydown', handleKey)
    return () => document.removeEventListener('keydown', handleKey)
  }, [editing, onClose])

  useEffect(() => { setEditing(false) }, [staffId])

  const fullPagePath = `/shifts/personnel/${staffId}`
  const navigateFromReadiness = (target) => {
    if (target === 'identity' && canManage) {
      setEditing(true)
      return
    }
    onClose()
    navigate(`${fullPagePath}?tab=${target}`)
  }
  const copySummary = async () => {
    const person = dossier?.person
    if (!person) return
    const summary = [
      person.full_name,
      [person.project_name, person.dept_name, person.role_name || person.position].filter(Boolean).join(' / '),
      person.primary_work_location_name ? `Lokasyon: ${person.primary_work_location_name}` : null,
      person.phone ? `Telefon: ${person.phone}` : null,
      person.email ? `E-posta: ${person.email}` : null,
    ].filter(Boolean).join('\n')
    try {
      await navigator.clipboard.writeText(summary)
      toastOk('Personel özeti panoya kopyalandı')
    } catch {
      toastErr({ response: { data: { error: 'Personel özeti kopyalanamadı' } } })
    }
  }
  const actions = dossier?.person ? (
    <>
      <Link className="btn btn-primary btn-xs" to={fullPagePath} onClick={onClose}>Tam Dosya</Link>
      {canManage && <button className="btn btn-ghost btn-xs" onClick={() => setEditing(true)}>Düzenle</button>}
      <button className="btn btn-ghost btn-xs" onClick={onClose}>Kapat</button>
    </>
  ) : null

  return (
    <BottomSheet onClose={onClose}>
      <div className="staff-detail-panel">
        {isLoading && <SkeletonCard lines={8} />}
        {!isLoading && (error || !dossier?.person) && (
          <div style={{ padding: 22, textAlign: 'center' }}>
            <div style={{ color: 'var(--red)', fontFamily: 'var(--display)', letterSpacing: 1 }}>PERSONEL DOSYASI YÜKLENEMEDİ</div>
            <div style={{ color: 'var(--text3)', fontSize: 11, marginTop: 7 }}>{error?.response?.data?.error || 'Veri bulunamadı'}</div>
          </div>
        )}
        {dossier?.person && (
          <>
            <DossierHeader dossier={dossier} actions={actions} />
            {editing ? (
              <DossierSection title="HIZLI DÜZENLEME" subtitle="TC, maaş ve IBAN gibi finans alanları tam dosyadan yönetilir" style={{ overflow: 'visible' }}>
                <QuickEditForm
                  person={dossier.person}
                  departments={departments}
                  roles={roles}
                  projects={projects}
                  workLocations={workLocations}
                  isPending={updateMutation.isPending}
                  onSave={payload => updateMutation.mutate(payload)}
                  onCancel={() => setEditing(false)}
                />
              </DossierSection>
            ) : (
              <>
                <div className="staff-detail-toolbar" aria-label="Hızlı personel işlemleri">
                  <div className="staff-detail-toolbar__actions">
                    <Link className="btn btn-primary btn-sm" to={`/shifts?tab=schedule&staff=${staffId}`} onClick={onClose}>+ Vardiya</Link>
                    <Link className="btn btn-ghost btn-sm" to={`/shifts?tab=leave&staff=${staffId}`} onClick={onClose}>+ İzin</Link>
                    <Link className="btn btn-ghost btn-sm" to={`/shifts?tab=overtime&staff=${staffId}`} onClick={onClose}>+ Mesai</Link>
                    {dossier.person.phone && <a className="btn btn-ghost btn-sm" href={`tel:${dossier.person.phone}`}>Ara</a>}
                    {dossier.person.email && <a className="btn btn-ghost btn-sm" href={`mailto:${dossier.person.email}`}>E-posta</a>}
                  </div>
                  <div className="staff-detail-toolbar__actions">
                    <button type="button" className="btn btn-ghost btn-xs" onClick={copySummary}>Özeti Kopyala</button>
                    <button type="button" className="btn btn-ghost btn-xs" disabled={isFetching} onClick={() => refetch()}>{isFetching ? 'Yenileniyor…' : 'Yenile'}</button>
                  </div>
                </div>
                <DossierReadiness dossier={dossier} compact onNavigate={navigateFromReadiness}
                  onEdit={canManage ? () => setEditing(true) : null} />
                <DossierWorkMetrics dossier={dossier} />
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(230px, 1fr))', gap: 10 }}>
                  <DossierSection title="YILLIK İZİN HAKKI" subtitle="İş Kanunu m.53">
                    <DossierAnnualLeave annual={dossier.annual_leave} compact />
                  </DossierSection>
                  <DossierSection title="AÇIK UYARILAR" subtitle={`Risk puanı ${dossier.risk_score || 0}`}>
                    <DossierRisks risks={dossier.risks} compact />
                  </DossierSection>
                  <DossierSection title="DOSYA DURUMU">
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 7 }}>
                      <DossierMetric label="BELGE TAMAMLAMA" value={`%${dossier.documents?.completion_rate ?? 100}`} color={dossier.documents?.missing ? 'var(--accent)' : 'var(--green)'} />
                      <DossierMetric label="AÇIK GÖREV" value={dossier.counters?.open_followups || 0} color="var(--blue)" />
                      <DossierMetric label="ZİMMET / KKD" value={(dossier.counters?.active_inventory || 0) + (dossier.counters?.active_kkd || 0)} color="var(--accent)" />
                      <DossierMetric label="SON PERFORMANS" value={dossier.latest_performance?.total_score ?? '—'} color="var(--purple)" />
                    </div>
                  </DossierSection>
                  <DossierSection title="İLETİŞİM VE KONUM">
                    <DossierField label="Proje" value={dossier.person.project_name} />
                    <DossierField label="Departman" value={dossier.person.dept_name} />
                    <DossierField label="Rol" value={dossier.person.role_name || dossier.person.position} />
                    <DossierField label="Ana lokasyon" value={dossier.person.primary_work_location_name} />
                    <DossierField label="Telefon" value={dossier.person.phone} href={dossier.person.phone ? `tel:${dossier.person.phone}` : null} />
                    <DossierField label="E-posta" value={dossier.person.email} href={dossier.person.email ? `mailto:${dossier.person.email}` : null} />
                    <DossierField label="İşe giriş" value={dossier.person.hire_date} />
                    <DossierField label="Acil kişi" value={dossier.person.emergency_contact} />
                    <DossierField label="Acil telefon" value={dossier.person.emergency_phone} href={dossier.person.emergency_phone ? `tel:${dossier.person.emergency_phone}` : null} />
                    <DossierField label="Yatakhane" value={dossier.room ? `${dossier.room.block}-${dossier.room.room_no} / ${dossier.room.bed_no || '—'}` : null} />
                  </DossierSection>
                  <DossierSection title="YAKLAŞAN TARİHLER">
                    <DossierUpcoming items={dossier.upcoming} compact />
                  </DossierSection>
                  <DossierSection title="SON İŞLEMLER">
                    <DossierActivity items={dossier.recent_activity} compact />
                  </DossierSection>
                </div>
                <QuickAdd staffId={staffId} canManage={canManage} />
                <Link to={fullPagePath} onClick={onClose} className="btn btn-primary" style={{ justifyContent: 'center', textDecoration: 'none' }}>
                  Tam Personel Dosyasını Aç
                </Link>
              </>
            )}
          </>
        )}
      </div>
    </BottomSheet>
  )
}
