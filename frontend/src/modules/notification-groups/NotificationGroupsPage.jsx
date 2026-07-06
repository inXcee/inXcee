import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import api from '../../shared/api/client.js'
import { useToastStore } from '../../shared/store/toastStore.js'
import { confirmDialog } from '../../shared/components/ConfirmDialog.jsx'
import EmptyState from '../../shared/components/EmptyState.jsx'
import HelpHint from '../../shared/components/HelpHint.jsx'

const CHANNELS = [
  { value: 'app', label: 'Uygulama' },
  { value: 'email', label: 'E-posta' },
  { value: 'whatsapp', label: 'WhatsApp' },
  { value: 'push', label: 'Push' },
]

export default function NotificationGroupsPage() {
  const qc = useQueryClient()
  const toast = useToastStore(s => s.push)
  const [editing, setEditing] = useState(null)
  const [selectedId, setSelectedId] = useState(null)

  const { data: groups = [] } = useQuery({
    queryKey: ['notif-groups'],
    queryFn: () => api.get('/notification-groups').then(r => r.data),
  })
  const { data: detail } = useQuery({
    queryKey: ['notif-group', selectedId],
    queryFn: () => api.get(`/notification-groups/${selectedId}`).then(r => r.data),
    enabled: !!selectedId,
  })
  const { data: users = [] } = useQuery({
    queryKey: ['users-for-groups'],
    queryFn: () => api.get('/users').then(r => r.data),
  })

  const saveMut = useMutation({
    mutationFn: (form) => form.id
      ? api.put(`/notification-groups/${form.id}`, form)
      : api.post('/notification-groups', form),
    onSuccess: () => {
      setEditing(null)
      qc.invalidateQueries({ queryKey: ['notif-groups'] })
      toast({ kind: 'success', text: 'Grup kaydedildi' })
    },
    onError: (e) => toast({ kind: 'error', text: e.response?.data?.error || 'Hata' }),
  })

  const delMut = useMutation({
    mutationFn: (id) => api.delete(`/notification-groups/${id}`),
    onSuccess: () => {
      setSelectedId(null)
      qc.invalidateQueries({ queryKey: ['notif-groups'] })
      toast({ kind: 'success', text: 'Silindi' })
    },
  })

  const addMemberMut = useMutation({
    mutationFn: (userId) => api.post(`/notification-groups/${selectedId}/members`, { user_id: userId }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['notif-group', selectedId] }),
  })

  const removeMemberMut = useMutation({
    mutationFn: (userId) => api.delete(`/notification-groups/${selectedId}/members/${userId}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['notif-group', selectedId] }),
  })

  async function handleDelete(g) {
    const ok = await confirmDialog({ title: 'Grubu sil', body: `"${g.name}" grubu silinsin mi?`, danger: true })
    if (ok) delMut.mutate(g.id)
  }

  const availableUsers = users.filter(u => !detail?.members?.some(m => m.id === u.id))

  return (
    <div style={{ padding: 16 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 16 }}>
        <div>
          <h2 style={{ fontSize: 22, letterSpacing: 4 }}>BİLDİRİM GRUPLARI<HelpHint topic="notification-groups" title="BİLDİRİM GRUPLARI" /></h2>
          <p style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--text3)', letterSpacing: 2 }}>
            ROL/KONU BAZLI BILDIRIM ALICI KUMELERI
          </p>
        </div>
        <button className="btn btn-primary" onClick={() => setEditing({ channels: ['app'] })}>+ YENİ GRUP</button>
      </div>

      {editing && (
        <GroupForm
          initial={editing}
          saving={saveMut.isPending}
          onSave={(form) => saveMut.mutate(form)}
          onCancel={() => setEditing(null)}
        />
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(300px, 1fr) 2fr', gap: 16 }}>
        <div className="panel">
          <div style={{ height: 2, background: 'var(--accent)' }} />
          <div className="panel-header"><div className="panel-title">GRUPLAR ({groups.length})</div></div>
          <div className="panel-body" style={{ padding: 0 }}>
            {groups.length === 0 ? (
              <EmptyState icon="👥" title="Henüz grup yok" hint="İlk grubunuzu oluşturmak için 'Yeni Grup'" />
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column' }}>
                {groups.map(g => (
                  <div
                    key={g.id}
                    onClick={() => setSelectedId(g.id)}
                    style={{
                      padding: 12, borderBottom: '1px solid var(--border)',
                      cursor: 'pointer',
                      background: selectedId === g.id ? 'rgba(240,165,0,.08)' : 'transparent',
                      borderLeft: selectedId === g.id ? '3px solid var(--accent)' : '3px solid transparent',
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <strong>{g.name}</strong>
                      <span style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--text3)' }}>{g.member_count} üye</span>
                    </div>
                    {g.description && <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 4 }}>{g.description}</div>}
                    <div style={{ display: 'flex', gap: 4, marginTop: 6 }}>
                      {g.channels.map(c => (
                        <span key={c} style={{ padding: '1px 6px', borderRadius: 3, fontSize: 9, background: 'var(--surface2)', color: 'var(--text2)', fontFamily: 'var(--mono)' }}>
                          {CHANNELS.find(ch => ch.value === c)?.label || c}
                        </span>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="panel">
          <div style={{ height: 2, background: 'var(--accent)' }} />
          <div className="panel-header" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div className="panel-title">{detail ? detail.name.toUpperCase() : 'GRUP SEÇ'}</div>
            {detail && (
              <>
                <div style={{ flex: 1 }} />
                <button className="btn btn-ghost btn-sm" onClick={() => setEditing(detail)}>Düzenle</button>
                <button className="btn btn-ghost btn-sm" onClick={() => handleDelete(detail)} style={{ color: 'var(--red, #ef4444)' }}>Sil</button>
              </>
            )}
          </div>
          <div className="panel-body">
            {!detail ? (
              <div style={{ color: 'var(--text3)', textAlign: 'center', padding: 32 }}>Sol taraftan bir grup seçin</div>
            ) : (
              <>
                <div style={{ marginBottom: 16, fontSize: 12, color: 'var(--text2)' }}>
                  {detail.description || <em style={{ color: 'var(--text3)' }}>Açıklama yok</em>}
                </div>
                <div style={{ marginBottom: 12 }}>
                  <strong style={{ fontFamily: 'var(--mono)', fontSize: 11, letterSpacing: 2, color: 'var(--text3)' }}>
                    ÜYELER ({detail.members.length})
                  </strong>
                </div>
                {detail.members.length === 0 ? (
                  <div style={{ color: 'var(--text3)', fontSize: 12, marginBottom: 12 }}>Henüz üye yok</div>
                ) : (
                  <div style={{ marginBottom: 16 }}>
                    {detail.members.map(m => (
                      <div key={m.id} style={{
                        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                        padding: '6px 10px', borderBottom: '1px solid var(--border)',
                      }}>
                        <div>
                          <strong>{m.full_name}</strong>
                          <span style={{ marginLeft: 8, fontSize: 10, color: 'var(--text3)', fontFamily: 'var(--mono)' }}>
                            {m.role} · {m.username}
                          </span>
                          {m.email && <div style={{ fontSize: 10, color: 'var(--text3)' }}>{m.email}</div>}
                        </div>
                        <button className="btn btn-ghost btn-sm" onClick={() => removeMemberMut.mutate(m.id)} style={{ color: 'var(--red, #ef4444)' }}>×</button>
                      </div>
                    ))}
                  </div>
                )}
                {availableUsers.length > 0 && (
                  <div>
                    <label className="form-label">ÜYE EKLE</label>
                    <select
                      className="form-select"
                      onChange={e => { if (e.target.value) addMemberMut.mutate(+e.target.value); e.target.value = '' }}
                      defaultValue=""
                    >
                      <option value="">— kullanıcı seç —</option>
                      {availableUsers.map(u => (
                        <option key={u.id} value={u.id}>{u.full_name} ({u.role})</option>
                      ))}
                    </select>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

function GroupForm({ initial, onSave, onCancel, saving }) {
  const [form, setForm] = useState({
    name: '', description: '', channels: ['app'],
    ...initial,
  })
  const toggleChannel = (c) => {
    setForm(f => ({
      ...f,
      channels: f.channels.includes(c) ? f.channels.filter(x => x !== c) : [...f.channels, c],
    }))
  }
  return (
    <div className="panel" style={{ marginBottom: 16 }}>
      <div style={{ height: 2, background: 'var(--accent)' }} />
      <div className="panel-header"><div className="panel-title">{initial?.id ? 'GRUP DÜZENLE' : 'YENİ GRUP'}</div></div>
      <div className="panel-body">
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 12 }}>
          <div>
            <label className="form-label">GRUP ADI *</label>
            <input className="form-input" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="Acil Bakim, Yonetim, vb." />
          </div>
          <div>
            <label className="form-label">AÇIKLAMA</label>
            <input className="form-input" value={form.description || ''} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} />
          </div>
        </div>
        <div style={{ marginTop: 12 }}>
          <label className="form-label">KANALLAR</label>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {CHANNELS.map(c => (
              <label key={c.value} style={{
                display: 'inline-flex', alignItems: 'center', gap: 6,
                padding: '6px 12px', borderRadius: 4,
                background: form.channels.includes(c.value) ? 'rgba(240,165,0,.15)' : 'var(--surface2)',
                border: `1px solid ${form.channels.includes(c.value) ? 'var(--accent)' : 'var(--border)'}`,
                cursor: 'pointer', fontFamily: 'var(--mono)', fontSize: 11,
              }}>
                <input type="checkbox" checked={form.channels.includes(c.value)} onChange={() => toggleChannel(c.value)} />
                {c.label}
              </label>
            ))}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
          <button className="btn btn-primary" disabled={!form.name || saving} onClick={() => onSave(form)}>
            {saving ? 'KAYDEDİLİYOR...' : 'KAYDET'}
          </button>
          <button className="btn btn-ghost" onClick={onCancel}>İPTAL</button>
        </div>
      </div>
    </div>
  )
}
