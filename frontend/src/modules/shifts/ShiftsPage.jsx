import { useState, useMemo } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import api from '../../shared/api/client.js'
import { useAuthStore } from '../../shared/store/authStore.js'

// ─── Sabitler ──────────────────────────────────────────────────────────────
const LEAVE_TYPES = {
  annual:      { label: 'Yıllık',   color: 'bg-blue-500/20 text-blue-300' },
  sick:        { label: 'Hastalık', color: 'bg-red-500/20 text-red-300' },
  emergency:   { label: 'Acil',     color: 'bg-orange-500/20 text-orange-300' },
  maternity:   { label: 'Doğum',    color: 'bg-pink-500/20 text-pink-300' },
  paternity:   { label: 'Babalık',  color: 'bg-indigo-500/20 text-indigo-300' },
  marriage:    { label: 'Evlilik',  color: 'bg-purple-500/20 text-purple-300' },
  bereavement: { label: 'Ölüm',     color: 'bg-slate-500/20 text-slate-300' },
}

// ─── Tarih yardımcıları ────────────────────────────────────────────────────
function getWeekStart(date) {
  const d = new Date(date)
  const day = d.getDay()
  const diff = (day === 0 ? -6 : 1 - day)
  d.setDate(d.getDate() + diff)
  return d.toISOString().split('T')[0]
}

function addDays(dateStr, n) {
  const d = new Date(dateStr)
  d.setDate(d.getDate() + n)
  return d.toISOString().split('T')[0]
}

function formatDate(dateStr) {
  return new Date(dateStr).toLocaleDateString('tr-TR', { day: 'numeric', month: 'short' })
}

function shortDay(dateStr) {
  return new Date(dateStr).toLocaleDateString('tr-TR', { weekday: 'short' })
}

// ─── Sub-components ────────────────────────────────────────────────────────

function StatCard({ label, value, sub, color = 'text-white' }) {
  return (
    <div className="bg-slate-900 rounded-xl p-4">
      <div className={`text-2xl md:text-3xl font-bold ${color}`}>{value}</div>
      <div className="text-xs text-slate-400 mt-1">{label}</div>
      {sub && <div className="text-xs text-slate-500 mt-1">{sub}</div>}
    </div>
  )
}

function GenderBadge({ gender }) {
  return gender === 'female'
    ? <span title="Kadın" className="text-pink-400 text-xs">♀</span>
    : <span title="Erkek" className="text-blue-400 text-xs">♂</span>
}

function ShiftBadge({ shiftName, colorClass, startHour, endHour }) {
  if (!shiftName) return <span className="text-slate-600 text-xs">—</span>
  const bgMap = {
    'bg-blue-400':   'bg-blue-400/20 text-blue-300',
    'bg-orange-400': 'bg-orange-400/20 text-orange-300',
    'bg-indigo-600': 'bg-indigo-600/20 text-indigo-300',
  }
  const cls = bgMap[colorClass] || 'bg-slate-700 text-slate-300'
  return (
    <span className={`px-1.5 py-0.5 rounded text-xs font-medium whitespace-nowrap ${cls}`}>
      {shiftName} {startHour}–{endHour}
    </span>
  )
}

function DeptBadge({ name, colorClass }) {
  const bgMap = {
    'bg-red-600':    'bg-red-600/20 text-red-300',
    'bg-green-600':  'bg-green-600/20 text-green-300',
    'bg-orange-500': 'bg-orange-500/20 text-orange-300',
    'bg-blue-600':   'bg-blue-600/20 text-blue-300',
    'bg-yellow-500': 'bg-yellow-500/20 text-yellow-300',
    'bg-lime-500':   'bg-lime-500/20 text-lime-300',
    'bg-pink-500':   'bg-pink-500/20 text-pink-300',
    'bg-purple-600': 'bg-purple-600/20 text-purple-300',
  }
  return <span className={`px-2 py-0.5 rounded text-xs whitespace-nowrap ${bgMap[colorClass] || 'bg-slate-700 text-slate-300'}`}>{name}</span>
}

// ─── Tab: Çizelge ──────────────────────────────────────────────────────────
function ScheduleTab({ departments, shiftDefs }) {
  const qc = useQueryClient()
  const user = useAuthStore(s => s.user)
  const canEdit = ['campus_manager', 'shift_supervisor'].includes(user?.role)

  const [weekStart, setWeekStart] = useState(getWeekStart(new Date()))
  const [deptFilter, setDeptFilter] = useState('')
  const [editModal, setEditModal] = useState(null)
  const [editShiftDef, setEditShiftDef] = useState('')

  const weekDays = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i))
  const weekEnd = weekDays[6]

  const { data: rows = [], isLoading } = useQuery({
    queryKey: ['schedule', weekStart, deptFilter],
    queryFn: () => api.get('/shifts/schedule', {
      params: { week: weekStart, week_end: weekEnd, dept_id: deptFilter || undefined }
    }).then(r => r.data),
  })

  const personnelMap = useMemo(() => {
    const map = new Map()
    rows.forEach(r => {
      if (!map.has(r.personnel_id)) {
        map.set(r.personnel_id, {
          id: r.personnel_id,
          full_name: r.full_name,
          gender: r.gender,
          dept_id: r.dept_id,
          dept_name: r.dept_name,
          dept_color: r.dept_color,
          days: {}
        })
      }
      map.get(r.personnel_id).days[r.work_date] = r
    })
    return map
  }, [rows])

  const personnelList = Array.from(personnelMap.values())

  const updateShift = useMutation({
    mutationFn: ({ personnelId, deptId, shiftDefId, date }) =>
      api.post('/shifts/schedule', {
        entries: [{ personnel_id: personnelId, dept_id: deptId, shift_def_id: shiftDefId, work_date: date }]
      }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['schedule'] }); setEditModal(null) }
  })

  const openEdit = (person, date) => {
    if (!canEdit) return
    const existing = person.days[date]
    setEditShiftDef(existing?.shift_def_id?.toString() || '')
    setEditModal({ personnelId: person.id, deptId: person.dept_id, date })
  }

  return (
    <div>
      {/* Controls */}
      <div className="flex flex-wrap items-center gap-2 mb-4">
        <button onClick={() => setWeekStart(addDays(weekStart, -7))}
          className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 rounded text-sm text-slate-300">← Önceki</button>
        <span className="text-sm text-slate-300 font-medium whitespace-nowrap">
          {formatDate(weekStart)} – {formatDate(weekEnd)}
        </span>
        <button onClick={() => setWeekStart(addDays(weekStart, 7))}
          className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 rounded text-sm text-slate-300">Sonraki →</button>
        <button onClick={() => setWeekStart(getWeekStart(new Date()))}
          className="px-3 py-1.5 bg-slate-700 hover:bg-slate-600 rounded text-sm text-slate-300">Bu Hafta</button>
        <select
          value={deptFilter}
          onChange={e => setDeptFilter(e.target.value)}
          className="bg-slate-800 border border-slate-700 rounded px-3 py-1.5 text-sm text-slate-300"
        >
          <option value="">Tüm Bölümler</option>
          {departments.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
        </select>
      </div>

      {/* Legend */}
      <div className="flex flex-wrap gap-3 mb-4 text-xs text-slate-400">
        {shiftDefs.map(s => {
          const dot = { 'bg-blue-400': 'bg-blue-400', 'bg-orange-400': 'bg-orange-400', 'bg-indigo-600': 'bg-indigo-600' }
          return (
            <span key={s.id} className="flex items-center gap-1">
              <span className={`w-3 h-3 rounded ${dot[s.color_class] || 'bg-slate-500'}`}></span>
              {s.name} ({s.start_hour}:00–{s.end_hour === 24 ? '00' : s.end_hour}:00)
            </span>
          )
        })}
        <span className="flex items-center gap-1"><span className="text-blue-400">♂</span> Erkek</span>
        <span className="flex items-center gap-1"><span className="text-pink-400">♀</span> Kadın</span>
      </div>

      {isLoading ? (
        <div className="text-slate-500 text-sm py-8 text-center">Yükleniyor...</div>
      ) : (
        <div className="overflow-x-auto -mx-4 md:mx-0">
          <div className="min-w-max px-4 md:px-0">
            <table className="w-full text-xs border-collapse">
              <thead>
                <tr>
                  <th className="text-left p-2 bg-slate-900 text-slate-400 font-medium sticky left-0 z-10 min-w-36">Personel</th>
                  <th className="text-left p-2 bg-slate-900 text-slate-400 font-medium min-w-20 hidden sm:table-cell">Bölüm</th>
                  {weekDays.map(d => (
                    <th key={d} className="text-center p-2 bg-slate-900 text-slate-400 font-medium min-w-24">
                      <div className="capitalize">{shortDay(d)}</div>
                      <div className="text-slate-500">{formatDate(d)}</div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {personnelList.map(person => (
                  <tr key={person.id} className="border-t border-slate-800 hover:bg-slate-900/50">
                    <td className="p-2 sticky left-0 z-10 bg-slate-950">
                      <div className={`flex items-center gap-1 border-l-4 pl-2 ${person.gender === 'female' ? 'border-pink-400' : 'border-blue-400'}`}>
                        <GenderBadge gender={person.gender} />
                        <span className="text-slate-200 truncate max-w-28">{person.full_name}</span>
                      </div>
                      <div className="sm:hidden mt-0.5 pl-6">
                        <DeptBadge name={person.dept_name} colorClass={person.dept_color} />
                      </div>
                    </td>
                    <td className="p-2 hidden sm:table-cell">
                      <DeptBadge name={person.dept_name} colorClass={person.dept_color} />
                    </td>
                    {weekDays.map(d => {
                      const cell = person.days[d]
                      return (
                        <td key={d} className="p-1 text-center">
                          {cell ? (
                            <button
                              onClick={() => openEdit(person, d)}
                              className={`w-full px-1 py-1 rounded transition-opacity hover:opacity-80 ${canEdit ? 'cursor-pointer' : 'cursor-default'}`}
                              disabled={!canEdit}
                            >
                              {cell.status === 'on_leave' ? (
                                <span className="block px-1 py-0.5 rounded bg-amber-500/20 text-amber-300 text-xs whitespace-nowrap">İzin</span>
                              ) : cell.status === 'absent' ? (
                                <span className="block px-1 py-0.5 rounded bg-red-500/20 text-red-400 text-xs">Yok</span>
                              ) : (
                                <ShiftBadge
                                  shiftName={cell.shift_name}
                                  colorClass={cell.shift_color}
                                  startHour={cell.start_hour}
                                  endHour={cell.end_hour === 24 ? '00' : cell.end_hour}
                                />
                              )}
                            </button>
                          ) : (
                            <button
                              onClick={() => openEdit(person, d)}
                              className={`w-full px-1 py-1 rounded text-slate-600 text-xs ${canEdit ? 'hover:bg-slate-800 cursor-pointer' : 'cursor-default'}`}
                              disabled={!canEdit}
                            >—</button>
                          )}
                        </td>
                      )
                    })}
                  </tr>
                ))}
                {personnelList.length === 0 && (
                  <tr><td colSpan={weekDays.length + 2} className="text-center text-slate-500 py-8">Bu hafta için vardiya verisi bulunamadı</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Edit Modal */}
      {editModal && (
        <div className="fixed inset-0 bg-black/60 flex items-end sm:items-center justify-center z-50 p-4" onClick={() => setEditModal(null)}>
          <div className="bg-slate-900 border border-slate-700 rounded-xl p-5 w-full max-w-sm" onClick={e => e.stopPropagation()}>
            <h3 className="font-semibold text-slate-100 mb-4">Vardiya Değiştir — {formatDate(editModal.date)}</h3>
            <div className="space-y-2 mb-4">
              {shiftDefs.map(s => (
                <button
                  key={s.id}
                  onClick={() => setEditShiftDef(s.id.toString())}
                  className={`w-full px-3 py-3 rounded border-2 text-sm text-left transition-colors ${editShiftDef === s.id.toString() ? 'border-blue-500 bg-blue-900/20 text-blue-200' : 'border-slate-700 text-slate-400 hover:border-slate-600'}`}
                >
                  {s.name} — {s.start_hour}:00 – {s.end_hour === 24 ? '00:00' : `${s.end_hour}:00`}
                </button>
              ))}
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => updateShift.mutate({ ...editModal, shiftDefId: parseInt(editShiftDef) })}
                disabled={!editShiftDef || updateShift.isPending}
                className="flex-1 px-4 py-2.5 bg-blue-600 hover:bg-blue-500 disabled:bg-slate-700 text-white rounded text-sm"
              >
                {updateShift.isPending ? 'Kaydediliyor...' : 'Kaydet'}
              </button>
              <button onClick={() => setEditModal(null)} className="px-4 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded text-sm">İptal</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Tab: İzinler ──────────────────────────────────────────────────────────
function LeaveTab({ departments }) {
  const qc = useQueryClient()
  const user = useAuthStore(s => s.user)
  const canApprove = ['campus_manager', 'shift_supervisor'].includes(user?.role)

  const [filters, setFilters] = useState({ status: '', dept_id: '', leave_type: '' })
  const [newLeave, setNewLeave] = useState(false)
  const [form, setForm] = useState({ personnel_id: '', leave_type: 'annual', start_date: '', end_date: '', reason: '' })

  const { data: leaves = [] } = useQuery({
    queryKey: ['leaves', filters],
    queryFn: () => api.get('/shifts/leave', { params: filters }).then(r => r.data),
  })

  const approveMut = useMutation({
    mutationFn: ({ id, status }) => api.patch(`/shifts/leave/${id}`, { status }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['leaves'] }),
  })

  const createMut = useMutation({
    mutationFn: data => api.post('/shifts/leave', data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['leaves'] }); setNewLeave(false); setForm({ personnel_id: '', leave_type: 'annual', start_date: '', end_date: '', reason: '' }) },
    onError: e => alert(e.response?.data?.error || 'Hata'),
  })

  const statusBadge = s => {
    const m = { pending: 'bg-amber-500/20 text-amber-300', approved: 'bg-green-500/20 text-green-300', rejected: 'bg-red-500/20 text-red-300' }
    const l = { pending: 'Bekliyor', approved: 'Onaylı', rejected: 'Reddedildi' }
    return <span className={`px-2 py-0.5 rounded text-xs whitespace-nowrap ${m[s]}`}>{l[s]}</span>
  }

  return (
    <div>
      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2 mb-4">
        <select value={filters.status} onChange={e => setFilters(p => ({ ...p, status: e.target.value }))}
          className="bg-slate-800 border border-slate-700 rounded px-3 py-1.5 text-sm text-slate-300 flex-1 min-w-0">
          <option value="">Tüm Durumlar</option>
          <option value="pending">Bekliyor</option>
          <option value="approved">Onaylı</option>
          <option value="rejected">Reddedildi</option>
        </select>
        <select value={filters.dept_id} onChange={e => setFilters(p => ({ ...p, dept_id: e.target.value }))}
          className="bg-slate-800 border border-slate-700 rounded px-3 py-1.5 text-sm text-slate-300 flex-1 min-w-0">
          <option value="">Tüm Bölümler</option>
          {departments.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
        </select>
        <button onClick={() => setNewLeave(true)} className="px-4 py-1.5 bg-blue-600 hover:bg-blue-500 text-white rounded text-sm whitespace-nowrap">+ Yeni İzin</button>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-7 gap-2 mb-5">
        {Object.entries(LEAVE_TYPES).map(([k, v]) => {
          const count = leaves.filter(l => l.leave_type === k).length
          return (
            <div key={k} className={`rounded-lg p-2.5 ${v.color} border border-current/20`}>
              <div className="text-xl font-bold">{count}</div>
              <div className="text-xs opacity-80 leading-tight mt-0.5">{v.label}</div>
            </div>
          )
        })}
      </div>

      {/* Cards on mobile, table on desktop */}
      <div className="md:hidden space-y-3">
        {leaves.length === 0 && <div className="text-center text-slate-500 py-8 text-sm">İzin talebi bulunamadı</div>}
        {leaves.map(l => (
          <div key={l.id} className="bg-slate-900 rounded-xl p-4 space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5">
                <GenderBadge gender={l.gender} />
                <span className="text-slate-100 text-sm font-medium">{l.full_name}</span>
              </div>
              {statusBadge(l.status)}
            </div>
            <div className="flex flex-wrap gap-2">
              <DeptBadge name={l.dept_name} colorClass={l.dept_color} />
              <span className={`px-2 py-0.5 rounded text-xs ${LEAVE_TYPES[l.leave_type]?.color}`}>{LEAVE_TYPES[l.leave_type]?.label}</span>
            </div>
            <div className="text-xs text-slate-400">{formatDate(l.start_date)} – {formatDate(l.end_date)} · <span className="text-slate-300">{l.total_days} gün</span></div>
            {canApprove && l.status === 'pending' && (
              <div className="flex gap-2 pt-1">
                <button onClick={() => approveMut.mutate({ id: l.id, status: 'approved' })}
                  className="flex-1 px-3 py-1.5 bg-green-700 hover:bg-green-600 text-white rounded text-xs">Onayla</button>
                <button onClick={() => approveMut.mutate({ id: l.id, status: 'rejected' })}
                  className="flex-1 px-3 py-1.5 bg-red-800 hover:bg-red-700 text-white rounded text-xs">Reddet</button>
              </div>
            )}
          </div>
        ))}
      </div>

      <div className="hidden md:block bg-slate-900 rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-800">
              <th className="text-left p-3 text-slate-400 font-medium">Personel</th>
              <th className="text-left p-3 text-slate-400 font-medium">Bölüm</th>
              <th className="text-left p-3 text-slate-400 font-medium">İzin Türü</th>
              <th className="text-left p-3 text-slate-400 font-medium">Tarih</th>
              <th className="text-left p-3 text-slate-400 font-medium">Gün</th>
              <th className="text-left p-3 text-slate-400 font-medium">Durum</th>
              {canApprove && <th className="text-left p-3 text-slate-400 font-medium">İşlem</th>}
            </tr>
          </thead>
          <tbody>
            {leaves.map(l => (
              <tr key={l.id} className="border-t border-slate-800 hover:bg-slate-800/50">
                <td className="p-3">
                  <div className="flex items-center gap-1">
                    <GenderBadge gender={l.gender} />
                    <span className="text-slate-200">{l.full_name}</span>
                  </div>
                </td>
                <td className="p-3"><DeptBadge name={l.dept_name} colorClass={l.dept_color} /></td>
                <td className="p-3"><span className={`px-2 py-0.5 rounded text-xs ${LEAVE_TYPES[l.leave_type]?.color}`}>{LEAVE_TYPES[l.leave_type]?.label}</span></td>
                <td className="p-3 text-slate-400 text-xs whitespace-nowrap">{formatDate(l.start_date)} – {formatDate(l.end_date)}</td>
                <td className="p-3 text-slate-300">{l.total_days}</td>
                <td className="p-3">{statusBadge(l.status)}</td>
                {canApprove && (
                  <td className="p-3">
                    {l.status === 'pending' && (
                      <div className="flex gap-2">
                        <button onClick={() => approveMut.mutate({ id: l.id, status: 'approved' })}
                          className="px-2 py-1 bg-green-700 hover:bg-green-600 text-white rounded text-xs">Onayla</button>
                        <button onClick={() => approveMut.mutate({ id: l.id, status: 'rejected' })}
                          className="px-2 py-1 bg-red-800 hover:bg-red-700 text-white rounded text-xs">Reddet</button>
                      </div>
                    )}
                  </td>
                )}
              </tr>
            ))}
            {leaves.length === 0 && (
              <tr><td colSpan={canApprove ? 7 : 6} className="text-center text-slate-500 py-8">İzin talebi bulunamadı</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {/* New Leave Modal */}
      {newLeave && (
        <div className="fixed inset-0 bg-black/60 flex items-end sm:items-center justify-center z-50 p-4" onClick={() => setNewLeave(false)}>
          <div className="bg-slate-900 border border-slate-700 rounded-xl p-5 w-full max-w-md" onClick={e => e.stopPropagation()}>
            <h3 className="font-semibold text-slate-100 mb-4">Yeni İzin Talebi</h3>
            <div className="space-y-3">
              <div>
                <label className="text-xs text-slate-400 mb-1 block">Personel ID</label>
                <input value={form.personnel_id} onChange={e => setForm(p => ({ ...p, personnel_id: e.target.value }))}
                  placeholder="Personel ID" className="w-full bg-slate-800 border border-slate-700 rounded px-3 py-2.5 text-sm text-slate-100" />
              </div>
              <div>
                <label className="text-xs text-slate-400 mb-1 block">İzin Türü</label>
                <select value={form.leave_type} onChange={e => setForm(p => ({ ...p, leave_type: e.target.value }))}
                  className="w-full bg-slate-800 border border-slate-700 rounded px-3 py-2.5 text-sm text-slate-300">
                  {Object.entries(LEAVE_TYPES).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-slate-400 mb-1 block">Başlangıç</label>
                  <input type="date" value={form.start_date} onChange={e => setForm(p => ({ ...p, start_date: e.target.value }))}
                    className="w-full bg-slate-800 border border-slate-700 rounded px-3 py-2.5 text-sm text-slate-100" />
                </div>
                <div>
                  <label className="text-xs text-slate-400 mb-1 block">Bitiş</label>
                  <input type="date" value={form.end_date} onChange={e => setForm(p => ({ ...p, end_date: e.target.value }))}
                    className="w-full bg-slate-800 border border-slate-700 rounded px-3 py-2.5 text-sm text-slate-100" />
                </div>
              </div>
              <div>
                <label className="text-xs text-slate-400 mb-1 block">Açıklama (isteğe bağlı)</label>
                <textarea value={form.reason} onChange={e => setForm(p => ({ ...p, reason: e.target.value }))}
                  rows={2} className="w-full bg-slate-800 border border-slate-700 rounded px-3 py-2 text-sm text-slate-100 resize-none" />
              </div>
            </div>
            <div className="flex gap-2 mt-4">
              <button onClick={() => createMut.mutate(form)} disabled={createMut.isPending || !form.personnel_id || !form.start_date || !form.end_date}
                className="flex-1 px-4 py-2.5 bg-blue-600 hover:bg-blue-500 disabled:bg-slate-700 text-white rounded text-sm">
                {createMut.isPending ? 'Kaydediliyor...' : 'Gönder'}
              </button>
              <button onClick={() => setNewLeave(false)} className="px-4 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded text-sm">İptal</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Tab: Mesai ────────────────────────────────────────────────────────────
function OvertimeTab({ departments }) {
  const qc = useQueryClient()
  const user = useAuthStore(s => s.user)
  const canAdd = ['campus_manager', 'shift_supervisor'].includes(user?.role)

  const today = new Date()
  const [month, setMonth] = useState(`${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`)
  const [deptFilter, setDeptFilter] = useState('')
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({ personnel_id: '', work_date: '', hours: '', reason: '' })

  const { data: records = [] } = useQuery({
    queryKey: ['overtime', month, deptFilter],
    queryFn: () => api.get('/shifts/overtime', { params: { month, dept_id: deptFilter || undefined } }).then(r => r.data),
  })

  const { data: summary = [] } = useQuery({
    queryKey: ['overtime-summary', month],
    queryFn: () => api.get('/shifts/overtime/summary', { params: { month } }).then(r => r.data),
  })

  const createMut = useMutation({
    mutationFn: data => api.post('/shifts/overtime', data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['overtime'] })
      qc.invalidateQueries({ queryKey: ['overtime-summary'] })
      setShowForm(false)
      setForm({ personnel_id: '', work_date: '', hours: '', reason: '' })
    },
    onError: e => alert(e.response?.data?.error || 'Hata'),
  })

  const totalHours = records.reduce((s, r) => s + r.hours, 0)

  return (
    <div>
      {/* Controls */}
      <div className="flex flex-wrap items-center gap-2 mb-5">
        <input type="month" value={month} onChange={e => setMonth(e.target.value)}
          className="bg-slate-800 border border-slate-700 rounded px-3 py-1.5 text-sm text-slate-300" />
        <select value={deptFilter} onChange={e => setDeptFilter(e.target.value)}
          className="bg-slate-800 border border-slate-700 rounded px-3 py-1.5 text-sm text-slate-300 flex-1 min-w-0">
          <option value="">Tüm Bölümler</option>
          {departments.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
        </select>
        {canAdd && (
          <button onClick={() => setShowForm(true)} className="px-4 py-1.5 bg-purple-700 hover:bg-purple-600 text-white rounded text-sm whitespace-nowrap">+ Mesai Ekle</button>
        )}
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-5">
        <StatCard label="Toplam Mesai" value={`${totalHours.toFixed(1)}s`} color="text-purple-400" />
        <StatCard label="Mesai Kaydı" value={records.length} color="text-slate-100" />
        <StatCard label="Kişi Sayısı" value={new Set(records.map(r => r.personnel_id)).size} color="text-blue-400" />
        <StatCard label="Ort./Kişi" value={records.length ? (totalHours / new Set(records.map(r => r.personnel_id)).size).toFixed(1) + 's' : '—'} color="text-orange-400" />
      </div>

      {/* Dept summary */}
      {summary.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-5">
          {summary.map(s => (
            <div key={s.dept_id} className="bg-slate-900 rounded-xl p-3">
              <DeptBadge name={s.dept_name} colorClass={s.color_class} />
              <div className="text-xl font-bold text-slate-100 mt-2">{s.total_hours?.toFixed(1)}s</div>
              <div className="text-xs text-slate-500">{s.personnel_count} kişi</div>
            </div>
          ))}
        </div>
      )}

      {/* Cards on mobile, table on desktop */}
      <div className="md:hidden space-y-3">
        {records.length === 0 && <div className="text-center text-slate-500 py-8 text-sm">Bu ay mesai kaydı yok</div>}
        {records.map(r => (
          <div key={r.id} className="bg-slate-900 rounded-xl p-4">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-1.5">
                <GenderBadge gender={r.gender} />
                <span className="text-slate-100 text-sm font-medium">{r.full_name}</span>
              </div>
              <span className="text-purple-400 font-bold">{r.hours}s</span>
            </div>
            <div className="flex flex-wrap gap-2 text-xs">
              <DeptBadge name={r.dept_name} colorClass={r.dept_color} />
              <span className="text-slate-400">{formatDate(r.work_date)}</span>
              {r.reason && <span className="text-slate-500">{r.reason}</span>}
            </div>
          </div>
        ))}
      </div>

      <div className="hidden md:block bg-slate-900 rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-800">
              <th className="text-left p-3 text-slate-400 font-medium">Personel</th>
              <th className="text-left p-3 text-slate-400 font-medium">Bölüm</th>
              <th className="text-left p-3 text-slate-400 font-medium">Tarih</th>
              <th className="text-left p-3 text-slate-400 font-medium">Saat</th>
              <th className="text-left p-3 text-slate-400 font-medium">Sebep</th>
            </tr>
          </thead>
          <tbody>
            {records.map(r => (
              <tr key={r.id} className="border-t border-slate-800 hover:bg-slate-800/50">
                <td className="p-3">
                  <div className="flex items-center gap-1">
                    <GenderBadge gender={r.gender} />
                    <span className="text-slate-200">{r.full_name}</span>
                  </div>
                </td>
                <td className="p-3"><DeptBadge name={r.dept_name} colorClass={r.dept_color} /></td>
                <td className="p-3 text-slate-400 text-xs">{formatDate(r.work_date)}</td>
                <td className="p-3 font-medium text-purple-400">{r.hours}s</td>
                <td className="p-3 text-slate-400">{r.reason || '—'}</td>
              </tr>
            ))}
            {records.length === 0 && (
              <tr><td colSpan={5} className="text-center text-slate-500 py-8">Bu ay mesai kaydı yok</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Add Modal */}
      {showForm && (
        <div className="fixed inset-0 bg-black/60 flex items-end sm:items-center justify-center z-50 p-4" onClick={() => setShowForm(false)}>
          <div className="bg-slate-900 border border-slate-700 rounded-xl p-5 w-full max-w-md" onClick={e => e.stopPropagation()}>
            <h3 className="font-semibold text-slate-100 mb-4">Mesai Kaydı Ekle</h3>
            <div className="space-y-3">
              <div>
                <label className="text-xs text-slate-400 mb-1 block">Personel ID</label>
                <input value={form.personnel_id} onChange={e => setForm(p => ({ ...p, personnel_id: e.target.value }))}
                  className="w-full bg-slate-800 border border-slate-700 rounded px-3 py-2.5 text-sm text-slate-100" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-slate-400 mb-1 block">Tarih</label>
                  <input type="date" value={form.work_date} onChange={e => setForm(p => ({ ...p, work_date: e.target.value }))}
                    className="w-full bg-slate-800 border border-slate-700 rounded px-3 py-2.5 text-sm text-slate-100" />
                </div>
                <div>
                  <label className="text-xs text-slate-400 mb-1 block">Saat</label>
                  <input type="number" step="0.5" min="0.5" max="12" value={form.hours} onChange={e => setForm(p => ({ ...p, hours: e.target.value }))}
                    className="w-full bg-slate-800 border border-slate-700 rounded px-3 py-2.5 text-sm text-slate-100" />
                </div>
              </div>
              <div>
                <label className="text-xs text-slate-400 mb-1 block">Sebep</label>
                <input value={form.reason} onChange={e => setForm(p => ({ ...p, reason: e.target.value }))}
                  className="w-full bg-slate-800 border border-slate-700 rounded px-3 py-2.5 text-sm text-slate-100" />
              </div>
            </div>
            <div className="flex gap-2 mt-4">
              <button onClick={() => createMut.mutate({ ...form, personnel_id: parseInt(form.personnel_id), hours: parseFloat(form.hours) })}
                disabled={createMut.isPending || !form.personnel_id || !form.work_date || !form.hours}
                className="flex-1 px-4 py-2.5 bg-purple-700 hover:bg-purple-600 disabled:bg-slate-700 text-white rounded text-sm">
                {createMut.isPending ? 'Kaydediliyor...' : 'Kaydet'}
              </button>
              <button onClick={() => setShowForm(false)} className="px-4 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded text-sm">İptal</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Tab: İstatistikler ─────────────────────────────────────────────────────
function StatisticsTab() {
  const today = new Date().toISOString().split('T')[0]
  const [date, setDate] = useState(today)

  const { data: stats } = useQuery({
    queryKey: ['shift-stats', date],
    queryFn: () => api.get('/shifts/statistics', { params: { date } }).then(r => r.data),
  })

  const { data: deptSummary = [] } = useQuery({
    queryKey: ['dept-summary'],
    queryFn: () => api.get('/shifts/departments/summary').then(r => r.data),
  })

  if (!stats) return <div className="text-slate-500 text-sm mt-4">Yükleniyor...</div>

  const totalScheduled = stats.byShift?.reduce((s, r) => s + r.total, 0) || 0
  const totalMale = stats.byShift?.reduce((s, r) => s + r.male_count, 0) || 0
  const totalFemale = stats.byShift?.reduce((s, r) => s + r.female_count, 0) || 0

  return (
    <div className="space-y-5">
      {/* Date picker */}
      <div className="flex items-center gap-2 flex-wrap">
        <label className="text-sm text-slate-400">Tarih:</label>
        <input type="date" value={date} onChange={e => setDate(e.target.value)}
          className="bg-slate-800 border border-slate-700 rounded px-3 py-1.5 text-sm text-slate-300" />
        <button onClick={() => setDate(today)} className="px-3 py-1.5 bg-slate-700 hover:bg-slate-600 rounded text-sm text-slate-300">Bugün</button>
      </div>

      {/* Top summary */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <StatCard label="Aktif Vardiya" value={totalScheduled} color="text-blue-400" sub={formatDate(date)} />
        <StatCard label="İzinli" value={stats.onLeave || 0} color="text-amber-400" />
        <StatCard label="Devamsız" value={stats.absent || 0} color="text-red-400" />
        <StatCard label="Bekleyen İzin" value={stats.pendingLeave || 0} color="text-orange-400" />
      </div>

      {/* Gender breakdown */}
      <div className="bg-slate-900 rounded-xl p-4">
        <h3 className="font-medium text-slate-200 mb-3">Cinsiyet Dağılımı</h3>
        <div className="flex items-center gap-4">
          <div className="text-center min-w-12">
            <div className="text-2xl font-bold text-blue-400">{totalMale}</div>
            <div className="text-xs text-slate-400 mt-0.5">♂ Erkek</div>
          </div>
          <div className="flex-1 bg-slate-800 rounded-full h-4 overflow-hidden">
            {totalScheduled > 0 && (
              <>
                <div className="h-full bg-blue-500 float-left transition-all" style={{ width: `${(totalMale / totalScheduled) * 100}%` }}></div>
                <div className="h-full bg-pink-500" style={{ width: `${(totalFemale / totalScheduled) * 100}%` }}></div>
              </>
            )}
          </div>
          <div className="text-center min-w-12">
            <div className="text-2xl font-bold text-pink-400">{totalFemale}</div>
            <div className="text-xs text-slate-400 mt-0.5">♀ Kadın</div>
          </div>
        </div>
      </div>

      {/* Shift breakdown */}
      {stats.byShift?.length > 0 && (
        <div className="bg-slate-900 rounded-xl p-4">
          <h3 className="font-medium text-slate-200 mb-3">Vardiyalara Göre Dağılım</h3>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {stats.byShift.map(s => {
              const borderMap = { 'bg-blue-400': 'border-blue-400', 'bg-orange-400': 'border-orange-400', 'bg-indigo-600': 'border-indigo-500' }
              return (
                <div key={s.shift_def_id} className={`bg-slate-800 rounded-lg p-4 border-l-4 ${borderMap[s.color_class] || 'border-slate-600'}`}>
                  <div className="font-semibold text-slate-100">{s.shift_name}</div>
                  <div className="text-xs text-slate-400 mb-2">{s.start_hour}:00 – {s.end_hour === 24 ? '00:00' : `${s.end_hour}:00`}</div>
                  <div className="text-3xl font-bold text-slate-100">{s.total}</div>
                  <div className="flex gap-3 mt-2 text-xs">
                    <span className="text-blue-400">♂ {s.male_count}</span>
                    <span className="text-pink-400">♀ {s.female_count}</span>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Department breakdown */}
      <div className="bg-slate-900 rounded-xl p-4">
        <h3 className="font-medium text-slate-200 mb-3">Bölüm Bazlı Personel</h3>
        <div className="space-y-2">
          {deptSummary.map(d => {
            const maxCount = Math.max(...deptSummary.map(x => x.personnel_count), 1)
            return (
              <div key={d.id} className="flex items-center gap-2">
                <div className="w-20 text-xs text-slate-400 text-right truncate">{d.name}</div>
                <div className="flex-1 bg-slate-800 rounded-full h-5 overflow-hidden relative">
                  <div className={`h-full ${d.color_class} transition-all`} style={{ width: `${(d.personnel_count / maxCount) * 100}%` }}></div>
                  <span className="absolute inset-0 flex items-center pl-2 text-xs text-white font-medium">{d.personnel_count}</span>
                </div>
                <div className="text-xs text-slate-500 w-16 text-right whitespace-nowrap">
                  <span className="text-blue-400">♂{d.male_count}</span> <span className="text-pink-400">♀{d.female_count}</span>
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {/* Overtime summary */}
      <div className="bg-slate-900 rounded-xl p-4">
        <h3 className="font-medium text-slate-200 mb-2">Bu Ay Mesai</h3>
        <div className="flex gap-6">
          <div>
            <div className="text-2xl font-bold text-purple-400">{stats.overtimeMonth?.total_hours?.toFixed(1) || 0}s</div>
            <div className="text-xs text-slate-500">Toplam Saat</div>
          </div>
          <div>
            <div className="text-2xl font-bold text-slate-300">{stats.overtimeMonth?.record_count || 0}</div>
            <div className="text-xs text-slate-500">Kayıt</div>
          </div>
        </div>
      </div>
    </div>
  )
}

// ─── Ana Bileşen ────────────────────────────────────────────────────────────
export default function ShiftsPage() {
  const [activeTab, setActiveTab] = useState('schedule')

  const { data: departments = [] } = useQuery({
    queryKey: ['departments'],
    queryFn: () => api.get('/shifts/departments').then(r => r.data),
  })

  const { data: shiftDefs = [] } = useQuery({
    queryKey: ['shift-defs'],
    queryFn: () => api.get('/shifts/definitions').then(r => r.data),
  })

  const tabs = [
    { id: 'schedule',   label: '📅 Çizelge' },
    { id: 'leave',      label: '🏖 İzinler' },
    { id: 'overtime',   label: '⏱ Mesai' },
    { id: 'statistics', label: '📊 İstatistik' },
  ]

  return (
    <div className="max-w-full">
      <h1 className="text-lg md:text-xl font-bold text-slate-100 mb-1">Vardiya Yönetimi</h1>
      <p className="text-xs text-slate-400 mb-4">200 personel · 3 vardiya · 8 bölüm</p>

      {/* Tabs — scrollable on mobile */}
      <div className="flex gap-1 mb-5 border-b border-slate-800 overflow-x-auto">
        {tabs.map(t => (
          <button
            key={t.id}
            onClick={() => setActiveTab(t.id)}
            className={`px-3 md:px-4 py-2 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${activeTab === t.id ? 'border-blue-500 text-blue-400' : 'border-transparent text-slate-400 hover:text-slate-300'}`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      {activeTab === 'schedule'   && <ScheduleTab   departments={departments} shiftDefs={shiftDefs} />}
      {activeTab === 'leave'      && <LeaveTab       departments={departments} />}
      {activeTab === 'overtime'   && <OvertimeTab    departments={departments} />}
      {activeTab === 'statistics' && <StatisticsTab />}
    </div>
  )
}
