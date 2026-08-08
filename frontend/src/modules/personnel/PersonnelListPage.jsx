import { useState, useMemo } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import api from '../../shared/api/client.js'
import { useDebounce } from '../../shared/hooks/useDebounce.js'
import { exportRowsToCsv, exportRowsToXlsx } from '../../shared/utils/exportData.js'
import { SkeletonGrid } from '../../shared/components/Skeleton.jsx'
import { useSavedFilters, SavedFiltersBar } from '../../shared/hooks/useSavedFilters.jsx'
import HelpHint from '../../shared/components/HelpHint.jsx'
import { useProjects, NO_PROJECT, PROJECTS_QUERY_KEY } from '../../shared/hooks/useProjects.js'
import { useToastStore } from '../../shared/store/toastStore.js'
import PersonnelCard from './PersonnelCard.jsx'
import './PersonnelListPage.css'

const EXPORT_COLUMNS = [
  { key: 'full_name', label: 'Ad Soyad' },
  { key: 'tc_no', label: 'TC No' },
  { key: 'phone', label: 'Telefon' },
  { key: 'position', label: 'Pozisyon' },
  { key: 'dept_name', label: 'Departman' },
  { key: 'role_label', label: 'Görev' },
  { key: 'project_name', label: 'Kadro (Proje)' },
  { key: 'hire_date', label: 'İşe Giriş' },
]

export default function PersonnelListPage() {
  const nav = useNavigate()
  const qc = useQueryClient()
  const [filters, setFilters] = useState({ q: '', deptId: '', projectId: '' })
  const { q, deptId, projectId } = filters
  const setQ = (v) => setFilters(f => ({ ...f, q: v }))
  const setDeptId = (v) => setFilters(f => ({ ...f, deptId: v }))
  const setProjectId = (v) => setFilters(f => ({ ...f, projectId: v }))
  const debouncedQ = useDebounce(q, 250)
  const savedFilters = useSavedFilters('personnel-list', filters, setFilters)
  const hasActiveFilter = !!(q || deptId || projectId)

  // Kadro düzenleme modu: açıkken karta tıklamak 360° görünüm yerine seçim yapar.
  const [selectMode, setSelectMode] = useState(false)
  const [selected, setSelected] = useState(() => new Set())

  const { data: staff = [], isLoading } = useQuery({
    queryKey: ['personnel-list'],
    queryFn: () => api.get('/shifts/staff').then(r => r.data),
  })
  const { data: departments = [] } = useQuery({
    queryKey: ['departments'],
    queryFn: () => api.get('/shifts/departments').then(r => r.data),
  })
  const { projects } = useProjects()

  const assign = useMutation({
    mutationFn: ({ staff_ids, project_id }) => api.post('/projects/assign', { staff_ids, project_id }),
    onSuccess: (_res, vars) => {
      qc.invalidateQueries({ queryKey: ['personnel-list'] })
      qc.invalidateQueries({ queryKey: PROJECTS_QUERY_KEY })
      qc.invalidateQueries({ queryKey: ['staff-list'] })
      const hedef = projects.find(p => p.id === vars.project_id)
      useToastStore.getState().addToast(
        vars.project_id
          ? `${vars.staff_ids.length} kişi ${hedef?.name || 'projeye'} kadrosuna alındı`
          : `${vars.staff_ids.length} kişi kadrodan çıkarıldı`,
        'success',
      )
      setSelected(new Set())
    },
    onError: e => useToastStore.getState().addToast(
      e.response?.data?.error || 'Kadro güncellenemedi', 'error',
    ),
  })

  const filtered = useMemo(() => {
    const low = debouncedQ.trim().toLowerCase()
    return staff.filter(s => {
      if (deptId && String(s.department_id) !== String(deptId)) return false
      if (projectId === NO_PROJECT) { if (s.project_id) return false }
      else if (projectId && String(s.project_id) !== String(projectId)) return false
      if (!low) return true
      return (
        s.full_name?.toLowerCase().includes(low) ||
        s.tc_no?.includes(low) ||
        s.phone?.includes(low) ||
        s.position?.toLowerCase().includes(low) ||
        s.dept_name?.toLowerCase().includes(low) ||
        s.project_name?.toLowerCase().includes(low) ||
        s.role_label?.toLowerCase().includes(low)
      )
    })
  }, [staff, debouncedQ, deptId, projectId])

  // Kadrosu belirsiz sayısı her zaman TÜM personel üzerinden — filtre açıkken
  // "0 eksik" gibi yanıltıcı bir sayı göstermemek için.
  const kadrosuz = useMemo(() => staff.filter(s => !s.project_id && s.is_active).length, [staff])

  const toggle = (id) => setSelected(prev => {
    const next = new Set(prev)
    if (next.has(id)) next.delete(id); else next.add(id)
    return next
  })
  const tumunuSec = () => setSelected(new Set(filtered.map(s => s.id)))
  const kartaTikla = (s) => { if (selectMode) toggle(s.id); else nav(`/personnel/${s.id}`) }

  return (
    <div style={{ maxWidth: 1280 }} className="fade-up">
      <div style={{ marginBottom: 16 }}>
        <h1 style={{ fontSize: 28, letterSpacing: 4, color: 'var(--text)', margin: 0 }}>PERSONEL<HelpHint topic="personnel" title="PERSONEL" /></h1>
        <p style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--text3)', marginTop: 4, letterSpacing: 1.5 }}>
          {filtered.length} / {staff.length} KAYIT — {selectMode ? 'TIKLAYINCA SEÇİLİR' : 'TIKLAYINCA 360° GÖRÜNÜM'}
        </p>
      </div>

      {kadrosuz > 0 && !selectMode && (
        <div style={{
          marginBottom: 12, padding: '9px 12px', borderRadius: 10, fontSize: 12,
          background: 'rgba(245,158,11,.08)', border: '1px solid rgba(245,158,11,.3)',
          display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap',
        }}>
          <span>⚠ <strong>{kadrosuz} kişinin</strong> kadrosu belirlenmemiş — hangi projede çalıştığı bilinmiyor.</span>
          <button type="button" className="btn btn-sm btn-ghost" style={{ fontSize: 11 }}
            onClick={() => { setProjectId(NO_PROJECT); setSelectMode(true) }}>
            Bunları göster ve kadroya al
          </button>
        </div>
      )}

      <SavedFiltersBar
        presets={savedFilters.presets}
        onApply={savedFilters.apply}
        onSave={savedFilters.save}
        onRemove={savedFilters.remove}
        hasActiveFilter={hasActiveFilter}
      />

      <div style={{ display: 'flex', gap: 8, marginBottom: 14, flexWrap: 'wrap' }}>
        <input className="form-input" placeholder="🔍 Ad / TC / telefon / pozisyon / proje ara…"
          value={q} onChange={e => setQ(e.target.value)}
          style={{ flex: 1, minWidth: 240, fontSize: 13, borderRadius: 10 }} autoFocus />
        <select className="form-select" value={projectId} onChange={e => setProjectId(e.target.value)}
          aria-label="Proje filtresi"
          style={{ width: 'auto', minWidth: 165, fontSize: 12, borderRadius: 10 }}>
          <option value="">Tüm projeler</option>
          {projects.map(p => (
            <option key={p.id} value={p.id}>{p.name} ({p.staff_count ?? 0})</option>
          ))}
          <option value={NO_PROJECT}>Kadrosu belirsiz ({kadrosuz})</option>
        </select>
        <select className="form-select" value={deptId} onChange={e => setDeptId(e.target.value)}
          aria-label="Departman filtresi"
          style={{ width: 'auto', minWidth: 165, fontSize: 12, borderRadius: 10 }}>
          <option value="">Tüm departmanlar</option>
          {departments.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
        </select>
        <button type="button" className={`btn btn-sm ${selectMode ? 'btn-primary' : 'btn-ghost'}`}
          onClick={() => { setSelectMode(m => !m); setSelected(new Set()) }}
          title="Birden fazla kişiyi seçip toplu olarak proje kadrosuna al"
          style={{ fontSize: 11 }}>☑ Kadro ata</button>
        <button type="button" className="btn btn-ghost btn-sm"
          onClick={() => exportRowsToCsv(EXPORT_COLUMNS, filtered, `personel-${new Date().toISOString().slice(0, 10)}.csv`)}
          disabled={!filtered.length}
          title="Görünür kayıtları CSV olarak indir"
          style={{ fontSize: 11 }}>📄 CSV</button>
        <button type="button" className="btn btn-ghost btn-sm"
          onClick={() => exportRowsToXlsx(EXPORT_COLUMNS, filtered, `personel-${new Date().toISOString().slice(0, 10)}.xlsx`, 'Personel')}
          disabled={!filtered.length}
          title="Görünür kayıtları Excel olarak indir"
          style={{ fontSize: 11 }}>📊 Excel</button>
      </div>

      {selectMode && (
        <div style={{
          position: 'sticky', top: 0, zIndex: 5, marginBottom: 12,
          padding: '10px 12px', borderRadius: 11,
          background: 'var(--surface)', border: '1px solid var(--accent)',
          display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap',
        }}>
          <strong style={{ fontSize: 13 }}>{selected.size} kişi seçili</strong>
          <button type="button" className="btn btn-ghost btn-sm" style={{ fontSize: 11 }}
            onClick={tumunuSec} disabled={!filtered.length}>Görünenlerin hepsi ({filtered.length})</button>
          <button type="button" className="btn btn-ghost btn-sm" style={{ fontSize: 11 }}
            onClick={() => setSelected(new Set())} disabled={!selected.size}>Temizle</button>
          <span style={{ flex: 1 }} />
          <span style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--text3)' }}>KADROYA AL →</span>
          {projects.map(p => (
            <button key={p.id} type="button" className="btn btn-primary btn-sm" style={{ fontSize: 11 }}
              disabled={!selected.size || assign.isPending}
              onClick={() => assign.mutate({ staff_ids: [...selected], project_id: p.id })}>
              {p.name}
            </button>
          ))}
          <button type="button" className="btn btn-ghost btn-sm" style={{ fontSize: 11 }}
            disabled={!selected.size || assign.isPending}
            title="Seçilenlerin kadro bağlantısını kaldırır — personel silinmez"
            onClick={() => assign.mutate({ staff_ids: [...selected], project_id: null })}>
            Kadrodan çıkar
          </button>
        </div>
      )}

      {isLoading ? (
        <SkeletonGrid count={12} />
      ) : !filtered.length ? (
        <div style={{ padding: 60, textAlign: 'center', background: 'var(--surface)', borderRadius: 14, border: '1px solid var(--border)' }}>
          <div style={{ fontSize: 40, opacity: 0.3, marginBottom: 10 }}>👥</div>
          <div style={{ fontFamily: 'var(--display)', fontSize: 14, letterSpacing: 2 }}>SONUÇ BULUNAMADI</div>
        </div>
      ) : (
        <div className="personnel-grid">
          {filtered.map(s => {
            const secili = selected.has(s.id)
            return (
              <PersonnelCard
                key={s.id}
                person={s}
                selectMode={selectMode}
                selected={secili}
                onActivate={() => kartaTikla(s)}
              />
            )
          })}
        </div>
      )}

      <div style={{ marginTop: 14, fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--text4)' }}>
        💡 Kart üzerine tıklayınca 9 sekmeli 360° görünüm açılır (Genel · Vardiya · Servis · Yatakhane · Disiplin · İzin/Mesai · Notlar · Acil · Timeline)
        <br />💡 “Kadro ata” ile birden fazla kişiyi seçip tek seferde FPU veya Kamp Alanı kadrosuna alabilirsin.
      </div>
    </div>
  )
}
