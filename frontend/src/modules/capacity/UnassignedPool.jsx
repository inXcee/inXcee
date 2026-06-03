// Odaya atanmamış personel havuzu: arama/firma filtresi, çoklu seçim ve
// seçili odaya toplu/tekil yerleştirme (drag-drop kaynağı da budur).
import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import api from '../../shared/api/client.js'

export default function UnassignedPool({ selectedRoom, onAssigned }) {
  const qc = useQueryClient()
  const [searchQ, setSearchQ] = useState('')
  const [selected, setSelected] = useState(new Set())
  const [assignMsg, setAssignMsg] = useState(null)
  const [companyFilter, setCompanyFilter] = useState('')

  const { data: unassigned = [], isLoading } = useQuery({
    queryKey: ['unassigned-personnel', searchQ],
    queryFn: () => api.get(`/capacity/unassigned${searchQ.trim().length >= 2 ? `?q=${encodeURIComponent(searchQ)}` : ''}`).then(r => r.data),
    refetchInterval: 15000,
  })

  const mutBulkAssign = useMutation({
    mutationFn: ({ personnelIds, roomId }) => api.post('/capacity/bulk/assign', { personnel_ids: personnelIds, room_id: roomId }),
    onSuccess: () => {
      setSelected(new Set())
      setAssignMsg({ ok: true, msg: 'Personeller odaya yerleştirildi.' })
      qc.invalidateQueries(['unassigned-personnel'])
      qc.invalidateQueries(['rooms'])
      qc.invalidateQueries(['room-personnel'])
      onAssigned?.()
    },
    onError: (e) => setAssignMsg({ ok: false, msg: e.response?.data?.error || 'Atama başarısız.' }),
  })

  const mutSingleAssign = useMutation({
    mutationFn: ({ personnelId, roomId }) => api.post('/capacity/reassign', { personnel_id: personnelId, room_id: roomId }),
    onSuccess: () => {
      qc.invalidateQueries(['unassigned-personnel'])
      qc.invalidateQueries(['rooms'])
      qc.invalidateQueries(['room-personnel'])
      onAssigned?.()
    },
    onError: (e) => setAssignMsg({ ok: false, msg: e.response?.data?.error || 'Atama başarısız.' }),
  })

  // Get unique companies for filter
  const companies = [...new Set(unassigned.map(p => p.company).filter(Boolean))].sort()

  const filtered = companyFilter
    ? unassigned.filter(p => p.company === companyFilter)
    : unassigned

  const toggleSelect = (id) => {
    setSelected(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  const selectAll = () => {
    if (selected.size === filtered.length) {
      setSelected(new Set())
    } else {
      setSelected(new Set(filtered.map(p => p.id)))
    }
  }

  const selectCompany = (company) => {
    const companyIds = unassigned.filter(p => p.company === company).map(p => p.id)
    setSelected(new Set(companyIds))
    setCompanyFilter(company)
  }

  if (isLoading) return null

  return (
    <div className="panel fade-up" style={{ marginTop: '18px' }}>
      <div style={{ height: '3px', background: 'linear-gradient(90deg, var(--accent), var(--red2))' }} />
      <div className="panel-header">
        <div>
          <div className="panel-title" style={{ fontSize: '16px' }}>
            ODASIZ PERSONEL
            <span style={{ marginLeft: '8px', fontFamily: 'var(--mono)', fontSize: '11px', color: 'var(--accent)', fontWeight: 700 }}>
              {unassigned.length}
            </span>
          </div>
          <div className="panel-subtitle">ODA ATANMAMIŞ PERSONELLER · SEÇ VE YERLEŞTİR</div>
        </div>
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
          {selected.size > 0 && selectedRoom && (
            <button
              className="btn btn-primary btn-sm"
              onClick={() => {
                setAssignMsg(null)
                mutBulkAssign.mutate({ personnelIds: [...selected], roomId: selectedRoom.id })
              }}
              disabled={mutBulkAssign.isPending}
            >
              {mutBulkAssign.isPending ? 'YERLEŞTİRİLİYOR...' : `${selected.size} KİŞİYİ ODA ${selectedRoom.room_no}'YA YERLEŞTİR`}
            </button>
          )}
          {selected.size > 0 && !selectedRoom && (
            <span style={{ fontFamily: 'var(--mono)', fontSize: '10px', color: 'var(--accent)' }}>
              {selected.size} kişi seçili — yukarıdan oda seçin
            </span>
          )}
        </div>
      </div>

      <div className="panel-body">
        {assignMsg && (
          <div className={`alert ${assignMsg.ok ? 'alert-success' : 'alert-danger'}`} style={{ marginBottom: '12px' }}>
            <span>{assignMsg.ok ? '✓' : '!'}</span><span>{assignMsg.msg}</span>
          </div>
        )}

        {unassigned.length === 0 ? (
          <div className="empty-state" style={{ padding: '20px' }}>
            <div className="empty-icon" style={{ fontSize: '28px' }}>✓</div>
            <div className="empty-sub">Tüm personeller odalara yerleştirilmiş</div>
          </div>
        ) : (
          <>
            {/* Filters row */}
            <div style={{ display: 'flex', gap: '10px', marginBottom: '14px', flexWrap: 'wrap', alignItems: 'center' }}>
              <input
                className="form-input"
                placeholder="İsim, firma veya TC ara..."
                value={searchQ}
                onChange={e => { setSearchQ(e.target.value); setSelected(new Set()) }}
                style={{ flex: 1, minWidth: '180px', maxWidth: '300px' }}
              />
              {companies.length > 1 && (
                <select
                  className="form-input"
                  value={companyFilter}
                  onChange={e => { setCompanyFilter(e.target.value); setSelected(new Set()) }}
                  style={{ minWidth: '140px', maxWidth: '220px' }}
                >
                  <option value="">Tüm Firmalar ({unassigned.length})</option>
                  {companies.map(c => (
                    <option key={c} value={c}>{c} ({unassigned.filter(p => p.company === c).length})</option>
                  ))}
                </select>
              )}
              <button className="btn btn-ghost btn-sm" onClick={selectAll}>
                {selected.size === filtered.length ? 'SEÇİMİ KALDIR' : 'TÜMÜNÜ SEÇ'}
              </button>
            </div>

            {/* Company quick-select chips */}
            {companies.length > 1 && (
              <div style={{ display: 'flex', gap: '6px', marginBottom: '12px', flexWrap: 'wrap' }}>
                {companies.map(c => {
                  const count = unassigned.filter(p => p.company === c).length
                  return (
                    <button
                      key={c}
                      className="btn btn-ghost btn-xs"
                      style={{
                        fontSize: '9px', padding: '3px 8px',
                        background: companyFilter === c ? 'var(--accent)' : undefined,
                        color: companyFilter === c ? '#000' : undefined,
                      }}
                      onClick={() => selectCompany(c)}
                    >
                      {c} ({count})
                    </button>
                  )
                })}
              </div>
            )}

            {/* Personnel list */}
            <div style={{
              maxHeight: '360px', overflowY: 'auto',
              border: '1px solid var(--border)', borderRadius: '7px',
            }}>
              {filtered.map(p => (
                <div
                  key={p.id}
                  draggable
                  onDragStart={e => { e.dataTransfer.setData('personnel-id', String(p.id)); e.dataTransfer.effectAllowed = 'move'; e.currentTarget.style.opacity = '0.4' }}
                  onDragEnd={e => { e.currentTarget.style.opacity = '1' }}
                  style={{
                    display: 'flex', alignItems: 'center', gap: '10px',
                    padding: '8px 14px', borderBottom: '1px solid rgba(35,45,63,.3)',
                    background: selected.has(p.id) ? 'rgba(245,166,35,.08)' : 'transparent',
                    transition: 'background .1s', cursor: 'grab',
                  }}
                >
                  <input
                    type="checkbox"
                    checked={selected.has(p.id)}
                    onChange={() => toggleSelect(p.id)}
                    style={{ accentColor: 'var(--accent)' }}
                  />
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: '13px', fontWeight: 600 }}>{p.full_name}</div>
                    <div style={{ fontFamily: 'var(--mono)', fontSize: '9px', color: 'var(--text3)', marginTop: '1px' }}>
                      {p.company || '—'} · {p.phone_number || '—'}
                      {p.check_in_date && (
                        <span style={{ marginLeft: '6px' }}>
                          giriş: {new Date(p.check_in_date).toLocaleDateString('tr-TR')}
                        </span>
                      )}
                    </div>
                  </div>
                  {selectedRoom && (
                    <button
                      className="btn btn-primary btn-xs"
                      style={{ fontSize: '9px' }}
                      onClick={() => mutSingleAssign.mutate({ personnelId: p.id, roomId: selectedRoom.id })}
                      disabled={mutSingleAssign.isPending}
                    >
                      ODA {selectedRoom.room_no}
                    </button>
                  )}
                </div>
              ))}
            </div>

            <div style={{ fontFamily: 'var(--mono)', fontSize: '9px', color: 'var(--text3)', marginTop: '8px' }}>
              {filtered.length} kişi listeleniyor
              {selected.size > 0 && ` · ${selected.size} seçili`}
              {selectedRoom && ` · Hedef: ODA ${selectedRoom.room_no} (${selectedRoom.block})`}
            </div>
          </>
        )}
      </div>
    </div>
  )
}
