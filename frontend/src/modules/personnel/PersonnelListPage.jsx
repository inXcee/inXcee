import { useState, useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import api from '../../shared/api/client.js'

export default function PersonnelListPage() {
  const nav = useNavigate()
  const [q, setQ] = useState('')
  const [deptId, setDeptId] = useState('')

  const { data: staff = [], isLoading } = useQuery({
    queryKey: ['personnel-list'],
    queryFn: () => api.get('/shifts/staff').then(r => r.data),
  })
  const { data: departments = [] } = useQuery({
    queryKey: ['departments'],
    queryFn: () => api.get('/shifts/departments').then(r => r.data),
  })

  const filtered = useMemo(() => {
    const low = q.trim().toLowerCase()
    return staff.filter(s => {
      if (deptId && String(s.department_id) !== String(deptId)) return false
      if (!low) return true
      return (
        s.full_name?.toLowerCase().includes(low) ||
        s.tc_no?.includes(low) ||
        s.phone?.includes(low) ||
        s.position?.toLowerCase().includes(low) ||
        s.dept_name?.toLowerCase().includes(low) ||
        s.role_label?.toLowerCase().includes(low)
      )
    })
  }, [staff, q, deptId])

  return (
    <div style={{ maxWidth: 1280 }} className="fade-up">
      <div style={{ marginBottom: 16 }}>
        <h1 style={{ fontSize: 28, letterSpacing: 4, color: 'var(--text)', margin: 0 }}>PERSONEL</h1>
        <p style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--text3)', marginTop: 4, letterSpacing: 1.5 }}>
          {filtered.length} / {staff.length} KAYIT — TIKLAYINCA 360° GÖRÜNÜM
        </p>
      </div>

      <div style={{ display: 'flex', gap: 8, marginBottom: 14, flexWrap: 'wrap' }}>
        <input className="form-input" placeholder="🔍 Ad / TC / telefon / pozisyon ara…"
          value={q} onChange={e => setQ(e.target.value)}
          style={{ flex: 1, minWidth: 280, fontSize: 13, borderRadius: 10 }} autoFocus />
        <select className="form-select" value={deptId} onChange={e => setDeptId(e.target.value)}
          style={{ width: 'auto', minWidth: 180, fontSize: 12, borderRadius: 10 }}>
          <option value="">Tüm departmanlar</option>
          {departments.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
        </select>
      </div>

      {isLoading ? (
        <div style={{ padding: 40, color: 'var(--text3)' }}>Yükleniyor…</div>
      ) : !filtered.length ? (
        <div style={{ padding: 60, textAlign: 'center', background: 'var(--surface)', borderRadius: 14, border: '1px solid var(--border)' }}>
          <div style={{ fontSize: 40, opacity: 0.3, marginBottom: 10 }}>👥</div>
          <div style={{ fontFamily: 'var(--display)', fontSize: 14, letterSpacing: 2 }}>SONUÇ BULUNAMADI</div>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 10 }}>
          {filtered.map(s => (
            <div key={s.id} onClick={() => nav(`/personnel/${s.id}`)} style={{
              padding: 14, borderRadius: 12, cursor: 'pointer',
              background: 'var(--surface)', border: '1px solid var(--border)',
              borderLeft: `4px solid ${s.dept_color ? s.dept_color.replace('bg-', '#').replace('-400', '') : 'var(--accent)'}`,
              transition: 'transform .15s',
            }}
              onMouseEnter={e => e.currentTarget.style.transform = 'translateY(-2px)'}
              onMouseLeave={e => e.currentTarget.style.transform = 'none'}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{
                  width: 44, height: 44, borderRadius: '50%', flexShrink: 0,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  background: s.gender === 'female' ? 'rgba(244,114,182,.15)' : 'rgba(59,130,246,.15)',
                  color: s.gender === 'female' ? '#f472b6' : 'var(--blue)',
                  fontFamily: 'var(--display)', fontSize: 18, fontWeight: 700,
                  border: `2px solid ${s.gender === 'female' ? '#f472b6' : 'var(--blue)'}`,
                }}>
                  {s.full_name?.charAt(0)?.toUpperCase() || '?'}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 14, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {s.full_name}
                  </div>
                  {s.dept_name && (
                    <div style={{ fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--text3)', marginTop: 2 }}>
                      {s.dept_name}{s.role_label ? ` · ${s.role_label}` : ''}
                    </div>
                  )}
                  {s.position && (
                    <div style={{ fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--text4)' }}>{s.position}</div>
                  )}
                </div>
              </div>
              <div style={{ marginTop: 10, paddingTop: 10, borderTop: '1px solid var(--border)', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 4, fontSize: 10, fontFamily: 'var(--mono)', color: 'var(--text3)' }}>
                {s.tc_no && <div>🆔 {s.tc_no}</div>}
                {s.phone && <div>📞 {s.phone}</div>}
                {!s.is_active && <div style={{ color: 'var(--amber)' }}>🗄 ARŞİV</div>}
              </div>
            </div>
          ))}
        </div>
      )}

      <div style={{ marginTop: 14, fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--text4)' }}>
        💡 Kart üzerine tıklayınca 9 sekmeli 360° görünüm açılır (Genel · Vardiya · Servis · Yatakhane · Disiplin · İzin/Mesai · Notlar · Acil · Timeline)
      </div>
    </div>
  )
}
