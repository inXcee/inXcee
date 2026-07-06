// Kat temizlik personeli yönetimi: personel ekle/düzenle/sil, atanmamış personeli
// tek tıkla bu kata ata. Personel listesi query'sini ve CRUD mutation'larını kendi
// içinde yönetir — sadece aktif block + floor prop olarak gelir.
import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import api from '../../shared/api/client.js'
import { BLOCK_BY_NAME } from '../../shared/blocks.js'
import { ALL_BLOCK_NAMES } from './shared.jsx'

export default function StaffSection({ block, floor }) {
  const qc = useQueryClient()

  const { data: allStaff = [] } = useQuery({
    queryKey: ['cleaning-staff'],
    queryFn: () => api.get('/housekeeping/staff').then(r => r.data),
  })

  const [showStaffForm, setShowStaffForm] = useState(false)
  const [staffName, setStaffName] = useState('')
  const [staffPhone, setStaffPhone] = useState('')
  const [editingStaffId, setEditingStaffId] = useState(null)
  const [editBlock, setEditBlock] = useState('')
  const [editFloor, setEditFloor] = useState(1)

  const invStaff = () => qc.invalidateQueries({ queryKey: ['cleaning-staff'] })

  const createStaff = useMutation({
    mutationFn: (data) => api.post('/housekeeping/staff', data),
    onSuccess: () => { invStaff(); setShowStaffForm(false); setStaffName(''); setStaffPhone('') },
  })
  const updateStaff = useMutation({
    mutationFn: ({ id, ...data }) => api.put(`/housekeeping/staff/${id}`, data),
    onSuccess: () => { invStaff(); setEditingStaffId(null) },
  })
  const deleteStaff = useMutation({
    mutationFn: (id) => api.delete(`/housekeeping/staff/${id}`),
    onSuccess: invStaff,
  })

  const floorStaff = allStaff.filter(s => s.assigned_block === block && s.assigned_floor === floor)
  const unassignedStaff = allStaff.filter(s => !s.assigned_block)

  return (
    <div style={{ padding: '12px 20px', borderBottom: '1px solid var(--border)', background: 'var(--surface2)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: floorStaff.length > 0 || showStaffForm ? '10px' : '0' }}>
        <div style={{ fontFamily: 'var(--mono)', fontSize: '9px', color: 'var(--text3)', letterSpacing: '2px', flex: 1 }}>
          TEMİZLİK PERSONELİ
          {floorStaff.length > 0 && <span style={{ marginLeft: '6px', color: 'var(--accent)' }}>· {floorStaff.length} KİŞİ</span>}
        </div>
        <button className="btn btn-ghost btn-xs" onClick={() => setShowStaffForm(!showStaffForm)}>
          {showStaffForm ? '✕ KAPAT' : '+ PERSONEL EKLE'}
        </button>
      </div>

      {/* Inline add form */}
      {showStaffForm && (
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'flex-end', marginBottom: '10px',
          background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '8px', padding: '12px' }}>
          <div style={{ flex: 1, minWidth: '140px' }}>
            <label style={{ fontFamily: 'var(--mono)', fontSize: '8px', color: 'var(--text3)', display: 'block', marginBottom: '3px' }}>AD SOYAD</label>
            <input className="form-input" value={staffName} onChange={e => setStaffName(e.target.value)} placeholder="Ad Soyad" style={{ fontSize: '12px' }} />
          </div>
          <div style={{ flex: 1, minWidth: '120px' }}>
            <label style={{ fontFamily: 'var(--mono)', fontSize: '8px', color: 'var(--text3)', display: 'block', marginBottom: '3px' }}>TELEFON</label>
            <input className="form-input" value={staffPhone} onChange={e => setStaffPhone(e.target.value)} placeholder="05XX..." style={{ fontSize: '12px' }} />
          </div>
          <div style={{ display: 'flex', gap: '5px' }}>
            <button className="btn btn-primary btn-xs" disabled={!staffName.trim() || createStaff.isPending}
              onClick={() => createStaff.mutate({ full_name: staffName.trim(), phone: staffPhone.trim() })}>
              {createStaff.isPending ? '...' : 'KAYDET'}
            </button>
            <button className="btn btn-ghost btn-xs" onClick={() => { setShowStaffForm(false); setStaffName(''); setStaffPhone('') }}>İPTAL</button>
          </div>
        </div>
      )}

      {/* Staff list for this floor */}
      {floorStaff.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
          {floorStaff.map(s => (
            <div key={s.id} style={{
              display: 'flex', alignItems: 'center', gap: '10px', padding: '8px 12px',
              background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '7px',
            }}>
              <div style={{
                width: '30px', height: '30px', borderRadius: '50%', flexShrink: 0,
                background: 'linear-gradient(135deg,var(--accent),var(--purple))',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontFamily: 'var(--display)', fontSize: '12px', color: '#fff',
              }}>{s.full_name.charAt(0).toUpperCase()}</div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontFamily: 'var(--sans)', fontSize: '12px', color: 'var(--text)', fontWeight: 600 }}>{s.full_name}</div>
                {s.phone && <div style={{ fontFamily: 'var(--mono)', fontSize: '9px', color: 'var(--text3)', marginTop: '1px' }}>{s.phone}</div>}
              </div>
              {editingStaffId === s.id ? (
                <div style={{ display: 'flex', gap: '5px', alignItems: 'center' }}>
                  <select className="form-select" value={editBlock} onChange={e => setEditBlock(e.target.value)} style={{ width: '65px', fontSize: '11px' }}>
                    <option value="">—</option>
                    {ALL_BLOCK_NAMES.map(b => <option key={b} value={b}>{b}</option>)}
                  </select>
                  <select className="form-select" value={editFloor} onChange={e => setEditFloor(+e.target.value)} style={{ width: '72px', fontSize: '11px' }}>
                    {Array.from({ length: BLOCK_BY_NAME[editBlock]?.floors ?? 2 }, (_, i) => i + 1).map(f => (
                      <option key={f} value={f}>Kat {f}</option>
                    ))}
                  </select>
                  <button className="btn btn-primary btn-xs" disabled={updateStaff.isPending}
                    onClick={() => updateStaff.mutate({ id: s.id, assigned_block: editBlock || null, assigned_floor: editBlock ? editFloor : null })}>
                    {updateStaff.isPending ? '...' : '✓'}
                  </button>
                  <button className="btn btn-ghost btn-xs" onClick={() => setEditingStaffId(null)}>✕</button>
                </div>
              ) : (
                <div style={{ display: 'flex', gap: '5px', alignItems: 'center' }}>
                  <span style={{ fontFamily: 'var(--mono)', fontSize: '9px', padding: '2px 7px', background: 'rgba(99,102,241,.12)', border: '1px solid rgba(99,102,241,.3)', borderRadius: '4px', color: 'var(--accent)' }}>
                    {s.assigned_block} · KAT {s.assigned_floor}
                  </span>
                  <button className="btn btn-ghost btn-xs" onClick={() => { setEditingStaffId(s.id); setEditBlock(s.assigned_block || ''); setEditFloor(s.assigned_floor || 1) }} title="Düzenle">✎</button>
                  <button className="btn btn-ghost btn-xs" onClick={() => deleteStaff.mutate(s.id)} title="Kaldır" style={{ color: 'var(--red)' }}>✕</button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Unassigned staff quick-assign */}
      {unassignedStaff.length > 0 && (
        <div style={{ marginTop: floorStaff.length > 0 ? '8px' : '0' }}>
          <div style={{ fontFamily: 'var(--mono)', fontSize: '8px', color: 'var(--text4)', letterSpacing: '1.5px', marginBottom: '6px' }}>
            ATANMAMIŞ PERSONEL — tıklayarak bu kata ata
          </div>
          <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
            {unassignedStaff.map(s => (
              <button key={s.id} className="btn btn-ghost btn-xs"
                style={{ fontSize: '10px', border: '1px dashed var(--border2)', borderRadius: '6px', padding: '4px 10px' }}
                disabled={updateStaff.isPending}
                onClick={() => updateStaff.mutate({ id: s.id, assigned_block: block, assigned_floor: floor })}>
                + {s.full_name}
              </button>
            ))}
          </div>
        </div>
      )}

      {floorStaff.length === 0 && !showStaffForm && unassignedStaff.length === 0 && (
        <div style={{ fontFamily: 'var(--mono)', fontSize: '10px', color: 'var(--text4)', padding: '4px 0' }}>
          Bu kata henüz personel atanmamış
        </div>
      )}
    </div>
  )
}
