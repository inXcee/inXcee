import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import api from '../../shared/api/client.js'
import { confirmDialog } from '../../shared/components/ConfirmDialog.jsx'
import { useToastStore } from '../../shared/store/toastStore.js'
import { SkeletonGrid } from '../../shared/components/Skeleton.jsx'

const ROLE_LABELS = {
  avs_kiosk: 'Kiosk (AVS personeli)',
  kiosk: 'Kiosk (sakin)',
  campus_manager: 'Kampüs yöneticisi',
  shift_supervisor: 'Vardiya amiri',
  technical: 'Teknik',
  laundry: 'Çamaşırhane',
  housekeeper: 'Kat görevlisi',
}

const KIND_LABELS = { user: 'Panel kullanıcısı', staff: 'AVS personeli', personnel: 'Sakin' }

function parseStamp(value) {
  if (!value) return null
  const normalized = value.includes('T') ? value : value.replace(' ', 'T')
  const date = new Date(`${normalized}${/[zZ]|[+-]\d\d:\d\d$/.test(normalized) ? '' : 'Z'}`)
  return Number.isNaN(date.getTime()) ? null : date
}

function formatStamp(value) {
  const date = parseStamp(value)
  return date ? date.toLocaleString('tr-TR', {
    day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit',
  }) : '—'
}

// "Ne kadar süredir sessiz" — unutulmuş bir tableti fark etmenin en hızlı yolu.
function sinceLabel(value) {
  const date = parseStamp(value)
  if (!date) return 'Henüz istek yok'
  const minutes = Math.max(0, Math.floor((Date.now() - date.getTime()) / 60_000))
  if (minutes < 6) return 'Şu an aktif'
  if (minutes < 60) return `${minutes} dk önce`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours} sa önce`
  return `${Math.floor(hours / 24)} gün önce`
}

function isStale(session) {
  const date = parseStamp(session.last_seen_at || session.created_at)
  return date ? Date.now() - date.getTime() > 7 * 24 * 60 * 60 * 1000 : false
}

export default function SessionsPage() {
  const queryClient = useQueryClient()
  const [query, setQuery] = useState('')
  const [scope, setScope] = useState('all')

  const { data, isLoading, error, refetch, isFetching } = useQuery({
    queryKey: ['auth-sessions'],
    queryFn: () => api.get('/system/sessions').then(r => r.data),
    refetchInterval: 60_000,
  })

  // "Şu an içeride kim var" — oturum değil kişi bazında, daha sık tazelenir.
  const activeQuery = useQuery({
    queryKey: ['active-users'],
    queryFn: () => api.get('/system/active-users?within=15').then(r => r.data),
    refetchInterval: 30_000,
  })

  function tazele() {
    refetch()
    activeQuery.refetch()
    queryClient.invalidateQueries({ queryKey: ['active-users'] })
  }

  const revokeAll = useMutation({
    mutationFn: ({ kind, id }) => api.post('/system/sessions/revoke-all', { kind, id }),
    onSuccess: () => {
      useToastStore.getState().addToast('Kişinin tüm cihazları kapatıldı', 'success')
      tazele()
    },
    onError: (err) => useToastStore.getState().addToast(
      err.response?.data?.error || 'Cihazlar kapatılamadı', 'error',
    ),
  })

  const suspend = useMutation({
    mutationFn: ({ id, reason }) => api.post(`/system/users/${id}/suspend`, { reason }),
    onSuccess: () => {
      useToastStore.getState().addToast('Hesap askıya alındı', 'success')
      tazele()
    },
    onError: (err) => useToastStore.getState().addToast(
      err.response?.data?.error || 'Hesap askıya alınamadı', 'error',
    ),
  })

  async function handleRevokeAll(person) {
    const ok = await confirmDialog({
      title: 'Tüm cihazları kapat',
      body: `${person.full_name || 'Bu kişi'} adına açık ${person.session_count} oturumun tamamı kapatılacak. Hesap açık kalır, yeniden giriş yapabilir.`,
      confirmLabel: 'Hepsini kapat',
      danger: true,
    })
    if (ok) revokeAll.mutate({ kind: person.principal_kind, id: person.principal_id })
  }

  async function handleSuspend(person) {
    const ok = await confirmDialog({
      title: 'Hesabı askıya al',
      body: `${person.full_name || 'Bu kullanıcı'} artık giriş yapamayacak ve açık oturumları anında kapanacak. Hesap silinmez, istediğinizde geri açabilirsiniz.`,
      confirmLabel: 'Askıya al',
      danger: true,
    })
    if (ok) suspend.mutate({ id: person.principal_id, reason: 'Yönetici kararı' })
  }

  const revoke = useMutation({
    mutationFn: (jti) => api.delete(`/system/sessions/${encodeURIComponent(jti)}`),
    onSuccess: () => {
      useToastStore.getState().addToast('Oturum kapatıldı', 'success')
      queryClient.invalidateQueries({ queryKey: ['auth-sessions'] })
    },
    onError: (err) => useToastStore.getState().addToast(
      err.response?.data?.error || 'Oturum kapatılamadı', 'error',
    ),
  })

  const sessions = Array.isArray(data) ? data : []

  const filtered = useMemo(() => {
    const term = query.trim().toLocaleLowerCase('tr-TR')
    return sessions.filter(s => {
      if (scope === 'kiosk' && !String(s.role || '').includes('kiosk')) return false
      if (scope === 'panel' && String(s.role || '').includes('kiosk')) return false
      if (scope === 'stale' && !isStale(s)) return false
      if (!term) return true
      return `${s.full_name || ''} ${ROLE_LABELS[s.role] || s.role || ''}`
        .toLocaleLowerCase('tr-TR').includes(term)
    })
  }, [sessions, query, scope])

  const kioskCount = sessions.filter(s => String(s.role || '').includes('kiosk')).length
  const staleCount = sessions.filter(isStale).length

  async function handleRevoke(session) {
    const ok = await confirmDialog({
      title: 'Oturumu kapat',
      body: `${session.full_name || 'Bu kullanıcı'} bu cihazda yeniden giriş yapmak zorunda kalacak. Diğer cihazları etkilenmez.`,
      confirmLabel: 'Oturumu kapat',
      danger: true,
    })
    if (ok) revoke.mutate(session.jti)
  }

  if (isLoading) return <SkeletonGrid count={4} />
  if (error) {
    return <div style={box}>Oturumlar yüklenemedi. <button style={linkBtn} onClick={() => refetch()}>Tekrar dene</button></div>
  }

  return (
    <div>
      <header style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', marginBottom: 14 }}>
        <div>
          <h2 style={{ margin: 0, fontFamily: 'var(--display)', letterSpacing: 1, color: 'var(--text)' }}>ERİŞİM MERKEZİ</h2>
          <p style={{ margin: '4px 0 0', color: 'var(--text2)', fontSize: 13 }}>
            Şu an kimin içeride olduğunu görün; bir cihazı, kişinin tüm cihazlarını ya da hesabın kendisini kapatın.
          </p>
        </div>
        <button style={linkBtn} onClick={tazele} disabled={isFetching}>
          {isFetching ? 'Yenileniyor…' : '↻ Yenile'}
        </button>
      </header>

      <section style={{ marginBottom: 18 }} aria-label="Şu an içeride olanlar">
        <h3 style={sectionTitle}>ŞU AN İÇERİDE <span style={{ color: 'var(--text2)', fontWeight: 400 }}>· son 15 dakika</span></h3>
        {(activeQuery.data || []).length === 0 ? (
          <div style={box}>Son 15 dakikada istek yapan kimse yok.</div>
        ) : (
          <div style={{ display: 'grid', gap: 8 }}>
            {(activeQuery.data || []).map(person => (
              <article key={`${person.principal_kind}-${person.principal_id}`} style={row}>
                <div style={{ minWidth: 0 }}>
                  <strong style={{ color: 'var(--text)', display: 'block' }}>
                    <span aria-hidden="true" style={{ color: 'var(--green)' }}>● </span>
                    {person.full_name || 'Adı kayıtlı değil'}
                  </strong>
                  <small style={{ color: 'var(--text2)' }}>
                    {ROLE_LABELS[person.role] || person.role || '—'} · {person.session_count} cihaz · {sinceLabel(person.last_seen_at)}
                  </small>
                </div>
                <button type="button" style={linkBtn} onClick={() => handleRevokeAll(person)} disabled={revokeAll.isPending}>
                  Tüm cihazları kapat
                </button>
                {person.principal_kind === 'user' && (
                  <button type="button" style={dangerBtn} onClick={() => handleSuspend(person)} disabled={suspend.isPending}>
                    Hesabı askıya al
                  </button>
                )}
              </article>
            ))}
          </div>
        )}
      </section>

      <h3 style={sectionTitle}>AÇIK OTURUMLAR</h3>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 10, marginBottom: 14 }}>
        <Stat label="Açık oturum" value={sessions.length} />
        <Stat label="Kiosk cihazı" value={kioskCount} />
        <Stat label="7 günden sessiz" value={staleCount} warn={staleCount > 0} />
      </div>

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
        <input
          value={query}
          onChange={e => setQuery(e.target.value)}
          placeholder="Ad veya rol ara…"
          style={{ ...input, flex: '1 1 220px' }}
        />
        <div role="group" aria-label="Oturum filtresi" style={{ display: 'flex', gap: 6 }}>
          {[['all', 'Tümü'], ['kiosk', 'Kiosk'], ['panel', 'Panel'], ['stale', 'Sessiz']].map(([key, label]) => (
            <button
              key={key}
              type="button"
              onClick={() => setScope(key)}
              style={scope === key ? chipActive : chip}
            >{label}</button>
          ))}
        </div>
      </div>

      {filtered.length === 0 ? (
        <div style={box}>Bu filtrede açık oturum yok.</div>
      ) : (
        <div style={{ display: 'grid', gap: 8 }}>
          {filtered.map(session => (
            <article key={session.jti} style={{ ...row, borderColor: isStale(session) ? 'var(--accent)' : 'var(--border)' }}>
              <div style={{ minWidth: 0 }}>
                <strong style={{ color: 'var(--text)', display: 'block' }}>
                  {session.full_name || 'Adı kayıtlı değil'}
                </strong>
                <small style={{ color: 'var(--text2)' }}>
                  {ROLE_LABELS[session.role] || session.role || '—'} · {KIND_LABELS[session.principal_kind] || session.principal_kind}
                </small>
              </div>
              <div style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                <div style={{ color: isStale(session) ? 'var(--accent)' : 'var(--text)', fontSize: 13 }}>
                  {sinceLabel(session.last_seen_at || session.created_at)}
                </div>
                <small style={{ color: 'var(--text3)' }}>Giriş: {formatStamp(session.created_at)}</small>
              </div>
              <button
                type="button"
                style={dangerBtn}
                onClick={() => handleRevoke(session)}
                disabled={revoke.isPending}
              >Oturumu kapat</button>
            </article>
          ))}
        </div>
      )}
    </div>
  )
}

function Stat({ label, value, warn }) {
  return (
    <div style={{ ...box, padding: '10px 12px' }}>
      <div style={{ fontSize: 11, letterSpacing: 1, color: 'var(--text2)' }}>{label.toLocaleUpperCase('tr-TR')}</div>
      <strong style={{ fontSize: 22, color: warn ? 'var(--accent)' : 'var(--text)' }}>{value}</strong>
    </div>
  )
}

const box = { background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 10, padding: 14, color: 'var(--text2)' }
const sectionTitle = { margin: '0 0 8px', fontSize: 12, letterSpacing: 1.2, color: 'var(--text2)', fontWeight: 700 }
// borderColor satır bazında değiştiği için kısayol `border` yerine uzun yazım:
// ikisi bir arada olursa React yeniden çizimde çakışma uyarısı veriyor.
const row = {
  display: 'grid', gridTemplateColumns: 'minmax(0,1fr) auto auto', gap: 12, alignItems: 'center',
  background: 'var(--surface2)', borderWidth: 1, borderStyle: 'solid', borderColor: 'var(--border)',
  borderRadius: 10, padding: '10px 12px',
}
const input = { background: 'var(--surface3)', border: '1px solid var(--border)', borderRadius: 8, padding: '8px 10px', color: 'var(--text)' }
// chipActive yalnız borderColor'ı değiştirdiği için burada da uzun yazım.
const chip = {
  background: 'var(--surface3)', borderWidth: 1, borderStyle: 'solid', borderColor: 'var(--border)',
  borderRadius: 999, padding: '6px 12px', color: 'var(--text2)', cursor: 'pointer',
}
const chipActive = { ...chip, background: 'var(--accent)', color: '#1a1200', borderColor: 'var(--accent)', fontWeight: 600 }
const linkBtn = { background: 'none', border: '1px solid var(--border)', borderRadius: 8, padding: '6px 12px', color: 'var(--text2)', cursor: 'pointer' }
const dangerBtn = { background: 'var(--red)', border: 'none', borderRadius: 8, padding: '8px 14px', color: '#fff', cursor: 'pointer', fontWeight: 600 }
