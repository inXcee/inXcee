import { useQuery } from '@tanstack/react-query'
import api from '../../shared/api/client.js'
import HelpHint from '../../shared/components/HelpHint.jsx'

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
  const { data, isLoading, error, refetch, isFetching } = useQuery({
    queryKey: ['system-info'],
    queryFn: () => api.get('/system/info').then(r => r.data),
    refetchInterval: 30_000,
  })
  const { data: health } = useQuery({
    queryKey: ['api-health'],
    queryFn: () => api.get('/health').then(r => r.data),
    refetchInterval: 30_000,
  })

  if (isLoading) {
    return <div style={{ padding: 40, textAlign: 'center', fontFamily: 'var(--mono)', color: 'var(--text3)' }}>Yükleniyor...</div>
  }
  if (error || !data) {
    return (
      <div style={{ padding: 24 }}>
        <h2 style={{ fontSize: 22, letterSpacing: 2 }}>SİSTEM SAĞLIĞI</h2>
        <div style={{ marginTop: 12, padding: 16, borderRadius: 10, background: 'rgba(239,68,68,.08)', border: '1px solid rgba(239,68,68,.3)' }}>
          <div style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--red)', letterSpacing: 1.5 }}>
            ⚠ SİSTEM BİLGİSİ YÜKLENEMEDİ
          </div>
          <div style={{ fontSize: 13, color: 'var(--text2)', marginTop: 6 }}>
            {error?.response?.data?.error || error?.message || 'Sunucu yanıt vermiyor'}
          </div>
          <button onClick={() => refetch()} className="btn btn-primary btn-sm" style={{ marginTop: 12, borderRadius: 8 }}>↻ TEKRAR DENE</button>
        </div>
      </div>
    )
  }
  // Defensive — backend bazı alanları boş yollayabilir
  const srv = data.server || {}
  const mem = srv.memory || {}
  const loadAvg = Array.isArray(srv.load_avg) ? srv.load_avg : []
  const dbInfo = data.database || {}
  const stats = data.stats || {}
  const backups = data.backups || { count: 0, total_size: 0 }
  const storage = data.storage || {}
  const cron = data.cron || {}

  return (
    <div>
      <div className="fade-up" style={{ marginBottom: 24, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h2 style={{ fontSize: 28, letterSpacing: 4 }}>
            SİSTEM SAĞLIĞI<HelpHint topic="system" title="SİSTEM" />
          </h2>
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
          <Row k="Uptime" v={formatUptime(srv.uptime_sec || 0)} />
          <Row k="Başlangıç" v={srv.started_at ? new Date(srv.started_at).toLocaleString('tr-TR') : '—'} small />
          <Row k="Node" v={srv.node_version || '—'} />
          <Row k="Ortam" v={srv.env || '—'} />
          <Row k="Hostname" v={srv.hostname || '—'} small />
          <Row k="Heap" v={`${mem.heap_used_mb ?? '—'} / ${mem.heap_total_mb ?? '—'} MB`} />
          <Row k="RSS" v={`${mem.rss_mb ?? '—'} MB`} />
          <Row k="Load (1/5/15dk)" v={loadAvg.length ? loadAvg.join(' / ') : '—'} small />
        </Card>

        <Card title="VERİTABANI" accent="#6366f1">
          <Row k="Boyut" v={formatBytes(dbInfo.size || 0)} highlight />
          <Row k="Yol" v={dbInfo.path || '—'} mono small />
          <Row k="Kullanıcı" v={stats.users ?? '—'} />
          <Row k="Personel" v={stats.personnel ?? '—'} />
          <Row k="Oda" v={stats.rooms ?? '—'} />
          <Row k="Çamaşır" v={stats.laundry_items ?? '—'} />
          <Row k="Bildirim" v={stats.notifications ?? '—'} />
          <Row k="Audit Log" v={stats.audit_log ?? '—'} />
        </Card>

        <Card title="YEDEKLEME" accent={backups.count > 0 ? '#10b981' : '#f59e0b'}>
          <Row k="Toplam yedek" v={backups.count || 0} highlight />
          <Row k="Toplam boyut" v={formatBytes(backups.total_size || 0)} />
          {backups.last ? (
            <>
              <Row k="Son yedek" v={backups.last.name} mono small />
              <Row k="Son tarih" v={new Date(backups.last.created_at).toLocaleString('tr-TR')} small />
              <Row k="Son boyut" v={formatBytes(backups.last.size)} />
            </>
          ) : (
            <div style={{ padding: 8, color: 'var(--orange, #f59e0b)', fontSize: 11, fontFamily: 'var(--mono)' }}>
              ⚠ Henüz yedek yok
            </div>
          )}
          <Row k="Klasör" v={backups.dir || '—'} mono small />
        </Card>

        <Card title="HATALAR" accent={stats.error_log_24h > 0 ? '#ef4444' : '#10b981'}>
          <Row k="Son 24s" v={stats.error_log_24h ?? 0} highlight color={stats.error_log_24h > 0 ? '#ef4444' : 'var(--text)'} />
          <Row k="Toplam" v={stats.error_log_total ?? 0} />
          <a href="/error-log" style={{
            display: 'inline-block', marginTop: 12, fontSize: 10, fontFamily: 'var(--mono)',
            color: 'var(--accent)', textDecoration: 'none', letterSpacing: 1,
          }}>HATA LOGLARINI GÖR →</a>
        </Card>

        <Card title="DEPOLAMA" accent="#6366f1">
          <Row k="Uploads" v={formatBytes(storage.uploads_size || 0)} highlight />
          <Row k="Klasör" v={storage.uploads_dir || '—'} mono small />
        </Card>

        <Card title="ŞEMA BÜTÜNLÜĞÜ" accent={health?.schema === 'ok' ? '#10b981' : '#ef4444'}>
          <Row k="Migration durumu" v={<Status ok={health?.schema === 'ok'} />} />
          <Row k="Sürüm" v={health?.version || '—'} mono small />
          <Row k="Commit" v={health?.commit || '—'} mono small />
          {health?.schema !== 'ok' && (health?.schema_missing || []).length > 0 && (
            <div style={{ marginTop: 8, padding: 8, borderRadius: 8, background: 'rgba(239,68,68,.08)', border: '1px solid rgba(239,68,68,.3)' }}>
              <div style={{ fontFamily: 'var(--mono)', fontSize: 9, color: '#ef4444', letterSpacing: 1, marginBottom: 4 }}>
                ⚠ EKSİK ŞEMA NESNELERİ — MIGRATION SESSİZ SKIP OLMUŞ OLABİLİR
              </div>
              {health.schema_missing.map(m => (
                <div key={m} style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--text2)' }}>{m}</div>
              ))}
            </div>
          )}
        </Card>

        <Card title="CRON İŞLERİ" accent="#a78bfa">
          <Row k="Yedekleme" v={cron.backup || '—'} mono small />
          <Row k="Temizlik" v={cron.cleanup || '—'} mono small />
          <Row k="SLA Kontrol" v={cron.sla_check || '—'} mono small />
          <Row k="Premium uyarı" v={cron.premium_alert || '—'} mono small />
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
