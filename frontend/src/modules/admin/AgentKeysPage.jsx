import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import api from '../../shared/api/client.js'
import { confirmDialog } from '../../shared/components/ConfirmDialog.jsx'
import { useToastStore } from '../../shared/store/toastStore.js'
import { SkeletonGrid } from '../../shared/components/Skeleton.jsx'

// Ajan (Hermes) API anahtarları — belge: docs/hermes-entegrasyon.md.
// Anahtar bir kullanıcıya bağlıdır ve onun rolüyle YYS'nin normal uçlarını çağırır.

const ROLE_LABELS = {
  campus_manager: 'Kampüs yöneticisi',
  shift_supervisor: 'Vardiya amiri',
  technical: 'Teknik',
  laundry: 'Çamaşırhane',
  housekeeper: 'Kat görevlisi',
}

function parseStamp(value) {
  if (!value) return null
  const normalized = value.includes('T') ? value : value.replace(' ', 'T')
  const date = new Date(`${normalized}${/[zZ]|[+-]\d\d:\d\d$/.test(normalized) ? '' : 'Z'}`)
  return Number.isNaN(date.getTime()) ? null : date
}

function formatStamp(value) {
  const date = parseStamp(value)
  return date ? date.toLocaleString('tr-TR', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—'
}

// Özel kasa izni yalnız sahibe gösterilir: backend kasa sütununu yalnız sahibin listesine koyar,
// bu yüzden ayrı bir "sahip miyim" sorgusu gerekmez (bkz. docs/hermes-entegrasyon.md → Kasa izni).
const KASA_OPTIONS = [
  { value: '', label: 'Kasa kapalı' },
  { value: 'read', label: 'Kasa: yalnız okuma' },
  { value: 'write', label: 'Kasa: okuma + yazma' },
]
const kasaVisible = key => Object.prototype.hasOwnProperty.call(key, 'kasa_access')

const toast = (message, kind) => useToastStore.getState().addToast(message, kind)
const apiError = (err, fallback) => err.response?.data?.error || fallback

export default function AgentKeysPage() {
  const queryClient = useQueryClient()
  const [name, setName] = useState('hermes')
  const [userId, setUserId] = useState('')
  const [access, setAccess] = useState('write')
  const [fresh, setFresh] = useState(null) // yeni oluşturulan anahtar — yalnız bu ekranda, bir kez

  const keys = useQuery({ queryKey: ['agent-keys'], queryFn: () => api.get('/agent/keys').then(r => r.data) })
  const users = useQuery({ queryKey: ['users'], queryFn: () => api.get('/users').then(r => r.data) })
  const activity = useQuery({
    queryKey: ['agent-activity'],
    queryFn: () => api.get('/agent/activity?limit=40').then(r => r.data),
    refetchInterval: 60_000,
  })

  const create = useMutation({
    mutationFn: () => api.post('/agent/keys', {
      name: name.trim(), access, ...(userId ? { user_id: Number(userId) } : {}),
    }).then(r => r.data),
    onSuccess: (data) => {
      setFresh(data)
      queryClient.invalidateQueries({ queryKey: ['agent-keys'] })
    },
    onError: err => toast(apiError(err, 'Anahtar oluşturulamadı'), 'error'),
  })

  const revoke = useMutation({
    mutationFn: id => api.delete(`/agent/keys/${id}`),
    onSuccess: () => {
      toast('Anahtar iptal edildi', 'success')
      queryClient.invalidateQueries({ queryKey: ['agent-keys'] })
    },
    onError: err => toast(apiError(err, 'Anahtar iptal edilemedi'), 'error'),
  })

  const setKasa = useMutation({
    mutationFn: ({ id, value }) => api.patch(`/agent/keys/${id}/kasa`, { access: value || null }).then(r => r.data),
    onSuccess: (data) => {
      toast(data.kasa_access ? 'Kasa izni güncellendi' : 'Kasa izni kaldırıldı', 'success')
      queryClient.invalidateQueries({ queryKey: ['agent-keys'] })
    },
    onError: err => toast(apiError(err, 'Kasa izni değiştirilemedi'), 'error'),
  })

  async function handleKasa(key, value) {
    if (value === (key.kasa_access || '')) return
    if (value === 'write') {
      const ok = await confirmDialog({
        title: 'Kasaya yazma izni',
        body: `"${key.name}" kasadaki uygulama verisini doğrudan değiştirebilecek. Hermes'in Telegram kayıtları zaten kendi kasa anahtarıyla gidiyor; yazma izni yalnız bunu bilerek isteyen bir araç için gerekir.`,
        confirmLabel: 'Yazma izni ver',
        danger: true,
      })
      if (!ok) return
    }
    setKasa.mutate({ id: key.id, value })
  }

  async function handleRevoke(key) {
    const ok = await confirmDialog({
      title: 'Anahtarı iptal et',
      body: `"${key.name}" anahtarı anında geçersiz olur; bu anahtarı kullanan ajan YYS'ye erişemez. Geri alınamaz — gerekirse yeni anahtar oluşturursunuz.`,
      confirmLabel: 'İptal et',
      danger: true,
    })
    if (ok) revoke.mutate(key.id)
  }

  async function copyKey() {
    try {
      await navigator.clipboard.writeText(fresh.key)
      toast('Anahtar panoya kopyalandı', 'success')
    } catch {
      toast('Kopyalanamadı — anahtarı elle seçip kopyalayın', 'error')
    }
  }

  if (keys.isLoading) return <SkeletonGrid count={3} />
  if (keys.error) {
    return <div style={box}>Anahtarlar yüklenemedi. <button style={linkBtn} onClick={() => keys.refetch()}>Tekrar dene</button></div>
  }

  const activeUsers = (users.data || []).filter(u => u.is_active !== 0 && ROLE_LABELS[u.role])
  const list = keys.data || []

  return (
    <div>
      <header style={{ marginBottom: 14 }}>
        <h2 style={{ margin: 0, fontFamily: 'var(--display)', letterSpacing: 1, color: 'var(--text)' }}>AJAN ANAHTARLARI</h2>
        <p style={{ margin: '4px 0 0', color: 'var(--text2)', fontSize: 13 }}>
          Hermes gibi bir ajanın YYS'de sizin adınıza işlem yapabilmesi için kalıcı anahtar. Anahtar, bağlandığı
          kullanıcının rolüyle çalışır; şifre, oturum ve yedek geri yükleme uçlarına giremez; özel kasaya ancak ayrıca izin verilirse girer.
        </p>
      </header>

      {fresh && (
        <section style={{ ...box, borderColor: 'var(--accent)', marginBottom: 16 }} aria-label="Yeni anahtar">
          <strong style={{ color: 'var(--text)', display: 'block', marginBottom: 6 }}>
            Yeni anahtar hazır — şimdi kopyalayın, bir daha gösterilmeyecek
          </strong>
          <code style={keyBox}>{fresh.key}</code>
          <div style={{ display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
            <button type="button" style={primaryBtn} onClick={copyKey}>Kopyala</button>
            <button type="button" style={linkBtn} onClick={() => setFresh(null)}>Kopyaladım, kapat</button>
          </div>
          <small style={{ display: 'block', marginTop: 8, color: 'var(--text2)' }}>
            Sunucuda Hermes kullanıcısının <code>~/.hermes/yys.env</code> dosyasına <code>YYS_AGENT_KEY=…</code> olarak yazılır
            (kurulum: docs/hermes-entegrasyon.md).
          </small>
        </section>
      )}

      <section style={{ ...box, marginBottom: 18 }} aria-label="Yeni anahtar oluştur">
        <h3 style={sectionTitle}>YENİ ANAHTAR</h3>
        <form
          style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 10, alignItems: 'end' }}
          onSubmit={(e) => { e.preventDefault(); create.mutate() }}
        >
          <label style={field}>
            <span style={fieldLabel}>Ad</span>
            <input style={input} value={name} onChange={e => setName(e.target.value)} minLength={2} maxLength={60} required />
          </label>
          <label style={field}>
            <span style={fieldLabel}>Hangi kullanıcı adına</span>
            <select style={input} value={userId} onChange={e => setUserId(e.target.value)}>
              <option value="">Kendi hesabım</option>
              {activeUsers.map(u => (
                <option key={u.id} value={u.id}>{u.full_name || u.username} — {ROLE_LABELS[u.role]}</option>
              ))}
            </select>
          </label>
          <label style={field}>
            <span style={fieldLabel}>Erişim</span>
            <select style={input} value={access} onChange={e => setAccess(e.target.value)}>
              <option value="write">Okuma + yazma</option>
              <option value="read">Yalnız okuma</option>
            </select>
          </label>
          <button type="submit" style={primaryBtn} disabled={create.isPending || name.trim().length < 2}>
            {create.isPending ? 'Oluşturuluyor…' : 'Anahtar oluştur'}
          </button>
        </form>
      </section>

      <h3 style={sectionTitle}>ANAHTARLAR</h3>
      {list.length === 0 ? (
        <div style={box}>Henüz anahtar yok. Hermes'in YYS'yi kullanabilmesi için bir anahtar oluşturun.</div>
      ) : (
        <div style={{ display: 'grid', gap: 8, marginBottom: 18 }}>
          {list.map(key => {
            const dead = Boolean(key.revoked_at) || key.user_active === 0
            return (
              <article key={key.id} style={{ ...row, opacity: dead ? 0.55 : 1 }}>
                <div style={{ minWidth: 0 }}>
                  <strong style={{ color: 'var(--text)', display: 'block' }}>
                    {key.name} <code style={{ color: 'var(--text3)', fontWeight: 400 }}>{key.key_prefix}…</code>
                  </strong>
                  <small style={{ color: 'var(--text2)' }}>
                    {key.full_name || key.username} · {ROLE_LABELS[key.role] || key.role} · {key.access === 'read' ? 'yalnız okuma' : 'okuma + yazma'}
                  </small>
                  {kasaVisible(key) && !key.revoked_at && (
                    <select
                      aria-label={`${key.name} kasa izni`}
                      style={{ ...input, display: 'block', marginTop: 6, padding: '4px 8px', fontSize: 12 }}
                      value={key.kasa_access || ''}
                      disabled={setKasa.isPending}
                      onChange={e => handleKasa(key, e.target.value)}
                    >
                      {KASA_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                    </select>
                  )}
                </div>
                <div style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                  <div style={{ color: 'var(--text)', fontSize: 13 }}>
                    {key.revoked_at ? `İptal: ${formatStamp(key.revoked_at)}`
                      : key.user_active === 0 ? 'Hesap askıda'
                        : key.last_used_at ? `Son kullanım: ${formatStamp(key.last_used_at)}` : 'Henüz kullanılmadı'}
                  </div>
                  <small style={{ color: 'var(--text3)' }}>Oluşturma: {formatStamp(key.created_at)}</small>
                </div>
                {key.revoked_at
                  ? <span style={{ color: 'var(--text3)', fontSize: 13 }}>İptal edildi</span>
                  : <button type="button" style={dangerBtn} onClick={() => handleRevoke(key)} disabled={revoke.isPending}>İptal et</button>}
              </article>
            )
          })}
        </div>
      )}

      <h3 style={sectionTitle}>AJANIN SON İŞLEMLERİ <span style={{ color: 'var(--text2)', fontWeight: 400 }}>· yalnız değişiklikler</span></h3>
      {(activity.data || []).length === 0 ? (
        <div style={box}>Ajan henüz bir değişiklik yapmadı.</div>
      ) : (
        <div style={{ ...box, padding: 0, overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <tbody>
              {(activity.data || []).map(item => (
                <tr key={item.id} style={{ borderBottom: '1px solid var(--border)' }}>
                  <td style={cell}>{formatStamp(item.created_at)}</td>
                  <td style={{ ...cell, color: 'var(--text)', fontFamily: 'var(--mono, monospace)' }}>{item.action}</td>
                  <td style={cell}>{item.detail || ''}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

const box = { background: 'var(--surface2)', borderWidth: 1, borderStyle: 'solid', borderColor: 'var(--border)', borderRadius: 10, padding: 14, color: 'var(--text2)' }
const sectionTitle = { margin: '0 0 8px', fontSize: 12, letterSpacing: 1.2, color: 'var(--text2)', fontWeight: 700 }
const row = {
  display: 'grid', gridTemplateColumns: 'minmax(0,1fr) auto auto', gap: 12, alignItems: 'center',
  background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 10, padding: '10px 12px',
}
const field = { display: 'grid', gap: 4 }
const fieldLabel = { fontSize: 11, letterSpacing: 1, color: 'var(--text2)' }
const input = { background: 'var(--surface3)', border: '1px solid var(--border)', borderRadius: 8, padding: '8px 10px', color: 'var(--text)', minWidth: 0 }
const keyBox = {
  display: 'block', background: 'var(--surface3)', border: '1px solid var(--border)', borderRadius: 8, padding: '10px 12px',
  color: 'var(--text)', wordBreak: 'break-all', userSelect: 'all', fontSize: 13,
}
const cell = { padding: '8px 12px', color: 'var(--text2)', whiteSpace: 'nowrap' }
const linkBtn = { background: 'none', border: '1px solid var(--border)', borderRadius: 8, padding: '6px 12px', color: 'var(--text2)', cursor: 'pointer' }
const primaryBtn = { background: 'var(--accent)', border: 'none', borderRadius: 8, padding: '8px 14px', color: '#1a1200', cursor: 'pointer', fontWeight: 600 }
const dangerBtn = { background: 'var(--red)', border: 'none', borderRadius: 8, padding: '8px 14px', color: '#fff', cursor: 'pointer', fontWeight: 600 }
