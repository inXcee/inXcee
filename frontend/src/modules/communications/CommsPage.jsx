import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import api from '../../shared/api/client.js'
import { useToastStore } from '../../shared/store/toastStore.js'

const toast = (m, t = 'success') => useToastStore.getState().addToast(m, t)
const toastErr = (e) => toast(e?.response?.data?.error || 'Hata', 'error')

const TABS = [
  { key: 'broadcast', label: '📢 TOPLU GÖNDERİM' },
  { key: 'log',       label: '📜 GEÇMİŞ' },
]

const CHANNELS = { sms: '📱 SMS', push: '🔔 Push', toast: '💬 Toast', email: '📧 E-posta', whatsapp: '🟢 WhatsApp' }

export default function CommsPage() {
  const [tab, setTab] = useState('broadcast')

  return (
    <div style={{ maxWidth: 1100 }} className="fade-up">
      <div style={{ marginBottom: 16 }}>
        <h1 style={{ fontSize: 28, letterSpacing: 4, color: 'var(--text)', margin: 0 }}>İLETİŞİM</h1>
        <p style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--text3)', marginTop: 4, letterSpacing: 1.5 }}>
          TOPLU SMS / PUSH GÖNDERİM · İLETİŞİM LOGU
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

      {tab === 'broadcast' && <BroadcastTab />}
      {tab === 'log' && <LogTab />}
    </div>
  )
}

function BroadcastTab() {
  const qc = useQueryClient()
  const [form, setForm] = useState({ channel: 'sms', target_type: 'dept', target_id: '', body: '', subject: '' })
  const [result, setResult] = useState(null)

  const { data: departments = [] } = useQuery({
    queryKey: ['departments'],
    queryFn: () => api.get('/shifts/departments').then(r => r.data),
  })
  const { data: groups = [] } = useQuery({
    queryKey: ['notification-groups'],
    queryFn: () => api.get('/notification-groups').then(r => r.data).catch(() => []),
    enabled: form.target_type === 'group',
  })

  const sendMut = useMutation({
    mutationFn: () => api.post('/comms/broadcast', form),
    onSuccess: (r) => {
      setResult(r.data.stats)
      toast(`📨 ${r.data.stats.sent} gönderildi · ${r.data.stats.queued} kuyrukta · ${r.data.stats.failed} başarısız`)
      qc.invalidateQueries({ queryKey: ['comm-log'] })
    },
    onError: toastErr,
  })

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 320px', gap: 16 }}>
      <div style={{ padding: 18, background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 14 }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 10 }}>
          <div>
            <Label>Kanal</Label>
            <select className="form-select" value={form.channel} onChange={e => setForm({ ...form, channel: e.target.value })}>
              <option value="sms">📱 SMS</option>
              <option value="push">🔔 Push Notification</option>
              <option value="toast">💬 Toast (in-app)</option>
            </select>
          </div>
          <div>
            <Label>Hedef Tipi</Label>
            <select className="form-select" value={form.target_type} onChange={e => setForm({ ...form, target_type: e.target.value, target_id: '' })}>
              <option value="dept">Departman</option>
              <option value="role">Rol</option>
              <option value="group">Bildirim Grubu</option>
              <option value="all">Tüm Aktif Personel</option>
            </select>
          </div>
        </div>

        {form.target_type === 'dept' && (
          <div style={{ marginBottom: 10 }}>
            <Label>Departman</Label>
            <select className="form-select" value={form.target_id} onChange={e => setForm({ ...form, target_id: e.target.value })}>
              <option value="">Seç…</option>
              {departments.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
            </select>
          </div>
        )}
        {form.target_type === 'role' && (
          <div style={{ marginBottom: 10 }}>
            <Label>Rol (role_label)</Label>
            <input className="form-input" value={form.target_id} onChange={e => setForm({ ...form, target_id: e.target.value })}
              placeholder="örn: Şef, Operatör" />
          </div>
        )}
        {form.target_type === 'group' && (
          <div style={{ marginBottom: 10 }}>
            <Label>Grup</Label>
            <select className="form-select" value={form.target_id} onChange={e => setForm({ ...form, target_id: e.target.value })}>
              <option value="">Seç…</option>
              {groups.map(g => <option key={g.id} value={g.id}>{g.name}</option>)}
            </select>
          </div>
        )}

        <div style={{ marginBottom: 10 }}>
          <Label>Konu (opsiyonel)</Label>
          <input className="form-input" value={form.subject} onChange={e => setForm({ ...form, subject: e.target.value })} />
        </div>
        <div style={{ marginBottom: 14 }}>
          <Label>Mesaj * ({form.body.length}/160 SMS)</Label>
          <textarea className="form-input" rows={4} value={form.body} onChange={e => setForm({ ...form, body: e.target.value })}
            placeholder="Mesajınız…" style={{ fontSize: 13 }} />
        </div>

        <button onClick={() => sendMut.mutate()} disabled={!form.body || sendMut.isPending || (form.target_type !== 'all' && !form.target_id)}
          className="btn btn-primary" style={{ width: '100%', borderRadius: 10 }}>
          📨 GÖNDER
        </button>

        {result && (
          <div style={{ marginTop: 14, padding: 12, background: 'var(--surface2)', borderRadius: 10 }}>
            <div style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--text3)', letterSpacing: 1.5, marginBottom: 6 }}>SONUÇ</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8, fontSize: 12, textAlign: 'center' }}>
              <div><div style={{ fontFamily: 'var(--display)', fontSize: 18 }}>{result.total}</div><div style={{ fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--text3)' }}>TOPLAM</div></div>
              <div><div style={{ fontFamily: 'var(--display)', fontSize: 18, color: 'var(--green)' }}>{result.sent}</div><div style={{ fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--green)' }}>GÖNDERİLDİ</div></div>
              <div><div style={{ fontFamily: 'var(--display)', fontSize: 18, color: 'var(--amber)' }}>{result.queued}</div><div style={{ fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--amber)' }}>KUYRUK</div></div>
              <div><div style={{ fontFamily: 'var(--display)', fontSize: 18, color: 'var(--red)' }}>{result.failed}</div><div style={{ fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--red)' }}>HATA</div></div>
            </div>
          </div>
        )}
      </div>

      <div style={{ padding: 14, background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 14, fontFamily: 'var(--mono)', fontSize: 11 }}>
        <div style={{ fontWeight: 700, color: 'var(--accent)', letterSpacing: 1.5, marginBottom: 8 }}>📌 NOTLAR</div>
        <div style={{ color: 'var(--text3)', lineHeight: 1.6 }}>
          <p><strong>SMS:</strong> env'de <code>SMS_PROVIDER=netgsm</code> + <code>SMS_USER/PASS/HEADER</code> tanımlı olmalı. Yoksa "kuyrukta" loglanır.</p>
          <p style={{ marginTop: 6 }}><strong>Push:</strong> Tarayıcı bildirim izni gerekir; service worker üzerinden teslim edilir.</p>
          <p style={{ marginTop: 6 }}><strong>Toast:</strong> Sadece app içinde aktif kullanıcılara gösterilir.</p>
          <p style={{ marginTop: 6 }}><strong>SMS limit:</strong> 160 karakter üstü çoklu mesaj sayılır.</p>
        </div>
      </div>
    </div>
  )
}

function Label({ children }) {
  return <div style={{ fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--text3)', letterSpacing: 1, marginBottom: 4 }}>{children}</div>
}

function LogTab() {
  const [channel, setChannel] = useState('')
  const [status, setStatus] = useState('')
  const { data = [], isLoading } = useQuery({
    queryKey: ['comm-log', channel, status],
    queryFn: () => api.get(`/comms/log?${channel ? `channel=${channel}&` : ''}${status ? `status=${status}` : ''}`).then(r => r.data),
  })

  return (
    <div>
      <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
        <select className="form-select" value={channel} onChange={e => setChannel(e.target.value)} style={{ width: 'auto', fontSize: 12 }}>
          <option value="">Tüm kanallar</option>
          {Object.entries(CHANNELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
        <select className="form-select" value={status} onChange={e => setStatus(e.target.value)} style={{ width: 'auto', fontSize: 12 }}>
          <option value="">Tüm durumlar</option>
          <option value="sent">Gönderildi</option>
          <option value="queued">Kuyrukta</option>
          <option value="failed">Başarısız</option>
        </select>
      </div>

      {isLoading ? <div style={{ padding: 30, color: 'var(--text3)' }}>Yükleniyor…</div> : !data.length ? (
        <div style={{ padding: 50, textAlign: 'center', background: 'var(--surface)', borderRadius: 14 }}>
          <div style={{ fontSize: 36, opacity: 0.3 }}>📜</div>
          <div style={{ fontFamily: 'var(--display)', fontSize: 14, marginTop: 8 }}>HENÜZ İLETİŞİM YOK</div>
        </div>
      ) : (
        <div style={{ background: 'var(--surface)', borderRadius: 14, border: '1px solid var(--border)', overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
            <thead>
              <tr style={{ background: 'var(--surface2)' }}>
                <th style={{ padding: 10, textAlign: 'left', fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--text3)' }}>KANAL</th>
                <th style={{ padding: 10, textAlign: 'left', fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--text3)' }}>ALICI</th>
                <th style={{ padding: 10, textAlign: 'left', fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--text3)' }}>MESAJ</th>
                <th style={{ padding: 10, textAlign: 'center', fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--text3)' }}>DURUM</th>
                <th style={{ padding: 10, textAlign: 'right', fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--text3)' }}>TARİH</th>
              </tr>
            </thead>
            <tbody>
              {data.map(l => (
                <tr key={l.id} style={{ borderTop: '1px solid var(--border)' }}>
                  <td style={{ padding: 10, fontFamily: 'var(--mono)', fontSize: 11 }}>{CHANNELS[l.channel] || l.channel}</td>
                  <td style={{ padding: 10, fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--text3)' }}>{l.recipient_value || `#${l.recipient_id}`}</td>
                  <td style={{ padding: 10, fontSize: 11, maxWidth: 360, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{l.body}</td>
                  <td style={{ padding: 10, textAlign: 'center', fontFamily: 'var(--mono)', fontSize: 10, color: l.status === 'sent' ? 'var(--green)' : l.status === 'failed' ? 'var(--red)' : 'var(--amber)' }}>
                    {l.status}{l.error && <div style={{ fontSize: 8, color: 'var(--red)' }}>{l.error.slice(0, 40)}</div>}
                  </td>
                  <td style={{ padding: 10, textAlign: 'right', fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--text3)' }}>
                    {new Date(l.created_at).toLocaleString('tr-TR')}
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
