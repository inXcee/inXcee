import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import api from '../../shared/api/client.js'
import { useToastStore } from '../../shared/store/toastStore.js'
import { confirmDialog } from '../../shared/components/ConfirmDialog.jsx'
import { inputDialog } from '../../shared/components/InputDialog.jsx'
import AccidentsTab from './AccidentsTab.jsx'

const toast = (m, t = 'success') => useToastStore.getState().addToast(m, t)
const toastErr = (e) => toast(e?.response?.data?.error || 'Hata', 'error')

const TABS = [
  { key: 'sessions', label: '📚 EĞİTİMLER' },
  { key: 'expiring', label: '⏰ SERTİFİKA UYARI' },
  { key: 'kkd', label: '🦺 KKD ZİMMET' },
  { key: 'accidents', label: '🚨 İŞ KAZALARI' },
]

const CATEGORIES = {
  safety: '🛡 İş Güvenliği',
  fire: '🔥 Yangın',
  first_aid: '🚑 İlk Yardım',
  environment: '🌍 Çevre',
  quality: '⭐ Kalite',
  other: '📋 Diğer',
}

export default function SafetyPage() {
  const [tab, setTab] = useState('sessions')

  return (
    <div style={{ maxWidth: 1200 }} className="fade-up">
      <div style={{ marginBottom: 16 }}>
        <h1 style={{ fontSize: 28, letterSpacing: 4, color: 'var(--text)', margin: 0 }}>İŞ GÜVENLİĞİ & EĞİTİM</h1>
        <p style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--text3)', marginTop: 4, letterSpacing: 1.5 }}>
          EĞİTİM TAKVİMİ · SERTİFİKA TAKİBİ · KKD ZİMMET
        </p>
      </div>

      <div style={{ display: 'flex', gap: 2, marginBottom: 14, background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: 3 }}>
        {TABS.map(t => (
          <button key={t.key} onClick={() => setTab(t.key)} style={{
            flex: 1, padding: '10px 14px', border: 'none', borderRadius: 9,
            background: tab === t.key ? 'var(--accent)' : 'transparent',
            color: tab === t.key ? '#000' : 'var(--text3)',
            fontSize: 11, fontWeight: 700, fontFamily: 'var(--mono)', letterSpacing: 1.5, cursor: 'pointer',
          }}>{t.label}</button>
        ))}
      </div>

      {tab === 'sessions' && <SessionsTab />}
      {tab === 'expiring' && <ExpiringCertsTab />}
      {tab === 'kkd' && <KkdTab />}
      {tab === 'accidents' && <AccidentsTab />}
    </div>
  )
}

function SessionsTab() {
  const qc = useQueryClient()
  const [editing, setEditing] = useState(null)
  const [creating, setCreating] = useState(false)
  const [openId, setOpenId] = useState(null)

  const { data: sessions = [], isLoading } = useQuery({
    queryKey: ['safety-sessions'],
    queryFn: () => api.get('/safety/sessions').then(r => r.data),
  })

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 12, alignItems: 'center' }}>
        <div style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--text3)', letterSpacing: 1.5 }}>{sessions.length} EĞİTİM</div>
        <button onClick={() => setCreating(true)} className="btn btn-primary btn-sm" style={{ borderRadius: 10 }}>+ EĞİTİM</button>
      </div>

      {isLoading ? <div style={{ padding: 30, color: 'var(--text3)' }}>Yükleniyor…</div> : !sessions.length ? (
        <div style={{ padding: 60, textAlign: 'center', background: 'var(--surface)', borderRadius: 14, border: '1px solid var(--border)' }}>
          <div style={{ fontSize: 36, opacity: 0.3, marginBottom: 8 }}>📚</div>
          <div style={{ fontFamily: 'var(--display)', fontSize: 14, letterSpacing: 2 }}>HENÜZ EĞİTİM YOK</div>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 10 }}>
          {sessions.map(s => {
            const isPast = new Date(s.session_date) < new Date()
            return (
              <div key={s.id} onClick={() => setOpenId(s.id)} style={{
                padding: 14, borderRadius: 12, cursor: 'pointer',
                background: 'var(--surface)', border: '1px solid var(--border)',
                borderLeft: `4px solid ${s.status === 'completed' ? 'var(--green)' : s.status === 'cancelled' ? 'var(--text4)' : 'var(--accent)'}`,
                opacity: s.status === 'cancelled' ? 0.5 : 1,
                transition: 'transform .15s',
              }}
                onMouseEnter={e => e.currentTarget.style.transform = 'translateY(-1px)'}
                onMouseLeave={e => e.currentTarget.style.transform = 'none'}>
                <div style={{ fontSize: 11, color: 'var(--accent)', fontFamily: 'var(--mono)' }}>{CATEGORIES[s.category] || s.category}</div>
                <div style={{ fontSize: 14, fontWeight: 600, marginTop: 4 }}>{s.title}</div>
                <div style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--text3)', marginTop: 6 }}>
                  📅 {s.session_date} {isPast ? '· geçmiş' : ''}
                </div>
                {s.location && <div style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--text3)' }}>📍 {s.location}</div>}
                {s.instructor && <div style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--text3)' }}>🎓 {s.instructor}</div>}
                <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 8, fontFamily: 'var(--mono)', fontSize: 10 }}>
                  <span style={{ color: 'var(--text3)' }}>{s.attended_count}/{s.registered_count} katıldı</span>
                  <span style={{ color: s.status === 'completed' ? 'var(--green)' : 'var(--accent)' }}>{s.status}</span>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {(creating || editing) && <SessionForm initial={editing} onClose={() => { setCreating(false); setEditing(null) }}
        onSaved={() => qc.invalidateQueries({ queryKey: ['safety-sessions'] })} />}
      {openId && <SessionDrawer id={openId} onClose={() => setOpenId(null)} onEdit={(s) => { setOpenId(null); setEditing(s) }} />}
    </div>
  )
}

function SessionForm({ initial, onClose, onSaved }) {
  const [form, setForm] = useState({
    title: initial?.title || '',
    category: initial?.category || 'safety',
    session_date: initial?.session_date || new Date().toISOString().slice(0, 10),
    duration_min: initial?.duration_min || 60,
    location: initial?.location || '',
    instructor: initial?.instructor || '',
    notes: initial?.notes || '',
    status: initial?.status || 'scheduled',
  })
  const mut = useMutation({
    mutationFn: () => initial?.id
      ? api.put(`/safety/sessions/${initial.id}`, form)
      : api.post('/safety/sessions', form),
    onSuccess: () => { toast('Kaydedildi'); onSaved(); onClose() },
    onError: toastErr,
  })

  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.5)', zIndex: 9000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
      <div onClick={e => e.stopPropagation()} style={{ width: 520, maxWidth: '100%', background: 'var(--surface)', borderRadius: 14, padding: 20 }}>
        <h2 style={{ fontSize: 16, marginBottom: 14 }}>{initial?.id ? '✎ EĞİTİM DÜZENLE' : '+ YENİ EĞİTİM'}</h2>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          <div style={{ gridColumn: '1/-1' }}>
            <Label>Başlık *</Label>
            <input className="form-input" value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} autoFocus />
          </div>
          <div>
            <Label>Kategori</Label>
            <select className="form-select" value={form.category} onChange={e => setForm({ ...form, category: e.target.value })}>
              {Object.entries(CATEGORIES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </div>
          <div>
            <Label>Tarih *</Label>
            <input type="date" className="form-input" value={form.session_date} onChange={e => setForm({ ...form, session_date: e.target.value })} />
          </div>
          <div>
            <Label>Süre (dk)</Label>
            <input type="number" className="form-input" value={form.duration_min} onChange={e => setForm({ ...form, duration_min: +e.target.value })} />
          </div>
          <div>
            <Label>Eğitmen</Label>
            <input className="form-input" value={form.instructor} onChange={e => setForm({ ...form, instructor: e.target.value })} />
          </div>
          <div style={{ gridColumn: '1/-1' }}>
            <Label>Lokasyon</Label>
            <input className="form-input" value={form.location} onChange={e => setForm({ ...form, location: e.target.value })} />
          </div>
          <div style={{ gridColumn: '1/-1' }}>
            <Label>Notlar</Label>
            <textarea className="form-input" rows={2} value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} />
          </div>
          {initial?.id && (
            <div>
              <Label>Durum</Label>
              <select className="form-select" value={form.status} onChange={e => setForm({ ...form, status: e.target.value })}>
                <option value="scheduled">Planlandı</option>
                <option value="completed">Tamamlandı</option>
                <option value="cancelled">İptal</option>
              </select>
            </div>
          )}
        </div>
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 6, marginTop: 14 }}>
          <button onClick={onClose} className="btn btn-ghost">İPTAL</button>
          <button onClick={() => mut.mutate()} disabled={!form.title || !form.session_date || mut.isPending} className="btn btn-primary">KAYDET</button>
        </div>
      </div>
    </div>
  )
}

function Label({ children }) {
  return <div style={{ fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--text3)', letterSpacing: 1, marginBottom: 4 }}>{children}</div>
}

function SessionDrawer({ id, onClose, onEdit }) {
  const qc = useQueryClient()
  const [staffSearch, setStaffSearch] = useState('')
  const [certExpires, setCertExpires] = useState('')

  const { data, isLoading } = useQuery({
    queryKey: ['safety-session', id],
    queryFn: () => api.get(`/safety/sessions/${id}`).then(r => r.data),
  })
  const { data: staffSearchResults = [] } = useQuery({
    queryKey: ['staff-search', staffSearch],
    queryFn: () => api.get(`/shifts/staff/search?q=${encodeURIComponent(staffSearch)}`).then(r => r.data),
    enabled: staffSearch.length >= 2,
  })

  const inv = () => qc.invalidateQueries({ queryKey: ['safety-session', id] })
  const addMut = useMutation({
    mutationFn: (sid) => api.post(`/safety/sessions/${id}/attendances`, { staff_id: sid, attended: true, cert_expires_at: certExpires || null }),
    onSuccess: () => { toast('Eklendi'); inv(); setStaffSearch('') }, onError: toastErr,
  })
  const toggleMut = useMutation({
    mutationFn: ({ staff_id, attended }) => api.post(`/safety/sessions/${id}/attendances`, { staff_id, attended }),
    onSuccess: inv, onError: toastErr,
  })
  const delMut = useMutation({
    mutationFn: (aid) => api.delete(`/safety/attendances/${aid}`),
    onSuccess: inv, onError: toastErr,
  })
  const sessionDelMut = useMutation({
    mutationFn: () => api.delete(`/safety/sessions/${id}`),
    onSuccess: () => { onClose(); qc.invalidateQueries({ queryKey: ['safety-sessions'] }) }, onError: toastErr,
  })

  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.5)', zIndex: 9000, display: 'flex', justifyContent: 'flex-end' }}>
      <div onClick={e => e.stopPropagation()} style={{ width: '100%', maxWidth: 580, height: '100%', overflowY: 'auto', background: 'var(--surface)', borderLeft: '1px solid var(--border)', padding: 20 }}>
        {isLoading || !data ? <div style={{ padding: 40, color: 'var(--text3)' }}>Yükleniyor…</div> : (
          <>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 14 }}>
              <div>
                <div style={{ fontSize: 11, color: 'var(--accent)', fontFamily: 'var(--mono)' }}>{CATEGORIES[data.category] || data.category}</div>
                <div style={{ fontSize: 18, fontWeight: 700, marginTop: 4 }}>{data.title}</div>
                <div style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--text3)', marginTop: 4 }}>
                  📅 {data.session_date} · ⏱ {data.duration_min}dk {data.location && `· 📍 ${data.location}`}
                </div>
              </div>
              <div style={{ display: 'flex', gap: 4 }}>
                <button onClick={() => onEdit(data)} className="btn btn-ghost btn-xs">✎</button>
                <button onClick={async () => { if (await confirmDialog({ title: 'Sil', body: 'Eğitim ve katılımcılar silinecek', confirmLabel: 'Sil' })) sessionDelMut.mutate() }} className="btn btn-ghost btn-xs" style={{ color: 'var(--red)' }}>🗑</button>
                <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: 22, color: 'var(--text3)', cursor: 'pointer' }}>×</button>
              </div>
            </div>

            <div style={{ marginBottom: 14, padding: 10, background: 'var(--surface2)', borderRadius: 8 }}>
              <div style={{ fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--text3)', letterSpacing: 1, marginBottom: 6 }}>+ KATILIMCI EKLE</div>
              <input className="form-input" placeholder="Personel ara (en az 2 karakter)" value={staffSearch}
                onChange={e => setStaffSearch(e.target.value)} style={{ fontSize: 12, marginBottom: 6 }} />
              <input type="date" className="form-input" placeholder="Sertifika geçerlilik" value={certExpires}
                onChange={e => setCertExpires(e.target.value)} style={{ fontSize: 12, marginBottom: 6 }} />
              {staffSearch.length >= 2 && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4, maxHeight: 200, overflowY: 'auto' }}>
                  {staffSearchResults.map(s => (
                    <button key={s.id} onClick={() => addMut.mutate(s.id)} disabled={addMut.isPending}
                      style={{ padding: '6px 10px', textAlign: 'left', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 6, cursor: 'pointer', fontSize: 12 }}>
                      <strong>{s.full_name}</strong> <span style={{ color: 'var(--text3)', fontFamily: 'var(--mono)', fontSize: 9 }}>· {s.dept_name || '—'}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>

            <div style={{ fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--text3)', letterSpacing: 1, marginBottom: 6 }}>
              KATILIMCILAR ({data.attendances?.length || 0})
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              {(data.attendances || []).map(a => (
                <div key={a.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 10px', background: 'var(--surface2)', borderRadius: 8 }}>
                  <input type="checkbox" checked={a.attended === 1} onChange={e => toggleMut.mutate({ staff_id: a.staff_id, attended: e.target.checked })}
                    style={{ width: 16, height: 16, cursor: 'pointer' }} />
                  <div style={{ flex: 1, fontSize: 12 }}>
                    <strong>{a.full_name}</strong>
                    {a.dept_name && <div style={{ fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--text3)' }}>{a.dept_name}</div>}
                  </div>
                  {a.cert_expires_at && (
                    <span style={{ fontFamily: 'var(--mono)', fontSize: 9, color: new Date(a.cert_expires_at) < new Date(Date.now() + 30 * 86400000) ? 'var(--amber)' : 'var(--text3)' }}>
                      Bitiş: {a.cert_expires_at}
                    </span>
                  )}
                  <button onClick={() => delMut.mutate(a.id)} style={{ background: 'none', border: 'none', color: 'var(--red)', cursor: 'pointer' }}>✕</button>
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  )
}

function ExpiringCertsTab() {
  const nav = useNavigate()
  const [days, setDays] = useState(30)
  const { data = [], isLoading } = useQuery({
    queryKey: ['safety-expiring', days],
    queryFn: () => api.get(`/safety/expiring-certs?days=${days}`).then(r => r.data),
  })

  return (
    <div>
      <div style={{ marginBottom: 12, display: 'flex', gap: 8, alignItems: 'center' }}>
        <span style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--text3)', letterSpacing: 1.5 }}>SONRAKİ</span>
        {[15, 30, 60, 90].map(d => (
          <button key={d} onClick={() => setDays(d)} className="btn btn-ghost btn-xs"
            style={{ borderRadius: 8, ...(days === d ? { background: 'var(--accent)', color: '#000' } : {}) }}>{d} GÜN</button>
        ))}
      </div>
      {isLoading ? <div style={{ padding: 30, color: 'var(--text3)' }}>Yükleniyor…</div> : !data.length ? (
        <div style={{ padding: 50, textAlign: 'center', background: 'var(--surface)', borderRadius: 14 }}>
          <div style={{ fontSize: 36, opacity: 0.3, marginBottom: 8 }}>✓</div>
          <div style={{ fontFamily: 'var(--display)', fontSize: 14 }}>SERTİFİKA BİTECEK PERSONEL YOK</div>
        </div>
      ) : (
        <div style={{ background: 'var(--surface)', borderRadius: 14, border: '1px solid var(--border)', overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
            <thead>
              <tr style={{ background: 'var(--surface2)' }}>
                <th style={{ padding: 10, textAlign: 'left', fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--text3)' }}>PERSONEL</th>
                <th style={{ padding: 10, textAlign: 'left', fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--text3)' }}>EĞİTİM</th>
                <th style={{ padding: 10, textAlign: 'left', fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--amber)' }}>BİTİŞ</th>
              </tr>
            </thead>
            <tbody>
              {data.map(r => {
                const dLeft = Math.ceil((new Date(r.cert_expires_at) - new Date()) / 86400000)
                return (
                  <tr key={r.attendance_id} onClick={() => nav(`/personnel/${r.staff_id}`)} style={{ borderTop: '1px solid var(--border)', cursor: 'pointer' }}>
                    <td style={{ padding: 10 }}>
                      <strong>{r.full_name}</strong>
                      <div style={{ fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--text3)' }}>{r.dept_name || '—'}</div>
                    </td>
                    <td style={{ padding: 10 }}>
                      <div style={{ fontSize: 11 }}>{r.title}</div>
                      <div style={{ fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--text3)' }}>{CATEGORIES[r.category] || r.category}</div>
                    </td>
                    <td style={{ padding: 10, fontFamily: 'var(--mono)', fontWeight: 700, color: dLeft <= 7 ? 'var(--red)' : 'var(--amber)' }}>
                      {r.cert_expires_at} <span style={{ color: 'var(--text3)', fontWeight: 400 }}>({dLeft}g)</span>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

const KKD_ITEMS = ['Baret', 'Koruyucu Gözlük', 'İş Eldiveni', 'İş Ayakkabısı', 'Kulaklık (gürültü)', 'Toz Maskesi', 'Reflektörlü Yelek', 'Kemer/Emniyet Kemeri', 'İş Tulumu', 'Diğer']

function KkdTab() {
  const qc = useQueryClient()
  const [creating, setCreating] = useState(false)
  const [activeFilter, setActiveFilter] = useState('1')
  const [form, setForm] = useState({ staff_id: null, staff_name: '', item_type: 'Baret', size: '', serial_no: '', notes: '' })
  const [staffSearch, setStaffSearch] = useState('')

  const { data = [], isLoading } = useQuery({
    queryKey: ['kkd', activeFilter],
    queryFn: () => api.get(`/safety/kkd?active=${activeFilter}`).then(r => r.data),
  })
  const { data: staffResults = [] } = useQuery({
    queryKey: ['staff-search', staffSearch],
    queryFn: () => api.get(`/shifts/staff/search?q=${encodeURIComponent(staffSearch)}`).then(r => r.data),
    enabled: staffSearch.length >= 2,
  })

  const inv = () => qc.invalidateQueries({ queryKey: ['kkd'] })
  const addMut = useMutation({
    mutationFn: () => api.post('/safety/kkd', form),
    onSuccess: () => { toast('Zimmet eklendi'); setCreating(false); setForm({ staff_id: null, staff_name: '', item_type: 'Baret', size: '', serial_no: '', notes: '' }); setStaffSearch(''); inv() },
    onError: toastErr,
  })
  const returnMut = useMutation({
    mutationFn: ({ id, condition }) => api.post(`/safety/kkd/${id}/return`, { condition }),
    onSuccess: () => { toast('İade alındı'); inv() }, onError: toastErr,
  })

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 12, alignItems: 'center' }}>
        <div style={{ display: 'flex', gap: 4 }}>
          {[['1', 'AKTİF'], ['0', 'İADE'], ['', 'TÜMÜ']].map(([v, l]) => (
            <button key={v} onClick={() => setActiveFilter(v)} className="btn btn-ghost btn-xs"
              style={{ borderRadius: 8, ...(activeFilter === v ? { background: 'var(--accent)', color: '#000' } : {}) }}>{l}</button>
          ))}
        </div>
        <button onClick={() => setCreating(true)} className="btn btn-primary btn-sm" style={{ borderRadius: 10 }}>+ ZİMMET</button>
      </div>

      {creating && (
        <div style={{ marginBottom: 14, padding: 14, background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12 }}>
          <div style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--text3)', letterSpacing: 1.5, marginBottom: 10 }}>+ YENİ KKD ZİMMET</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 8 }}>
            <div style={{ gridColumn: '1/-1' }}>
              <Label>Personel *</Label>
              <input className="form-input" placeholder="Ara (en az 2 char)" value={staffSearch}
                onChange={e => setStaffSearch(e.target.value)} style={{ fontSize: 12 }} />
              {form.staff_id && <div style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--green)', marginTop: 4 }}>✓ {form.staff_name}</div>}
              {!form.staff_id && staffSearch.length >= 2 && (
                <div style={{ maxHeight: 150, overflowY: 'auto', marginTop: 4, display: 'flex', flexDirection: 'column', gap: 3 }}>
                  {staffResults.map(s => (
                    <button key={s.id} onClick={() => { setForm({ ...form, staff_id: s.id, staff_name: s.full_name }); setStaffSearch('') }}
                      style={{ padding: '5px 8px', textAlign: 'left', background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 6, cursor: 'pointer', fontSize: 11 }}>
                      {s.full_name} <span style={{ fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--text3)' }}>· {s.dept_name || '—'}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
            <div>
              <Label>Ekipman</Label>
              <select className="form-select" value={form.item_type} onChange={e => setForm({ ...form, item_type: e.target.value })}>
                {KKD_ITEMS.map(it => <option key={it}>{it}</option>)}
              </select>
            </div>
            <div>
              <Label>Beden</Label>
              <input className="form-input" placeholder="S/M/L/42 vb" value={form.size} onChange={e => setForm({ ...form, size: e.target.value })} />
            </div>
            <div>
              <Label>Seri No</Label>
              <input className="form-input" value={form.serial_no} onChange={e => setForm({ ...form, serial_no: e.target.value })} />
            </div>
            <div>
              <Label>Notlar</Label>
              <input className="form-input" value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} />
            </div>
          </div>
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 6 }}>
            <button onClick={() => setCreating(false)} className="btn btn-ghost btn-sm">İPTAL</button>
            <button onClick={() => addMut.mutate()} disabled={!form.staff_id || !form.item_type || addMut.isPending} className="btn btn-primary btn-sm">KAYDET</button>
          </div>
        </div>
      )}

      {isLoading ? <div style={{ padding: 30, color: 'var(--text3)' }}>Yükleniyor…</div> : !data.length ? (
        <div style={{ padding: 50, textAlign: 'center', background: 'var(--surface)', borderRadius: 14 }}>
          <div style={{ fontSize: 36, opacity: 0.3, marginBottom: 8 }}>🦺</div>
          <div style={{ fontFamily: 'var(--display)', fontSize: 14 }}>KKD ZİMMET YOK</div>
        </div>
      ) : (
        <div style={{ background: 'var(--surface)', borderRadius: 14, border: '1px solid var(--border)', overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
            <thead>
              <tr style={{ background: 'var(--surface2)' }}>
                <th style={{ padding: 10, textAlign: 'left', fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--text3)' }}>PERSONEL</th>
                <th style={{ padding: 10, textAlign: 'left', fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--text3)' }}>EKİPMAN</th>
                <th style={{ padding: 10, textAlign: 'left', fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--text3)' }}>BEDEN/SERI</th>
                <th style={{ padding: 10, textAlign: 'left', fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--text3)' }}>ZİMMET</th>
                <th style={{ padding: 10, fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--text3)' }}>İADE</th>
                <th style={{ padding: 10 }} />
              </tr>
            </thead>
            <tbody>
              {data.map(k => (
                <tr key={k.id} style={{ borderTop: '1px solid var(--border)' }}>
                  <td style={{ padding: 10 }}>
                    <strong>{k.full_name}</strong>
                    <div style={{ fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--text3)' }}>{k.dept_name || '—'}</div>
                  </td>
                  <td style={{ padding: 10 }}>{k.item_type}</td>
                  <td style={{ padding: 10, fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--text3)' }}>
                    {k.size}{k.serial_no ? ` · #${k.serial_no}` : ''}
                  </td>
                  <td style={{ padding: 10, fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--text3)' }}>{k.assigned_at?.slice(0, 10)}</td>
                  <td style={{ padding: 10, textAlign: 'center', fontFamily: 'var(--mono)', fontSize: 10 }}>
                    {k.returned_at ? <span style={{ color: 'var(--green)' }}>✓ {k.returned_at.slice(0, 10)}</span> : <span style={{ color: 'var(--amber)' }}>aktif</span>}
                  </td>
                  <td style={{ padding: 10 }}>
                    {!k.returned_at && (
                      <button onClick={async () => {
                        const cond = await inputDialog({
                          title: 'KKD İade',
                          body: 'Eşyanın iade edildiği durumu seçin.',
                          options: ['sağlam', 'eskimiş', 'hasarlı', 'kayıp'],
                          defaultValue: 'sağlam',
                        })
                        if (cond) returnMut.mutate({ id: k.id, condition: cond })
                      }} className="btn btn-ghost btn-xs">↩ İADE AL</button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
