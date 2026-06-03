// Teknisyen panelleri: müsait teknisyenler (vardiyaya göre gruplu, salt-görünüm)
// ve teknisyen yönetimi (ekle/sil/kullanıcı bağla CRUD).
import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import api from '../../shared/api/client.js'
import { confirmDialog } from '../../shared/components/ConfirmDialog.jsx'
import { SHIFTS, SPECIALTIES, getCurrentShift } from './shared.jsx'

export function AvailableTechnicians() {
  const { data: allTechs = [] } = useQuery({
    queryKey: ['technicians'],
    queryFn: () => api.get('/maintenance/technicians').then(r => r.data),
    refetchInterval: 60000,
  })

  const currentShift = getCurrentShift()

  // Group by shift, current shift first
  const shiftOrder = [currentShift, ...['1', '2', '3'].filter(s => s !== currentShift)]
  const grouped = shiftOrder.map(s => ({
    shift: s,
    info: SHIFTS[s],
    techs: allTechs.filter(t => t.shift === s),
    isCurrent: s === currentShift,
  })).filter(g => g.techs.length > 0)

  if (allTechs.length === 0) return null

  return (
    <div className="panel fade-up-1" style={{ marginBottom: '16px' }}>
      <div style={{ height: '2px', background: 'linear-gradient(90deg,var(--teal),var(--blue))' }} />
      <div className="panel-header">
        <div>
          <div className="panel-title">MÜSAİT TEKNİSYENLER</div>
          <div className="panel-subtitle">Şu an: {SHIFTS[currentShift].label} ({SHIFTS[currentShift].hours})</div>
        </div>
      </div>
      <div className="panel-body" style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
        {grouped.map(g => (
          <div key={g.shift}>
            <div style={{
              display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px',
            }}>
              <div style={{
                width: '8px', height: '8px', borderRadius: '50%',
                background: g.isCurrent ? 'var(--green)' : 'var(--border2)',
                boxShadow: g.isCurrent ? '0 0 6px var(--green)' : 'none',
              }} />
              <span style={{
                fontFamily: 'var(--mono)', fontSize: '9px', letterSpacing: '1.5px',
                color: g.isCurrent ? 'var(--text)' : 'var(--text3)',
                fontWeight: g.isCurrent ? 700 : 400,
              }}>
                {g.info.label.toUpperCase()} · {g.info.hours}
              </span>
              {g.isCurrent && (
                <span style={{
                  fontFamily: 'var(--mono)', fontSize: '8px', padding: '1px 6px',
                  background: 'rgba(39,201,106,.15)', border: '1px solid rgba(39,201,106,.3)',
                  borderRadius: '4px', color: 'var(--green)', letterSpacing: '1px',
                }}>AKTİF</span>
              )}
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
              {g.techs.map(t => (
                <div key={t.id} style={{
                  display: 'flex', alignItems: 'center', gap: '8px',
                  padding: '8px 12px', borderRadius: '8px',
                  background: g.isCurrent ? 'rgba(39,201,106,.06)' : 'var(--surface2)',
                  border: g.isCurrent ? '1px solid rgba(39,201,106,.2)' : '1px solid var(--border)',
                  opacity: g.isCurrent ? 1 : 0.6,
                }}>
                  <div style={{
                    width: '28px', height: '28px', borderRadius: '50%', flexShrink: 0,
                    background: g.isCurrent
                      ? 'linear-gradient(135deg,var(--teal),var(--green))'
                      : 'linear-gradient(135deg,var(--text4),var(--text3))',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontFamily: 'var(--display)', fontSize: '11px', color: '#fff',
                  }}>{t.full_name.charAt(0)}</div>
                  <div>
                    <div style={{ fontFamily: 'var(--sans)', fontSize: '12px', fontWeight: 600, color: 'var(--text)' }}>
                      {t.full_name}
                    </div>
                    <div style={{ fontFamily: 'var(--mono)', fontSize: '9px', color: 'var(--text3)' }}>
                      {SPECIALTIES[t.specialty] || t.specialty}
                      {t.phone && <span> · <a href={`tel:${t.phone}`} style={{ color: 'var(--accent)', textDecoration: 'none' }}>{t.phone}</a></span>}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

export function TechnicianManager() {
  const qc = useQueryClient()
  const [showAdd, setShowAdd] = useState(false)
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [specialty, setSpecialty] = useState('genel')
  const [shift, setShift] = useState('1')

  const { data: technicians = [] } = useQuery({
    queryKey: ['technicians'],
    queryFn: () => api.get('/maintenance/technicians').then(r => r.data),
  })

  const { data: users = [] } = useQuery({
    queryKey: ['users-technical'],
    queryFn: () => api.get('/users').then(r => r.data.filter(u => u.role === 'technical')),
  })

  const inv = () => qc.invalidateQueries({ queryKey: ['technicians'] })

  const createMut = useMutation({
    mutationFn: (data) => api.post('/maintenance/technicians', data),
    onSuccess: () => { inv(); setShowAdd(false); setName(''); setPhone(''); setSpecialty('genel'); setShift('1') },
  })

  const updateMut = useMutation({
    mutationFn: ({ id, data }) => api.put(`/maintenance/technicians/${id}`, data),
    onSuccess: inv,
  })

  const deleteMut = useMutation({
    mutationFn: (id) => api.delete(`/maintenance/technicians/${id}`),
    onSuccess: inv,
  })

  const linkedUserIds = new Set(technicians.map(t => t.user_id).filter(Boolean))

  return (
    <div className="panel fade-up" style={{ marginBottom: '16px' }}>
      <div style={{ height: '2px', background: 'linear-gradient(90deg,var(--teal),var(--blue))' }} />
      <div className="panel-header">
        <div>
          <div className="panel-title">TEKNİSYEN YÖNETİMİ</div>
          <div className="panel-subtitle">{technicians.length} AKTİF TEKNİSYEN</div>
        </div>
        <button className="btn btn-ghost btn-xs" onClick={() => setShowAdd(!showAdd)}>
          {showAdd ? '✕ KAPAT' : '+ EKLE'}
        </button>
      </div>
      <div className="panel-body">
        {showAdd && (
          <div style={{
            display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'flex-end', marginBottom: '12px',
            background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '8px', padding: '12px',
          }}>
            <div style={{ flex: 1, minWidth: '130px' }}>
              <label style={{ fontFamily: 'var(--mono)', fontSize: '8px', color: 'var(--text3)', display: 'block', marginBottom: '3px' }}>AD SOYAD</label>
              <input className="form-input" value={name} onChange={e => setName(e.target.value)} placeholder="Ad Soyad" style={{ fontSize: '12px' }} />
            </div>
            <div style={{ flex: 1, minWidth: '110px' }}>
              <label style={{ fontFamily: 'var(--mono)', fontSize: '8px', color: 'var(--text3)', display: 'block', marginBottom: '3px' }}>TELEFON</label>
              <input className="form-input" value={phone} onChange={e => setPhone(e.target.value)} placeholder="05XX..." style={{ fontSize: '12px' }} />
            </div>
            <div style={{ minWidth: '100px' }}>
              <label style={{ fontFamily: 'var(--mono)', fontSize: '8px', color: 'var(--text3)', display: 'block', marginBottom: '3px' }}>UZMANLIK</label>
              <select className="form-select" value={specialty} onChange={e => setSpecialty(e.target.value)} style={{ fontSize: '12px' }}>
                {Object.entries(SPECIALTIES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </div>
            <div style={{ minWidth: '120px' }}>
              <label style={{ fontFamily: 'var(--mono)', fontSize: '8px', color: 'var(--text3)', display: 'block', marginBottom: '3px' }}>VARDİYA</label>
              <select className="form-select" value={shift} onChange={e => setShift(e.target.value)} style={{ fontSize: '12px' }}>
                {Object.entries(SHIFTS).map(([k, v]) => <option key={k} value={k}>{v.label} ({v.hours})</option>)}
              </select>
            </div>
            <div style={{ display: 'flex', gap: '5px' }}>
              <button className="btn btn-primary btn-xs" disabled={!name.trim() || createMut.isPending}
                onClick={() => createMut.mutate({ full_name: name.trim(), phone: phone.trim(), specialty, shift })}>
                {createMut.isPending ? '...' : 'KAYDET'}
              </button>
              <button className="btn btn-ghost btn-xs" onClick={() => setShowAdd(false)}>İPTAL</button>
            </div>
          </div>
        )}

        {technicians.length === 0 ? (
          <div className="empty-state" style={{ padding: '16px 0' }}>
            <div className="empty-icon" style={{ fontSize: '24px' }}>⚙</div>
            <div className="empty-sub">Teknisyen kaydı yok</div>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            {technicians.map(t => {
              const si = SHIFTS[t.shift] || SHIFTS['1']
              return (
                <div key={t.id} style={{
                  display: 'flex', alignItems: 'center', gap: '10px', padding: '8px 12px',
                  background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: '7px',
                }}>
                  <div style={{
                    width: '30px', height: '30px', borderRadius: '50%', flexShrink: 0,
                    background: 'linear-gradient(135deg,var(--teal),var(--blue))',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontFamily: 'var(--display)', fontSize: '12px', color: '#fff',
                  }}>{t.full_name.charAt(0).toUpperCase()}</div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontFamily: 'var(--sans)', fontSize: '12px', color: 'var(--text)', fontWeight: 600 }}>{t.full_name}</div>
                    <div style={{ fontFamily: 'var(--mono)', fontSize: '9px', color: 'var(--text3)', marginTop: '1px' }}>
                      {SPECIALTIES[t.specialty] || t.specialty}
                      {t.phone && ` · ${t.phone}`}
                    </div>
                  </div>
                  <span style={{
                    fontFamily: 'var(--mono)', fontSize: '8px', padding: '2px 7px',
                    background: `color-mix(in srgb, ${si.color} 12%, transparent)`,
                    border: `1px solid color-mix(in srgb, ${si.color} 30%, transparent)`,
                    borderRadius: '4px', color: si.color, letterSpacing: '0.5px',
                  }}>{si.label}</span>
                  <select
                    className="form-select"
                    value={t.user_id || ''}
                    onChange={e => updateMut.mutate({ id: t.id, data: { user_id: e.target.value ? +e.target.value : null } })}
                    title="Mobile uygulamada 'Bana atanmış' filtresi için kullanıcı bağlama"
                    style={{ fontSize: '10px', padding: '2px 4px', maxWidth: '120px' }}
                  >
                    <option value="">— kullanıcı yok —</option>
                    {users.map(u => (
                      <option key={u.id} value={u.id} disabled={linkedUserIds.has(u.id) && u.id !== t.user_id}>
                        {u.username}{linkedUserIds.has(u.id) && u.id !== t.user_id ? ' (bağlı)' : ''}
                      </option>
                    ))}
                  </select>
                  <button className="btn btn-ghost btn-xs" onClick={async () => { if (await confirmDialog({ title: 'Teknisyen Sil', body: `${t.full_name} silinsin mi?`, danger: true })) deleteMut.mutate(t.id) }} style={{ color: 'var(--red)' }}>✕</button>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
