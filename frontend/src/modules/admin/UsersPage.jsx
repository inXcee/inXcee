import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import api from '../../shared/api/client.js'
import { useToastStore } from '../../shared/store/toastStore.js'
import { confirmDialog } from '../../shared/components/ConfirmDialog.jsx'
import PasswordStrengthInput from '../../shared/components/PasswordStrengthInput.jsx'

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

const MOBILE_ROLES = new Set(['housekeeper', 'technical', 'laundry', 'shift_supervisor', 'campus_manager'])

function UserForm({ user, onSubmit, onCancel }) {
  const [form, setForm] = useState({
    username: user?.username || '',
    password: '',
    role: user?.role || 'technical',
    full_name: user?.full_name || '',
    assigned_block: user?.assigned_block || '',
    assigned_floor: user?.assigned_floor || '',
    email: user?.email || '',
    phone: user?.phone || '',
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
              <PasswordStrengthInput
                value={form.password}
                username={form.username}
                onChange={v => setForm(f => ({ ...f, password: v }))}
              />
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
          <div>
            <label className="form-label">TELEFON (WhatsApp icin)</label>
            <input className="form-input" type="tel" value={form.phone}
              placeholder="0532 123 45 67"
              onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} />
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

function PinModal({ userId, onClose }) {
  const [pin, setPin] = useState('')
  const qc = useQueryClient()
  const mutation = useMutation({
    mutationFn: () => api.patch(`/users/${userId}/mobile-pin`, { pin: pin || null }),
    onSuccess: () => { onClose(); qc.invalidateQueries({ queryKey: ['users'] }) },
  })

  return (
    <div className="modal-overlay mobile-fullscreen" style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.6)', zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
      onClick={onClose}>
      <div className="panel" style={{ width: '360px' }} onClick={e => e.stopPropagation()}>
        <div style={{ height: '2px', background: 'var(--accent)' }} />
        <div className="panel-header"><div className="panel-title">MOBİL PIN YÖNETİMİ</div></div>
        <div className="panel-body">
          <label className="form-label">4 HANELİ PIN (boş bırak = PIN kaldır)</label>
          <input className="form-input" type="password" inputMode="numeric" maxLength={4}
            value={pin} onChange={e => setPin(e.target.value.replace(/\D/g, '').slice(0, 4))}
            placeholder="1234" autoFocus />
          {mutation.error && <div className="alert alert-danger" style={{ marginTop: '8px' }}>{mutation.error.response?.data?.error || 'Hata'}</div>}
          <div style={{ display: 'flex', gap: '8px', marginTop: '12px' }}>
            <button className="btn btn-primary" onClick={() => mutation.mutate()} disabled={mutation.isPending || (pin.length > 0 && pin.length < 4)}>
              {mutation.isPending ? 'KAYDEDİLİYOR...' : 'KAYDET'}
            </button>
            <button className="btn btn-ghost" onClick={onClose}>İPTAL</button>
          </div>
        </div>
      </div>
    </div>
  )
}

function generateStrongPassword() {
  const upper = 'ABCDEFGHJKLMNPQRSTUVWXYZ'
  const lower = 'abcdefghijkmnpqrstuvwxyz'
  const digits = '23456789'
  const symbols = '!@#$%&*'
  const all = upper + lower + digits + symbols
  const pick = (set) => set[Math.floor(Math.random() * set.length)]
  let pw = pick(upper) + pick(lower) + pick(digits) + pick(symbols)
  for (let i = 0; i < 8; i++) pw += pick(all)
  return pw.split('').sort(() => Math.random() - 0.5).join('')
}

function PasswordModal({ userId, onClose }) {
  const [pw, setPw] = useState('')
  const [generated, setGenerated] = useState(false)
  const qc = useQueryClient()
  const mutation = useMutation({
    mutationFn: () => api.patch(`/users/${userId}/password`, { password: pw }),
    onSuccess: () => { onClose(); qc.invalidateQueries({ queryKey: ['users'] }) },
  })

  const handleGenerate = () => {
    setPw(generateStrongPassword())
    setGenerated(true)
  }

  return (
    <div className="modal-overlay mobile-fullscreen" style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.6)', zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
      onClick={onClose}>
      <div className="panel" style={{ width: '400px' }} onClick={e => e.stopPropagation()}>
        <div style={{ height: '2px', background: 'var(--accent)' }} />
        <div className="panel-header"><div className="panel-title">SIFRE DEGISTIR</div></div>
        <div className="panel-body">
          <label className="form-label">YENI SIFRE</label>
          <PasswordStrengthInput value={pw} onChange={(v) => { setPw(v); setGenerated(false) }} autoFocus />
          <button type="button" className="btn btn-ghost btn-xs" onClick={handleGenerate} style={{ marginTop: '6px' }}>
            RASTGELE URET
          </button>
          {generated && pw && (
            <div className="alert" style={{ marginTop: '8px', background: 'var(--accent)', color: '#000', fontFamily: 'var(--mono)', fontSize: '13px', letterSpacing: '1px', wordBreak: 'break-all' }}>
              {pw}
              <div style={{ fontSize: '10px', marginTop: '4px', opacity: 0.7 }}>
                BU SIFREYI KOPYALAYIP KULLANICIYA GUVENLI KANALLA ILET. KAYDETTIKTEN SONRA TEKRAR GOSTERILMEZ.
              </div>
            </div>
          )}
          {mutation.error && <div className="alert alert-danger" style={{ marginTop: '8px' }}>{mutation.error.response?.data?.error || 'Hata'}</div>}
          <div style={{ display: 'flex', gap: '8px', marginTop: '12px' }}>
            <button className="btn btn-primary" onClick={() => mutation.mutate()} disabled={mutation.isPending || !pw}>
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
  const [pinUserId, setPinUserId] = useState(null)
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

  const addToast = useToastStore(s => s.addToast)
  const deleteMut = useMutation({
    mutationFn: id => api.delete(`/users/${id}`),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['users'] }); addToast('Kullanıcı silindi', 'success') },
    onError: e => addToast(e?.response?.data?.error || 'Silme başarısız', 'error'),
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
            <table className="data-table responsive-stack">
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
                    <td data-label="Kullanici" style={{ fontFamily: 'var(--mono)', fontWeight: 500 }}>{u.username}</td>
                    <td data-label="Ad Soyad">{u.full_name}</td>
                    <td data-label="Rol">
                      <span className={`badge ${ROLE_COLORS[u.role] || 'badge-gray'}`} style={{ fontSize: '9px' }}>
                        {ROLES.find(r => r.value === u.role)?.label || u.role}
                      </span>
                    </td>
                    <td data-label="E-Posta" style={{ fontFamily: 'var(--mono)', fontSize: '11px' }}>{u.email || '-'}</td>
                    <td data-label="Blok" style={{ fontFamily: 'var(--mono)', fontSize: '11px' }}>{u.assigned_block || '-'}</td>
                    <td data-label="Kat" style={{ fontFamily: 'var(--mono)', fontSize: '11px' }}>{u.assigned_floor || '-'}</td>
                    <td>
                      <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                        <button className="btn btn-ghost btn-xs" onClick={() => setEditUser(u)}>Duzenle</button>
                        <button className="btn btn-ghost btn-xs" onClick={() => setPwUserId(u.id)}>Sifre</button>
                        {MOBILE_ROLES.has(u.role) && (
                          <button className="btn btn-ghost btn-xs" onClick={() => setPinUserId(u.id)}
                            style={{ borderColor: u.has_pin ? '#10b981' : '#e5e7eb', color: u.has_pin ? '#10b981' : undefined }}>
                            {u.has_pin ? '✓ PIN' : '✗ PIN'}
                          </button>
                        )}
                        <button className="btn btn-danger btn-xs"
                          onClick={async () => { if (await confirmDialog({ title: 'Kullanıcı Sil', body: `${u.username} silinsin mi?`, danger: true })) deleteMut.mutate(u.id) }}>
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
      {pinUserId && <PinModal userId={pinUserId} onClose={() => setPinUserId(null)} />}
    </div>
  )
}
