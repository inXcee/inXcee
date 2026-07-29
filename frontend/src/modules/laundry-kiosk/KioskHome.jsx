import { useEffect, useState } from 'react'

const STAT_META = [
  ['intake_today', 'Bugün Giriş', '🧺', '#38bdf8'],
  ['delivered_today', 'Bugün Teslim', '✅', '#4ade80'],
  ['dirty', 'Kirli', '🫧', '#f59e0b'],
  ['washing', 'Makinede', '⚙️', '#60a5fa'],
  ['ironing', 'Ütüde', '♨️', '#c084fc'],
  ['ready', 'Hazır', '📦', '#34d399'],
  ['urgent', 'Acil', '⚡', '#f87171'],
  ['sla_breaches', 'SLA Aşımı', '⏱️', '#fb7185'],
]

const STATUS_LABELS = {
  dirty: 'Makineye yükle',
  washing: 'Yıkamayı tamamla',
  ironing: 'Ütüyü tamamla',
  ready: 'Teslim et',
}

const STATUS_TARGETS = {
  dirty: 'machine',
  washing: 'machine',
  ironing: 'ironing',
  ready: 'deliver',
}

export default function KioskHome({ kioskApi, onNavigate }) {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  async function load() {
    setLoading(true)
    setError('')
    try {
      const response = await kioskApi.get('/self-service/laundry-kiosk/overview')
      setData(response.data)
    } catch (requestError) {
      setError(requestError.response?.data?.error || 'Günlük özet yüklenemedi')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const summary = data?.summary || {}
  const jobs = data?.next_jobs || []

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <section style={{
        padding: 18,
        borderRadius: 18,
        background: 'linear-gradient(135deg, #172554 0%, #0f172a 60%, #164e63 130%)',
        border: '1px solid #1e3a5f',
      }}>
        <div style={{ fontSize: 12, color: '#93c5fd', fontWeight: 800, letterSpacing: 1 }}>
          BUGÜNÜN OPERASYONU
        </div>
        <h1 style={{ color: '#f8fafc', fontSize: 22, margin: '6px 0 4px' }}>
          Sıradaki işi tek dokunuşla başlat
        </h1>
        <p style={{ color: '#94a3b8', fontSize: 13, margin: 0 }}>
          Giriş, makine, ütü ve teslim sırası aynı ekranda güncel kalır.
        </p>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 10, marginTop: 16 }}>
          <button type="button" onClick={() => onNavigate('entry')}
            style={actionButton('#2563eb')}>
            <span style={{ fontSize: 22 }}>＋</span>
            <span>Hızlı Giriş</span>
          </button>
          <button type="button" onClick={() => onNavigate('ironing')}
            style={actionButton('#7e22ce')}>
            <span style={{ fontSize: 22 }}>✓</span>
            <span>Ütü Listesi</span>
          </button>
        </div>
      </section>

      {error && (
        <button type="button" onClick={load} style={{
          minHeight: 48,
          borderRadius: 12,
          border: '1px solid #7f1d1d',
          background: '#2b1117',
          color: '#fecaca',
          fontWeight: 700,
        }}>
          {error} · Tekrar Dene
        </button>
      )}

      <section>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
          <h2 style={sectionTitle}>Anlık Durum</h2>
          <button type="button" onClick={load} disabled={loading} style={refreshButton}>
            {loading ? '…' : '↻ Yenile'}
          </button>
        </div>
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))',
          gap: 9,
        }}>
          {STAT_META.map(([key, label, icon, color]) => (
            <div key={key} style={{
              minHeight: 88,
              borderRadius: 14,
              padding: 12,
              background: '#0f172a',
              border: `1px solid ${key === 'sla_breaches' && summary[key] ? '#7f1d1d' : '#1e293b'}`,
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: 20 }}>{icon}</span>
                {key === 'urgent' && summary[key] > 0 && <span>!</span>}
              </div>
              <div style={{ color, fontSize: 24, fontWeight: 900, marginTop: 4 }}>
                {loading ? '—' : summary[key] || 0}
              </div>
              <div style={{ color: '#94a3b8', fontSize: 11, fontWeight: 700 }}>{label}</div>
            </div>
          ))}
        </div>
      </section>

      <section>
        <h2 style={{ ...sectionTitle, marginBottom: 10 }}>Önerilen Sıradaki İşler</h2>
        {!loading && jobs.length === 0 && (
          <div style={emptyCard}>🎉 Aktif iş yok. Operasyon güncel.</div>
        )}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {jobs.map(job => (
            <button key={job.id} type="button"
              onClick={() => onNavigate(STATUS_TARGETS[job.status] || 'status', job)}
              style={{
                minHeight: 68,
                width: '100%',
                border: '1px solid #263449',
                borderLeft: `4px solid ${job.urgent ? '#ef4444' : '#3b82f6'}`,
                borderRadius: 13,
                background: '#0f172a',
                padding: '10px 12px',
                display: 'flex',
                alignItems: 'center',
                gap: 12,
                textAlign: 'left',
                cursor: 'pointer',
              }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ color: '#e2e8f0', fontWeight: 800, fontSize: 14 }}>
                  {job.block}-{job.room_no}
                  <span style={{ color: '#38bdf8', fontFamily: 'monospace', marginLeft: 8 }}>
                    {job.bag_no || `#${job.id}`}
                  </span>
                </div>
                <div style={{ color: '#64748b', fontSize: 12, marginTop: 3 }}>
                  {job.item_count} parça
                  {job.machine_name ? ` · ${job.machine_name}` : ''}
                  {job.shelf_location ? ` · Raf ${job.shelf_location}` : ''}
                </div>
              </div>
              <div style={{ color: '#93c5fd', fontSize: 12, fontWeight: 800, whiteSpace: 'nowrap' }}>
                {STATUS_LABELS[job.status] || 'Aç'} →
              </div>
            </button>
          ))}
        </div>
      </section>
    </div>
  )
}

const sectionTitle = {
  color: '#cbd5e1',
  fontSize: 14,
  fontWeight: 900,
  letterSpacing: 0.3,
  margin: 0,
}

const refreshButton = {
  minHeight: 40,
  padding: '0 13px',
  border: '1px solid #334155',
  borderRadius: 10,
  background: '#1e293b',
  color: '#cbd5e1',
  fontWeight: 700,
  cursor: 'pointer',
}

const emptyCard = {
  borderRadius: 14,
  padding: 18,
  border: '1px dashed #334155',
  background: '#0f172a',
  color: '#64748b',
  fontSize: 13,
  textAlign: 'center',
}

function actionButton(background) {
  return {
    minHeight: 54,
    border: 0,
    borderRadius: 13,
    background,
    color: '#fff',
    fontWeight: 900,
    fontSize: 14,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    cursor: 'pointer',
  }
}
