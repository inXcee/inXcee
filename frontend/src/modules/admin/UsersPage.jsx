import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import api from '../../shared/api/client.js'

const ROLES = [
  { value: 'campus_manager', label: 'Kampus Muduru' },
  { value: 'shift_supervisor', label: 'Vardiya Amiri' },
  { value: 'technical', label: 'Teknik' },
  { value: 'laundry', label: 'Camasir' },
  { value: 'housekeeper', label: 'Meydanci' },
]

const ROLE_COLORS = {
  campus_manager: 'badge-red',
  shift_supervisor: 'badge-amber',
  technical: 'badge-blue',
  laundry: 'badge-green',
  housekeeper: 'badge-gray',
}

function UserForm({ user, onSubmit, onCancel }) {
  const [form, setForm] = useState({
    username: user?.username || '',
    password: '',
    role: user?.role || 'technical',
    full_name: user?.full_name || '',
    assigned_block: user?.assigned_block || '',
    assigned_floor: user?.assigned_floor || '',
    email: user?.email || '',
  })

  return (
    <div className="panel" style={{ marginBottom: '16px' }}>
      <div style={{ height: '2px', background: 'var(--accent)' }} />
      <div className="panel-header">
        <div className="panel-title">{user ? 'KULLANICI DUZENLE' : 'YENI KULLANICI'}</div>
      </div>
      <div className="panel-body">
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '12px' }}>
          <div>
            <label className="form-label">KULLANICI ADI</label>
            <input className="form-input" value={form.username} disabled={!!user}
              onChange={e => setForm(f => ({ ...f, username: e.target.value }))} />
          </div>
          {!user && (
            <div>
              <label className="form-label">SIFRE</label>
              <input className="form-input" type="password" value={form.password}
                onChange={e => setForm(f => ({ ...f, password: e.target.value }))} />
            </div>
          )}
          <div>
            <label className="form-label">AD SOYAD</label>
            <input className="form-input" value={form.full_name}
              onChange={e => setForm(f => ({ ...f, full_name: e.target.value }))} />
          </div>
          <div>
            <label className="form-label">ROL</label>
            <select className="form-select" value={form.role}
              onChange={e => setForm(f => ({ ...f, role: e.target.value }))}>
              {ROLES.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
            </select>
          </div>
          <div>
            <label className="form-label">BLOK</label>
            <input className="form-input" placeholder="orn: M1" value={form.assigned_block}
              onChange={e => setForm(f => ({ ...f, assigned_block: e.target.value }))} />
          </div>
          <div>
            <label className="form-label">KAT</label>
            <input className="form-input" type="number" value={form.assigned_floor}
              onChange={e => setForm(f => ({ ...f, assigned_floor: e.target.value }))} />
          </div>
          <div>
            <label className="form-label">E-POSTA</label>
            <input className="form-input" type="email" value={form.email}
              placeholder="kullanici@ornek.com"
              onChange={e => setForm(f => ({ ...f, email: e.target.value }))} />
          </div>
        </div>
        <div style={{ display: 'flex', gap: '8px', marginTop: '16px' }}>
          <button className="btn btn-primary" onClick={() => onSubmit(form)}>KAYDET</button>
          <button className="btn btn-ghost" onClick={onCancel}>IPTAL</button>
        </div>
      </div>
    </div>
  )
}

function PasswordModal({ userId, onClose }) {
  const [pw, setPw] = useState('')
  const qc = useQueryClient()
  const mutation = useMutation({
    mutationFn: () => api.patch(`/users/${userId}/password`, { password: pw }),
    onSuccess: () => { onClose(); qc.invalidateQueries({ queryKey: ['users'] }) },
  })

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.6)', zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
      onClick={onClose}>
      <div className="panel" style={{ width: '360px' }} onClick={e => e.stopPropagation()}>
        <div style={{ height: '2px', background: 'var(--accent)' }} />
        <div className="panel-header"><div className="panel-title">SIFRE DEGISTIR</div></div>
        <div className="panel-body">
          <label className="form-label">YENI SIFRE</label>
          <input className="form-input" type="password" value={pw} onChange={e => setPw(e.target.value)} autoFocus />
          {mutation.error && <div className="alert alert-danger" style={{ marginTop: '8px' }}>{mutation.error.response?.data?.error || 'Hata'}</div>}
          <div style={{ display: 'flex', gap: '8px', marginTop: '12px' }}>
            <button className="btn btn-primary" onClick={() => mutation.mutate()} disabled={mutation.isPending}>
              {mutation.isPending ? 'KAYDEDILIYOR...' : 'DEGISTIR'}
            </button>
            <button className="btn btn-ghost" onClick={onClose}>IPTAL</button>
          </div>
        </div>
      </div>
    </div>
  )
}

export default function UsersPage() {
  const [showForm, setShowForm] = useState(false)
  const [editUser, setEditUser] = useState(null)
  const [pwUserId, setPwUserId] = useState(null)
  const qc = useQueryClient()

  const { data: users, isLoading } = useQuery({
    queryKey: ['users'],
    queryFn: () => api.get('/users').then(r => r.data),
  })

  const createMut = useMutation({
    mutationFn: data => api.post('/users', data),
    onSuccess: () => { setShowForm(false); qc.invalidateQueries({ queryKey: ['users'] }) },
  })

  const updateMut = useMutation({
    mutationFn: ({ id, ...data }) => api.put(`/users/${id}`, data),
    onSuccess: () => { setEditUser(null); qc.invalidateQueries({ queryKey: ['users'] }) },
  })

  const deleteMut = useMutation({
    mutationFn: id => api.delete(`/users/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['users'] }),
  })

  return (
    <div>
      <div className="fade-up" style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '24px', flexWrap: 'wrap', gap: '12px' }}>
        <div>
          <h2 style={{ fontSize: '28px', letterSpacing: '4px' }}>KULLANICILAR</h2>
          <p style={{ fontFamily: 'var(--mono)', fontSize: '10px', color: 'var(--text3)', letterSpacing: '1px', marginTop: '4px' }}>
            SISTEM KULLANICI YONETIMI
          </p>
        </div>
        {!showForm && !editUser && (
          <button className="btn btn-primary" onClick={() => setShowForm(true)}>+ YENI KULLANICI</button>
        )}
      </div>

      {showForm && (
        <div className="fade-up-1">
          <UserForm onCancel={() => setShowForm(false)} onSubmit={data => createMut.mutate(data)} />
          {createMut.error && <div className="alert alert-danger">{createMut.error.response?.data?.error || 'Hata'}</div>}
        </div>
      )}

      {editUser && (
        <div className="fade-up-1">
          <UserForm user={editUser} onCancel={() => setEditUser(null)}
            onSubmit={data => updateMut.mutate({ id: editUser.id, ...data })} />
          {updateMut.error && <div className="alert alert-danger">{updateMut.error.response?.data?.error || 'Hata'}</div>}
        </div>
      )}

      <div className="panel fade-up-2">
        <div style={{ height: '2px', background: 'linear-gradient(90deg, var(--accent), var(--accent3))' }} />
        <div className="panel-header">
          <div className="panel-title">KAYITLI KULLANICILAR</div>
          <span className="badge badge-gray">{users?.length || 0} kullanici</span>
        </div>
        <div className="panel-body" style={{ overflowX: 'auto' }}>
          {isLoading ? (
            <div style={{ textAlign: 'center', padding: '40px', color: 'var(--text3)' }}>Yukleniyor...</div>
          ) : (
            <table className="data-table">
              <thead>
                <tr>
                  <th>Kullanici Adi</th>
                  <th>Ad Soyad</th>
                  <th>Rol</th>
                  <th>E-Posta</th>
                  <th>Blok</th>
                  <th>Kat</th>
                  <th>Islemler</th>
                </tr>
              </thead>
              <tbody>
                {(users || []).map(u => (
                  <tr key={u.id}>
                    <td style={{ fontFamily: 'var(--mono)', fontWeight: 500 }}>{u.username}</td>
                    <td>{u.full_name}</td>
                    <td>
                      <span className={`badge ${ROLE_COLORS[u.role] || 'badge-gray'}`} style={{ fontSize: '9px' }}>
                        {ROLES.find(r => r.value === u.role)?.label || u.role}
                      </span>
                    </td>
                    <td style={{ fontFamily: 'var(--mono)', fontSize: '11px' }}>{u.email || '-'}</td>
                    <td style={{ fontFamily: 'var(--mono)', fontSize: '11px' }}>{u.assigned_block || '-'}</td>
                    <td style={{ fontFamily: 'var(--mono)', fontSize: '11px' }}>{u.assigned_floor || '-'}</td>
                    <td>
                      <div style={{ display: 'flex', gap: '4px' }}>
                        <button className="btn btn-ghost btn-xs" onClick={() => setEditUser(u)}>Duzenle</button>
                        <button className="btn btn-ghost btn-xs" onClick={() => setPwUserId(u.id)}>Sifre</button>
                        <button className="btn btn-danger btn-xs"
                          onClick={() => { if (confirm(`${u.username} silinsin mi?`)) deleteMut.mutate(u.id) }}>
                          Sil
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {pwUserId && <PasswordModal userId={pwUserId} onClose={() => setPwUserId(null)} />}
    </div>
  )
}
