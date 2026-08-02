import { useEffect, useMemo, useState } from 'react'

const FLOW_STAGES = [
  { key: 'dirty', label: 'Yıkama bekliyor', shortLabel: 'Bekliyor', icon: '🫧', target: 'status', tone: 'amber', help: 'Yıkamaya al' },
  { key: 'washing', label: 'Yıkanıyor', shortLabel: 'Yıkamada', icon: '≈', target: 'status', tone: 'blue', help: 'Yıkandı olarak işaretle' },
  { key: 'ironing', label: 'Ütü bekliyor', shortLabel: 'Ütüde', icon: '♨', target: 'ironing', tone: 'violet', help: 'Parça kontrolü yap' },
  { key: 'ready', label: 'Teslime hazır', shortLabel: 'Hazır', icon: '▣', target: 'deliver', tone: 'green', help: 'Teslimatı tamamla' },
]

const QUICK_ACTIONS = [
  { target: 'entry', icon: '＋', label: 'Torba Girişi', help: 'Yeni kayıt oluştur', tone: 'blue' },
  { target: 'status', icon: '≈', label: 'Yıkama Takibi', help: 'Başlat / yıkandı işaretle', tone: 'cyan' },
  { target: 'ironing', icon: '♨', label: 'Ütü Kontrolü', help: 'Parçaları doğrula', tone: 'violet' },
  { target: 'deliver', icon: '▣', label: 'Teslimat', help: 'Hazır torbaları ver', tone: 'green' },
  { target: 'loss', icon: '!', label: 'Kayıp Merkezi', help: 'Kayıpları araştır / kapat', tone: 'red' },
  { target: 'sorting', icon: '≋', label: 'Ayırma Merkezi', help: 'Patlayan file / sahip seçimi', tone: 'orange' },
]

const STATUS_LABELS = {
  dirty: 'Yıkamaya al',
  washing: 'Yıkamayı tamamla',
  ironing: 'Ütüyü tamamla',
  ready: 'Teslim et',
}

const STATUS_TARGETS = {
  dirty: 'status',
  washing: 'status',
  ironing: 'ironing',
  ready: 'deliver',
}

const FILTERS = [
  { key: 'all', label: 'Tümü' },
  { key: 'urgent', label: 'Acil' },
  { key: 'dirty', label: 'Yıkama' },
  { key: 'ironing', label: 'Ütü' },
  { key: 'ready', label: 'Teslim' },
]

function greeting() {
  const hour = new Date().getHours()
  if (hour < 12) return 'Günaydın'
  if (hour < 18) return 'İyi çalışmalar'
  return 'İyi akşamlar'
}

function firstName(fullName = '') {
  return fullName.trim().split(' ')[0] || 'ekip'
}

function formatLossTime(value) {
  if (!value) return 'Saat bilinmiyor'
  const normalized = value.includes('T') ? value : value.replace(' ', 'T')
  const date = new Date(`${normalized}${/[zZ]|[+-]\d\d:\d\d$/.test(normalized) ? '' : 'Z'}`)
  if (Number.isNaN(date.getTime())) return 'Saat bilinmiyor'
  return date.toLocaleString('tr-TR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })
}

export default function KioskHome({ kioskApi, onNavigate, workerName }) {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [activeFilter, setActiveFilter] = useState('all')
  const [updatedAt, setUpdatedAt] = useState(null)

  async function load(showLoader = true) {
    if (showLoader) setLoading(true)
    setError('')
    try {
      const response = await kioskApi.get('/self-service/laundry-kiosk/overview')
      setData(response.data)
      setUpdatedAt(new Date())
    } catch (requestError) {
      setError(requestError.response?.data?.error || 'Günlük özet yüklenemedi')
    } finally {
      if (showLoader) setLoading(false)
    }
  }

  useEffect(() => {
    load()
    const refreshTimer = window.setInterval(() => load(false), 60_000)
    return () => window.clearInterval(refreshTimer)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const summary = data?.summary || {}
  const jobs = data?.next_jobs || []
  const activeTotal = FLOW_STAGES.reduce((total, stage) => total + (summary[stage.key] || 0), 0)
  const firstJob = jobs[0]
  const recentLosses = data?.recent_losses || []
  const recentBursts = data?.recent_bursts || []
  const filteredJobs = useMemo(() => {
    if (activeFilter === 'all') return jobs
    if (activeFilter === 'urgent') return jobs.filter(job => job.urgent)
    return jobs.filter(job => job.status === activeFilter)
  }, [activeFilter, jobs])

  const openJob = job => onNavigate(STATUS_TARGETS[job.status] || 'status', job)

  return (
    <div className="kiosk-home">
      <section className="kiosk-home-heading">
        <div>
          <span className="kiosk-eyebrow">GÜNLÜK OPERASYON</span>
          <h1>{greeting()}, {firstName(workerName)}.</h1>
          <p>{new Date().toLocaleDateString('tr-TR', { weekday: 'long', day: 'numeric', month: 'long' })} · İş sırası otomatik olarak önceliklendiriliyor.</p>
        </div>
        <button type="button" className="kiosk-refresh" onClick={() => load(false)} disabled={loading}>
          <span className={loading ? 'is-spinning' : ''}>↻</span>
          <span><strong>Yenile</strong><small>{updatedAt ? `Son güncelleme ${updatedAt.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })}` : 'Veriler alınıyor'}</small></span>
        </button>
      </section>

      {error && (
        <button type="button" className="kiosk-error-banner" onClick={() => load()}>
          <span>⚠</span><span><strong>{error}</strong><small>Tekrar denemek için dokunun.</small></span><span>↻</span>
        </button>
      )}

      {(summary.sla_breaches > 0 || summary.urgent > 0) && (
        <button type="button" className="kiosk-alert-banner" onClick={() => setActiveFilter(summary.urgent > 0 ? 'urgent' : 'all')}>
          <span className="kiosk-alert-icon">!</span>
          <span>
            <strong>Öncelikli işlem gerekiyor</strong>
            <small>{summary.sla_breaches || 0} geciken kayıt · {summary.urgent || 0} acil torba</small>
          </span>
          <span>Kuyruğu göster →</span>
        </button>
      )}

      {summary.lost_open > 0 && (
        <button type="button" className="kiosk-loss-alert" onClick={() => onNavigate('loss')}>
          <span className="kiosk-loss-alert-icon">!</span>
          <span><strong>{summary.lost_open} açık kayıp araştırması</strong><small>{summary.lost_bags || 0} torba · {summary.lost_garments || 0} kıyafet bulunmayı bekliyor</small></span>
          <span>Kayıp Merkezini aç →</span>
        </button>
      )}

      {summary.burst_open > 0 && (
        <button type="button" className="kiosk-burst-alert" onClick={() => onNavigate('sorting')}>
          <span className="kiosk-burst-alert-icon">≋</span>
          <span><strong>{summary.burst_open} patlayan file ayırma alanında</strong><small>{summary.burst_waiting_pieces || 0} kıyafet sahibini bekliyor</small></span>
          <span>Ayırma Merkezini aç →</span>
        </button>
      )}

      <section className="kiosk-hero-grid">
        <div className="kiosk-next-task">
          <div className="kiosk-next-task-top">
            <span className="kiosk-eyebrow">ŞİMDİ YAPILACAK İŞ</span>
            {Boolean(firstJob?.urgent) && <span className="kiosk-urgent-pill">⚡ ACİL</span>}
          </div>
          {loading ? (
            <div className="kiosk-task-skeleton"><span /><span /><span /></div>
          ) : firstJob ? (
            <>
              <div className="kiosk-next-task-room">
                <span>{firstJob.block}-{firstJob.room_no}</span>
                <strong>{firstJob.bag_no || `#${firstJob.id}`}</strong>
              </div>
              <p>
                <strong>{firstJob.item_count} parça</strong>
              </p>
              <button type="button" onClick={() => openJob(firstJob)}>
                {STATUS_LABELS[firstJob.status] || 'Kaydı aç'} <span>→</span>
              </button>
            </>
          ) : (
            <div className="kiosk-all-clear">
              <span>✓</span><strong>Bekleyen iş yok</strong><small>Operasyon güncel görünüyor.</small>
            </div>
          )}
        </div>

        <div className="kiosk-daily-score">
          <div className="kiosk-daily-score-header">
            <div><span className="kiosk-eyebrow">BUGÜN</span><h2>Günlük hareket</h2></div>
            <span className="kiosk-active-total">{activeTotal} aktif</span>
          </div>
          <div className="kiosk-daily-metrics">
            <div><span>↓</span><strong>{loading ? '—' : summary.intake_today || 0}</strong><small>Torba girişi</small></div>
            <div><span>✓</span><strong>{loading ? '—' : summary.delivered_today || 0}</strong><small>Teslim edildi</small></div>
          </div>
          <div className="kiosk-daily-footnote">
            <span className={summary.sla_breaches > 0 ? 'is-warning' : 'is-good'} />
            {summary.sla_breaches > 0 ? `${summary.sla_breaches} kayıt hedef süreyi aştı` : 'Tüm işler hedef sürede'}
          </div>
        </div>
      </section>

      <section className="kiosk-section kiosk-home-losses">
        <div className="kiosk-section-heading">
          <div><span className="kiosk-eyebrow">KAYIP TAKİBİ</span><h2>Açık kayıp kayıtları <b>{summary.lost_open || 0}</b></h2></div>
          <button type="button" onClick={() => onNavigate('loss')}>Tümünü ve geçmişi gör →</button>
        </div>
        {recentLosses.length === 0 ? (
          <div className="kiosk-loss-clear"><span>✓</span><strong>Açık kayıp kaydı yok</strong><small>Torba ve kıyafetlerin tamamı izleniyor.</small></div>
        ) : (
          <div className="kiosk-home-loss-list">
            {recentLosses.map(loss => (
              <button key={`${loss.kind}-${loss.incident_id}`} type="button" onClick={() => onNavigate('loss')}>
                <span className="kiosk-home-loss-type">{loss.kind === 'bag' ? 'TORBA' : 'KIYAFET'}</span>
                <span><strong>{loss.block}-{loss.room_no} · {loss.bag_no}</strong><small>{loss.kind === 'garment' ? `${loss.garment_type} · ${loss.garment_code}` : `${loss.item_count} parçalık torba`} · {loss.reported_by || 'Bildiren bilinmiyor'}</small></span>
                <span><strong>{loss.note || 'Açıklama yok'}</strong><small>{formatLossTime(loss.reported_at)}</small></span>
                <span>›</span>
              </button>
            ))}
          </div>
        )}
      </section>

      <section className="kiosk-section kiosk-home-bursts">
        <div className="kiosk-section-heading">
          <div><span className="kiosk-eyebrow">PATLAYAN FİLELER</span><h2>Ayırma ve sahip seçimi <b>{summary.burst_waiting_pieces || 0}</b></h2></div>
          <button type="button" onClick={() => onNavigate('sorting')}>Ayırma Merkezini aç →</button>
        </div>
        {recentBursts.length === 0 ? (
          <div className="kiosk-burst-clear"><span>✓</span><strong>Ayırma alanında bekleyen file yok</strong><small>Patlayan file olduğunda kıyafetleri buradan sahipleriyle eşleştirin.</small></div>
        ) : (
          <div className="kiosk-home-burst-list">
            {recentBursts.map(incident => (
              <button key={incident.id} type="button" onClick={() => onNavigate('sorting')}>
                <span className="kiosk-home-burst-code">FILE-{String(incident.id).padStart(3, '0')}</span>
                <span><strong>{incident.source_person_name || 'Kişi adı eski kayıtta yok'}</strong><small>{incident.source_block ? `${incident.source_block}-${incident.source_room_no}` : 'Oda bilinmiyor'} · File {incident.source_file_no || '—'} · {incident.found_location}</small></span>
                <span><strong>{incident.piece_waiting || 0} parça bekliyor</strong><small>{incident.status === 'ready_for_selection' ? 'Sahip seçimine açık' : 'Kıyafetler tanımlanıyor'}</small></span>
                <span>›</span>
              </button>
            ))}
          </div>
        )}
      </section>

      <section className="kiosk-section">
        <div className="kiosk-section-heading">
          <div><span className="kiosk-eyebrow">HIZLI ERİŞİM</span><h2>Ne yapmak istiyorsunuz?</h2></div>
          <small>En sık kullanılan işlemler</small>
        </div>
        <div className="kiosk-quick-actions">
          {QUICK_ACTIONS.map(action => (
            <button key={action.target} type="button" className={`tone-${action.tone}`} onClick={() => onNavigate(action.target)}>
              <span className="kiosk-action-icon">{action.icon}</span>
              <span><strong>{action.label}</strong><small>{action.help}</small></span>
              <span>›</span>
            </button>
          ))}
        </div>
      </section>

      <section className="kiosk-section">
        <div className="kiosk-section-heading">
          <div><span className="kiosk-eyebrow">CANLI AKIŞ</span><h2>Operasyon durumu</h2></div>
          <small>Bir aşamaya dokunarak çalışma listesini açın</small>
        </div>
        <div className="kiosk-flow-cards">
          {FLOW_STAGES.map((stage, index) => (
            <button key={stage.key} type="button" className={`tone-${stage.tone}`} onClick={() => onNavigate(stage.target)}>
              <span className="kiosk-flow-step">{String(index + 1).padStart(2, '0')}</span>
              <span className="kiosk-flow-icon">{stage.icon}</span>
              <strong>{loading ? '—' : summary[stage.key] || 0}</strong>
              <span>{stage.label}</span>
              <small>{stage.help} →</small>
            </button>
          ))}
        </div>
      </section>

      <section className="kiosk-section kiosk-queue-section">
        <div className="kiosk-section-heading kiosk-queue-heading">
          <div><span className="kiosk-eyebrow">AKILLI İŞ SIRASI</span><h2>Bekleyen görevler <b>{jobs.length}</b></h2></div>
          <div className="kiosk-job-filters" role="group" aria-label="Görev filtresi">
            {FILTERS.map(filter => (
              <button
                key={filter.key}
                type="button"
                className={activeFilter === filter.key ? 'is-active' : ''}
                onClick={() => setActiveFilter(filter.key)}
                aria-pressed={activeFilter === filter.key}
              >
                {filter.label}
                {filter.key === 'urgent' && summary.urgent > 0 && <span>{summary.urgent}</span>}
              </button>
            ))}
          </div>
        </div>

        {!loading && filteredJobs.length === 0 && (
          <div className="kiosk-empty-queue"><span>✓</span><strong>Bu grupta bekleyen iş yok.</strong><small>Başka bir filtre seçebilir veya yeni torba girişi yapabilirsiniz.</small></div>
        )}

        <div className="kiosk-job-list">
          {filteredJobs.map((job, index) => (
            <button key={job.id} type="button" className={job.urgent ? 'is-urgent' : ''} onClick={() => openJob(job)}>
              <span className="kiosk-job-order">{String(index + 1).padStart(2, '0')}</span>
              <span className={`kiosk-job-stage tone-${FLOW_STAGES.find(stage => stage.key === job.status)?.tone || 'blue'}`}>
                {FLOW_STAGES.find(stage => stage.key === job.status)?.icon || '•'}
              </span>
              <span className="kiosk-job-main">
                <span><strong>{job.block}-{job.room_no}</strong><code>{job.bag_no || `#${job.id}`}</code>{Boolean(job.urgent) && <em>ACİL</em>}</span>
                <small>{job.item_count} parça · {job.intake_name || 'Teslim eden belirtilmedi'}</small>
              </span>
              <span className="kiosk-job-action"><small>{FLOW_STAGES.find(stage => stage.key === job.status)?.shortLabel}</small><strong>{STATUS_LABELS[job.status] || 'Aç'} →</strong></span>
            </button>
          ))}
        </div>
      </section>
    </div>
  )
}
