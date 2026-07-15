import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import api from '../../../shared/api/client.js'
import { confirmDialog } from '../../../shared/components/ConfirmDialog.jsx'
import { useAuthStore } from '../../../shared/store/authStore.js'
import { useToastStore } from '../../../shared/store/toastStore.js'
import { todayStr } from '../logic/waterUi.js'
import WaterCollapsiblePanel from './WaterCollapsiblePanel.jsx'

const STATUS_META = {
  smtp_disabled: { label: 'SMTP kapalı', color: 'var(--amber, #b45309)', background: 'color-mix(in srgb, var(--amber, #b45309) 12%, var(--surface))' },
  no_recipients: { label: 'Alıcı eksik', color: 'var(--amber, #b45309)', background: 'color-mix(in srgb, var(--amber, #b45309) 12%, var(--surface))' },
  queued: { label: 'Kuyrukta', color: 'var(--accent)', background: 'color-mix(in srgb, var(--accent) 10%, var(--surface))' },
  sending: { label: 'Gönderiliyor', color: 'var(--accent)', background: 'color-mix(in srgb, var(--accent) 10%, var(--surface))' },
  retrying: { label: 'Yeniden deneniyor', color: 'var(--amber, #b45309)', background: 'color-mix(in srgb, var(--amber, #b45309) 12%, var(--surface))' },
  sent: { label: 'Gönderildi', color: 'var(--green)', background: 'color-mix(in srgb, var(--green) 10%, var(--surface))' },
  failed: { label: 'Gönderilemedi', color: 'var(--red)', background: 'color-mix(in srgb, var(--red) 10%, var(--surface))' },
}

const SMTP_LABELS = { host: 'sunucu', user: 'kullanıcı', pass: 'şifre' }
const ACTIVE_STATUSES = new Set(['queued', 'sending', 'retrying'])

function statusMeta(status) {
  return STATUS_META[status] || { label: status || 'Henüz çalışmadı', color: 'var(--text3)', background: 'var(--surface2)' }
}

function StatusBadge({ status }) {
  const meta = statusMeta(status)
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', minHeight: '24px', padding: '3px 8px',
      border: `1px solid color-mix(in srgb, ${meta.color} 42%, var(--border))`, borderRadius: '5px',
      color: meta.color, background: meta.background, fontSize: '10px', fontWeight: 750, whiteSpace: 'nowrap',
    }}>
      {meta.label}
    </span>
  )
}

function localTimestamp(value) {
  if (!value) return '—'
  const normalized = /Z$|[+-]\d\d:\d\d$/.test(value) ? value : `${String(value).replace(' ', 'T')}Z`
  const date = new Date(normalized)
  if (Number.isNaN(date.getTime())) return value
  return new Intl.DateTimeFormat('tr-TR', {
    day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit',
  }).format(date)
}

function dateLabel(value) {
  if (!value) return '—'
  const date = new Date(`${value}T00:00:00`)
  return Number.isNaN(date.getTime())
    ? value
    : new Intl.DateTimeFormat('tr-TR', { day: '2-digit', month: 'short', weekday: 'short' }).format(date)
}

function digestButtonLabel(todayRow) {
  if (!todayRow) return 'Bugünün özetini hazırla'
  if (todayRow.status === 'sent') return 'Bugünü yeniden gönder'
  if (['failed', 'smtp_disabled', 'no_recipients'].includes(todayRow.status)) return 'Yeniden dene'
  return 'İşleniyor'
}

export default function WaterDailyDigestPanel() {
  const [open, setOpen] = useState(false)
  const queryClient = useQueryClient()
  const isManager = useAuthStore(state => state.user?.role === 'campus_manager')
  const today = todayStr()
  const query = useQuery({
    queryKey: ['water-daily-digest'],
    queryFn: () => api.get('/water/daily-digest', { params: { limit: 14 } }).then(response => response.data),
    refetchInterval: import.meta.env.MODE === 'test' ? false : 15000,
  })
  const rows = query.data?.rows || []
  const todayRow = useMemo(() => rows.find(row => row.date === today) || null, [rows, today])
  const latest = todayRow || rows[0] || null
  const active = todayRow && ACTIVE_STATUSES.has(todayRow.status)
  const latestMeta = statusMeta(latest?.status)

  const runDigest = useMutation({
    mutationFn: force => api.post('/water/daily-digest/run', { force }).then(response => response.data),
    onSuccess: result => {
      queryClient.invalidateQueries({ queryKey: ['water-daily-digest'] })
      const status = result?.email?.status
      const message = status === 'queued'
        ? 'Günlük su özeti e-posta kuyruğuna alındı.'
        : status === 'smtp_disabled'
          ? 'Özet hazırlandı; SMTP ayarları eksik olduğu için e-posta kuyruğa alınmadı.'
          : status === 'no_recipients'
            ? 'Özet hazırlandı; e-posta alıcısı tanımlı değil.'
            : 'Günlük özet durumu güncellendi.'
      useToastStore.getState().addToast(message, status === 'queued' ? 'success' : 'warning')
      setOpen(true)
    },
    onError: error => useToastStore.getState().addToast(
      error?.response?.data?.error || error?.message || 'Günlük özet çalıştırılamadı.',
      'error',
    ),
  })

  const handleRun = async () => {
    const force = Boolean(todayRow)
    if (todayRow?.status === 'sent') {
      const confirmed = await confirmDialog({
        title: 'Günlük özeti yeniden gönder',
        body: `${today} tarihli özet daha önce gönderildi. Aynı alıcılara yeniden gönderilsin mi?`,
        confirmText: 'Yeniden Gönder',
      })
      if (!confirmed) return
    }
    runDigest.mutate(force)
  }

  const summary = latest?.summary || {}
  const counts = summary.summary || {}
  const missing = (query.data?.smtp?.missing || []).map(key => SMTP_LABELS[key] || key)
  const subtitle = latest
    ? `${latest.date === today ? 'Bugün' : latest.date} · ${latestMeta.label}${latest.sent_at ? ` · ${localTimestamp(latest.sent_at)}` : ''}`
    : `Her gün ${query.data?.schedule?.time || '06:15'} · henüz teslim kaydı yok`

  return (
    <WaterCollapsiblePanel
      id="water-daily-digest-panel"
      open={open}
      onToggle={() => setOpen(value => !value)}
      title="Günlük Özet Teslimi"
      subtitle={subtitle}
      openLabel="Teslim geçmişi"
      closeLabel="Geçmişi gizle"
      style={{ marginBottom: '16px', borderLeft: `5px solid ${latestMeta.color}` }}
      beforeToggle={<StatusBadge status={latest?.status} />}
      afterToggle={isManager && (
        <button type="button" className="btn btn-primary btn-sm" onClick={handleRun} disabled={runDigest.isPending || active}>
          {runDigest.isPending ? 'Hazırlanıyor...' : digestButtonLabel(todayRow)}
        </button>
      )}
    >
      <div style={{ borderTop: '1px solid var(--border)', padding: '14px 16px 16px' }}>
        <div style={{
          display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))', gap: '14px',
          paddingBottom: '14px', borderBottom: '1px solid var(--border)',
        }}>
          <div>
            <div style={{ fontSize: '10px', color: 'var(--text3)', fontWeight: 750 }}>OTOMATİK ÇALIŞMA</div>
            <div style={{ marginTop: '4px', fontSize: '13px', fontWeight: 700 }}>
              Her gün {query.data?.schedule?.time || '06:15'} · İstanbul
            </div>
            <div style={{ marginTop: '3px', color: 'var(--text3)', fontSize: '11px' }}>Özet hazırlanır, uygulama bildirimi ve e-posta teslimi ayrı izlenir.</div>
          </div>
          <div>
            <div style={{ fontSize: '10px', color: 'var(--text3)', fontWeight: 750 }}>SMTP DURUMU</div>
            <div style={{ marginTop: '4px', fontSize: '13px', fontWeight: 700, color: query.data?.smtp?.configured ? 'var(--green)' : 'var(--amber, #b45309)' }}>
              {query.data?.smtp?.configured ? 'Gönderime hazır' : `Eksik: ${missing.join(', ') || 'yapılandırma'}`}
            </div>
            <div style={{ marginTop: '3px', color: 'var(--text3)', fontSize: '11px' }}>
              {(query.data?.recipients || []).length
                ? `${query.data.recipients.length} alıcı: ${query.data.recipients.join(', ')}`
                : 'Müdür veya vardiya sorumlusu hesabında e-posta tanımlı değil.'}
            </div>
          </div>
          <div>
            <div style={{ fontSize: '10px', color: 'var(--text3)', fontWeight: 750 }}>SON ÖZET</div>
            <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', marginTop: '5px', fontSize: '12px' }}>
              <span>İrsaliye <strong>{counts.pending || 0}</strong></span>
              <span>Eksi <strong style={{ color: counts.negative ? 'var(--red)' : 'inherit' }}>{counts.negative || 0}</strong></span>
              <span>Düşük <strong>{counts.low || 0}</strong></span>
              <span>Sipariş <strong>{summary.order_count || 0}</strong></span>
            </div>
            <div style={{ marginTop: '4px', color: 'var(--text3)', fontSize: '11px' }}>
              {summary.parts?.length ? summary.parts.join(' · ') : 'Özet ayrıntısı henüz oluşmadı.'}
            </div>
          </div>
        </div>

        <div style={{ marginTop: '14px', overflowX: 'auto' }}>
          <table className="data-table" style={{ minWidth: '760px', width: '100%' }}>
            <thead>
              <tr>
                <th>Tarih</th><th>Durum</th><th>Alıcı</th><th>Kaynak</th><th>Deneme</th><th>İşlem zamanı</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(row => (
                <tr key={row.id}>
                  <td style={{ fontWeight: 700 }}>{dateLabel(row.date)}</td>
                  <td><StatusBadge status={row.status} /></td>
                  <td>{row.recipients?.length || 0}</td>
                  <td>{row.source === 'manual' ? (row.requested_by_name || 'Elle') : 'Otomatik'}</td>
                  <td>{row.attempts || 0}{row.max_attempts ? ` / ${row.max_attempts}` : ''}</td>
                  <td>{localTimestamp(row.sent_at || row.queued_at || row.updated_at)}</td>
                </tr>
              ))}
              {!query.isLoading && rows.length === 0 && (
                <tr><td colSpan="6" style={{ textAlign: 'center', color: 'var(--text3)', padding: '18px' }}>Henüz günlük özet teslim kaydı yok.</td></tr>
              )}
              {query.isLoading && (
                <tr><td colSpan="6" style={{ textAlign: 'center', color: 'var(--text3)', padding: '18px' }}>Teslim geçmişi yükleniyor...</td></tr>
              )}
            </tbody>
          </table>
        </div>
        {latest?.error && (
          <div role="alert" style={{ marginTop: '10px', borderLeft: '4px solid var(--red)', background: 'color-mix(in srgb, var(--red) 7%, var(--surface))', padding: '8px 10px', color: 'var(--red)', fontSize: '11px' }}>
            Son teslim hatası: {latest.error}
          </div>
        )}
      </div>
    </WaterCollapsiblePanel>
  )
}
