import { useQuery } from '@tanstack/react-query'
import api from '../../shared/api/client.js'

function formatBytes(b) {
  if (b == null) return '—'
  if (b < 1024) return `${b} B`
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)} KB`
  if (b < 1024 * 1024 * 1024) return `${(b / 1024 / 1024).toFixed(1)} MB`
  return `${(b / 1024 / 1024 / 1024).toFixed(2)} GB`
}

function formatUptime(s) {
  if (s == null) return '—'
  const d = Math.floor(s / 86400)
  const h = Math.floor((s % 86400) / 3600)
  const m = Math.floor((s % 3600) / 60)
  if (d > 0) return `${d}g ${h}s`
  if (h > 0) return `${h}s ${m}dk`
  return `${m}dk`
}

export default function SystemHealthPage() {
  const { data, isLoading, refetch, isFetching } = useQuery({
    queryKey: ['system-info'],
    queryFn: () => api.get('/system/info').then(r => r.data),
    refetchInterval: 30_000,
  })

  if (isLoading) {
    return <div style={{ padding: 40, textAlign: 'center', fontFamily: 'var(--mono)', color: 'var(--text3)' }}>Yükleniyor...</div>
  }

  return (
    <div>
      <div className="fade-up" style={{ marginBottom: 24, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h2 style={{ fontSize: 28, letterSpacing: 4 }}>SİSTEM SAĞLIĞI</h2>
          <p style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--text3)', letterSpacing: 1, marginTop: 4 }}>
            ANLIK DURUM · 30SN OTOMATİK YENİLENİR
          </p>
        </div>
        <button
          type="button"
          onClick={() => refetch()}
          disabled={isFetching}
          style={{
            padding: '6px 14px', background: 'transparent',
            border: '1px solid var(--border)', borderRadius: 6,
            fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--text2)',
            cursor: isFetching ? 'not-allowed' : 'pointer',
          }}
        >{isFetching ? '⟳ YENİLENİYOR' : '⟳ YENİLE'}</button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 16, marginBottom: 16 }}>
        <Card title="SUNUCU" accent="#10b981">
          <Row k="Durum" v={<Status ok />} />
          <Row k="Uptime" v={formatUptime(data.server.uptime_sec)} />
          <Row k="Başlangıç" v={new Date(data.server.started_at).toLocaleString('tr-TR')} small />
          <Row k="Node" v={data.server.node_version} />
          <Row k="Ortam" v={data.server.env} />
          <Row k="Hostname" v={data.server.hostname} small />
          <Row k="Heap" v={`${data.server.memory.heap_used_mb} / ${data.server.memory.heap_total_mb} MB`} />
          <Row k="RSS" v={`${data.server.memory.rss_mb} MB`} />
          <Row k="Load (1/5/15dk)" v={data.server.load_avg.join(' / ')} small />
        </Card>

        <Card title="VERİTABANI" accent="#6366f1">
          <Row k="Boyut" v={formatBytes(data.database.size)} highlight />
          <Row k="Yol" v={data.database.path} mono small />
          <Row k="Kullanıcı" v={data.stats.users ?? '—'} />
          <Row k="Personel" v={data.stats.personnel ?? '—'} />
          <Row k="Oda" v={data.stats.rooms ?? '—'} />
          <Row k="Çamaşır" v={data.stats.laundry_items ?? '—'} />
          <Row k="Bildirim" v={data.stats.notifications ?? '—'} />
          <Row k="Audit Log" v={data.stats.audit_log ?? '—'} />
        </Card>

        <Card title="YEDEKLEME" accent={data.backups.count > 0 ? '#10b981' : '#f59e0b'}>
          <Row k="Toplam yedek" v={data.backups.count} highlight />
          <Row k="Toplam boyut" v={formatBytes(data.backups.total_size)} />
          {data.backups.last ? (
            <>
              <Row k="Son yedek" v={data.backups.last.name} mono small />
              <Row k="Son tarih" v={new Date(data.backups.last.created_at).toLocaleString('tr-TR')} small />
              <Row k="Son boyut" v={formatBytes(data.backups.last.size)} />
            </>
          ) : (
            <div style={{ padding: 8, color: 'var(--orange, #f59e0b)', fontSize: 11, fontFamily: 'var(--mono)' }}>
              ⚠ Henüz yedek yok
            </div>
          )}
          <Row k="Klasör" v={data.backups.dir} mono small />
        </Card>

        <Card title="HATALAR" accent={data.stats.error_log_24h > 0 ? '#ef4444' : '#10b981'}>
          <Row k="Son 24s" v={data.stats.error_log_24h ?? 0} highlight color={data.stats.error_log_24h > 0 ? '#ef4444' : 'var(--text)'} />
          <Row k="Toplam" v={data.stats.error_log_total ?? 0} />
          <a href="/error-log" style={{
            display: 'inline-block', marginTop: 12, fontSize: 10, fontFamily: 'var(--mono)',
            color: 'var(--accent)', textDecoration: 'none', letterSpacing: 1,
          }}>HATA LOGLARINI GÖR →</a>
        </Card>

        <Card title="DEPOLAMA" accent="#6366f1">
          <Row k="Uploads" v={formatBytes(data.storage.uploads_size)} highlight />
          <Row k="Klasör" v={data.storage.uploads_dir} mono small />
        </Card>

        <Card title="CRON İŞLERİ" accent="#a78bfa">
          <Row k="Yedekleme" v={data.cron.backup} mono small />
          <Row k="Temizlik" v={data.cron.cleanup} mono small />
          <Row k="SLA Kontrol" v={data.cron.sla_check} mono small />
          <Row k="Premium uyarı" v={data.cron.premium_alert} mono small />
        </Card>
      </div>
    </div>
  )
}

function Card({ title, children, accent }) {
  return (
    <div className="panel">
      <div style={{ height: 2, background: accent || 'var(--accent)' }} />
      <div className="panel-header">
        <div className="panel-title" style={{ color: accent }}>{title}</div>
      </div>
      <div className="panel-body">{children}</div>
    </div>
  )
}

function Row({ k, v, mono, small, highlight, color }) {
  return (
    <div style={{
      display: 'flex', justifyContent: 'space-between', alignItems: 'baseline',
      padding: '6px 0', borderBottom: '1px solid var(--border-subtle, rgba(255,255,255,0.04))',
      gap: 12,
    }}>
      <span style={{ fontFamily: 'var(--mono)', fontSize: 9, letterSpacing: 1, color: 'var(--text3)' }}>{k.toUpperCase()}</span>
      <span style={{
        fontFamily: mono ? 'var(--mono)' : 'inherit',
        fontSize: small ? 10 : (highlight ? 14 : 12),
        fontWeight: highlight ? 700 : 400,
        color: color || 'var(--text)',
        textAlign: 'right', wordBreak: 'break-all',
      }}>{v}</span>
    </div>
  )
}

function Status({ ok }) {
  return <span style={{
    padding: '2px 8px', borderRadius: 4, fontSize: 9, fontFamily: 'var(--mono)',
    letterSpacing: 1, fontWeight: 700,
    background: ok ? 'rgba(16,185,129,0.15)' : 'rgba(239,68,68,0.15)',
    color: ok ? '#10b981' : '#ef4444',
    border: `1px solid ${ok ? 'rgba(16,185,129,0.3)' : 'rgba(239,68,68,0.3)'}`,
  }}>{ok ? '● ÇALIŞIYOR' : '● HATA'}</span>
}
