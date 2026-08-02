import { useEffect, useMemo, useState } from 'react'
import { BLOCKS } from '../../shared/blocks.js'
import { confirmDialog } from '../../shared/components/ConfirmDialog.jsx'
import { useToastStore } from '../../shared/store/toastStore.js'

const STATUS_META = {
  pending_collection: { label: 'Toplanacak', icon: '↙', tone: 'amber' },
  dirty: { label: 'Yıkama bekliyor', icon: '◌', tone: 'slate' },
  washing: { label: 'Yıkanıyor', icon: '≈', tone: 'blue' },
  ironing: { label: 'Ütüde', icon: '♨', tone: 'violet' },
  ready: { label: 'Teslime hazır', icon: '✓', tone: 'green' },
  delivered: { label: 'Teslim edildi', icon: '✓', tone: 'teal' },
  lost: { label: 'Kayıp', icon: '!', tone: 'red' },
}

const FILTERS = [
  ['all', 'Tümü'],
  ['active', 'Aktif'],
  ['dirty', 'Yıkama bekleyen'],
  ['washing', 'Yıkanan'],
  ['ironing', 'Ütü'],
  ['ready', 'Teslim bekleyen'],
  ['delivered', 'Teslim edilen'],
  ['lost', 'Kayıp'],
  ['sorting', 'File ayırma'],
]

function formatDateTime(value) {
  if (!value) return '—'
  return new Date(`${value}${value.includes('T') ? '' : 'Z'}`).toLocaleString('tr-TR', {
    day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
  })
}

function TimelineStep({ label, value, detail, done }) {
  return (
    <div className={`records-timeline-step ${done ? 'is-done' : ''}`}>
      <span className="records-timeline-dot">{done ? '✓' : '·'}</span>
      <span><strong>{label}</strong><small>{value ? formatDateTime(value) : 'Henüz yok'}</small>{detail && <em>{detail}</em>}</span>
    </div>
  )
}

export default function DashboardView({ kioskApi, onAction }) {
  const [bags, setBags] = useState([])
  const [summary, setSummary] = useState(null)
  const [loading, setLoading] = useState(false)
  const [filterBlock, setFilterBlock] = useState('all')
  const [filterStatus, setFilterStatus] = useState('all')
  const [query, setQuery] = useState('')
  const [expandedId, setExpandedId] = useState(null)

  async function load() {
    setLoading(true)
    try {
      const blockQuery = filterBlock === 'all' ? '' : `&block=${encodeURIComponent(filterBlock)}`
      const [records, today] = await Promise.all([
        kioskApi.get(`/self-service/laundry-kiosk/bags?scope=all${blockQuery}`),
        kioskApi.get('/self-service/laundry-kiosk/today-summary').catch(() => null),
      ])
      setBags(records.data)
      if (today) setSummary(today.data)
    } catch (error) {
      setBags([])
      useToastStore.getState().addToast(error.response?.data?.error || 'Kayıtlar yüklenemedi', 'error')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [filterBlock]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    const timer = window.setInterval(load, 30_000)
    return () => window.clearInterval(timer)
  }, [filterBlock]) // eslint-disable-line react-hooks/exhaustive-deps

  const visibleBags = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase('tr-TR')
    return bags.filter(bag => {
      const statusMatch = filterStatus === 'all'
        || (filterStatus === 'active' && !['delivered', 'lost'].includes(bag.status))
        || (filterStatus === 'lost' && (bag.status === 'lost' || Number(bag.garment_missing) > 0))
        || (filterStatus === 'sorting' && Number(bag.burst_open_incidents) > 0)
        || bag.status === filterStatus
      if (!statusMatch) return false
      if (!normalized) return true
      return [
        bag.bag_no, bag.block, bag.room_no, bag.intake_name, bag.delivered_to,
        bag.delivered_name, bag.garment_names, bag.latest_garment_lost_name,
        bag.latest_garment_lost_note, bag.lost_notes,
      ]
        .filter(Boolean)
        .join(' ')
        .toLocaleLowerCase('tr-TR')
        .includes(normalized)
    })
  }, [bags, filterStatus, query])

  const totals = useMemo(() => ({
    all: bags.length,
    active: bags.filter(bag => !['delivered', 'lost'].includes(bag.status)).length,
    ready: bags.filter(bag => bag.status === 'ready').length,
    delivered: bags.filter(bag => bag.status === 'delivered').length,
    lost: bags.reduce((total, bag) => total + (bag.status === 'lost' ? 1 : 0) + Number(bag.garment_missing || 0), 0),
    sorting: bags.reduce((total, bag) => total + Number(bag.burst_waiting_pieces || 0), 0),
  }), [bags])

  async function runConfirmed(bag, config) {
    const approved = await confirmDialog({ title: config.title, body: config.body })
    if (!approved) return
    try {
      await kioskApi.post(`/self-service/laundry-kiosk/bags/${bag.id}/${config.endpoint}`, {})
      useToastStore.getState().addToast(config.success, 'success')
      load()
    } catch (error) {
      useToastStore.getState().addToast(error.response?.data?.error || 'İşlem tamamlanamadı', 'error')
    }
  }

  function actionButton(bag) {
    if (bag.status === 'pending_collection') return <button onClick={() => runConfirmed(bag, { endpoint: 'collect', title: 'Torbayı teslim al', body: `${bag.bag_no} çamaşırhaneye alındı olarak işaretlenecek.`, success: 'Torba teslim alındı' })}>Teslim al</button>
    if (bag.status === 'dirty') return (
      <div className="records-actions">
        <button onClick={() => runConfirmed(bag, { endpoint: 'start-wash', title: 'Yıkamayı başlat', body: `${bag.bag_no} yıkamaya alınacak ve başlangıç saati kaydedilecek.`, success: 'Yıkama başlatıldı' })}>Yıkamaya al</button>
        {(Date.now() - new Date(bag.created_at).getTime()) / 60000 <= 15 && (
          <button className="is-danger" onClick={() => runConfirmed(bag, { endpoint: 'void', title: 'Hatalı girişi sil', body: `${bag.bag_no} kaydı tamamen silinecek.`, success: 'Hatalı giriş silindi' })}>İptal</button>
        )}
      </div>
    )
    if (bag.status === 'washing') return <button onClick={() => runConfirmed(bag, { endpoint: 'wash-complete', title: 'Yıkama tamamlandı', body: `${bag.bag_no} yıkandı olarak kaydedilecek.`, success: 'Yıkama tamamlandı' })}>Yıkandı</button>
    if (bag.status === 'ironing') return <button onClick={() => onAction('iron', bag)}>Ütüyü aç</button>
    if (bag.status === 'ready') return <button onClick={() => onAction('deliver', bag)}>Teslim et</button>
    if (bag.status === 'lost') return <button onClick={() => runConfirmed(bag, { endpoint: 'found', title: 'Torba bulundu', body: `${bag.bag_no} yeniden teslime hazır yapılacak.`, success: 'Torba yeniden hazır' })}>Bulundu</button>
    return null
  }

  return (
    <section className="records-page">
      <header className="records-header">
        <div><span className="kiosk-eyebrow">UÇTAN UCA TAKİP</span><h1>Tüm çamaşır kayıtları</h1><p>Girişten teslimata kadar kişi, durum ve tarih/saat bilgileri.</p></div>
        <button className="records-refresh" type="button" onClick={load} disabled={loading}>{loading ? 'Yükleniyor…' : '↻ Yenile'}</button>
      </header>

      <div className="records-summary">
        <div><span>Bugün giriş</span><strong>{summary?.intake_today ?? '—'}</strong></div>
        <div><span>Aktif işlem</span><strong>{totals.active}</strong></div>
        <div><span>Teslim bekleyen</span><strong>{totals.ready}</strong></div>
        <div><span>Bugün teslim</span><strong>{summary?.delivered_today ?? '—'}</strong></div>
        <div className="is-loss"><span>Açık kayıp</span><strong>{totals.lost}</strong></div>
        <div className="is-burst"><span>Fileden ayrılan</span><strong>{totals.sorting}</strong></div>
      </div>

      <div className="records-toolbar">
        <label className="records-search"><span>⌕</span><input value={query} onChange={event => setQuery(event.target.value)} placeholder="Torba no, blok, oda, kişi veya kıyafet ara…" /></label>
        <select value={filterBlock} onChange={event => setFilterBlock(event.target.value)} aria-label="Blok filtresi">
          <option value="all">Tüm bloklar</option>
          {BLOCKS.map(block => <option key={block.block} value={block.block}>{block.block} Blok</option>)}
        </select>
      </div>

      <div className="records-filters" role="group" aria-label="Durum filtresi">
        {FILTERS.map(([key, label]) => (
          <button key={key} type="button" className={filterStatus === key ? 'is-active' : ''} onClick={() => setFilterStatus(key)}>
            {label}{['all', 'active', 'ready', 'delivered', 'lost', 'sorting'].includes(key) && <span>{totals[key]}</span>}
          </button>
        ))}
      </div>

      <div className="records-result-heading"><strong>{visibleBags.length} kayıt</strong><small>En son hareket üstte</small></div>

      {!loading && visibleBags.length === 0 && <div className="records-empty">Arama ve filtrelere uygun kayıt bulunamadı.</div>}

      <div className="records-list">
        {visibleBags.map(bag => {
          const meta = STATUS_META[bag.status] || STATUS_META.dirty
          const hasGarmentLoss = Number(bag.garment_missing) > 0
          const hasBurstPieces = Number(bag.burst_waiting_pieces) > 0
          const expanded = expandedId === bag.id
          return (
            <article key={bag.id} className={`records-card tone-${meta.tone}${hasGarmentLoss ? ' has-loss' : ''}${hasBurstPieces ? ' has-burst' : ''}`}>
              <div className="records-card-main">
                <button className="records-card-toggle" type="button" onClick={() => setExpandedId(expanded ? null : bag.id)} aria-expanded={expanded}>
                  <span className="records-status-icon">{meta.icon}</span>
                  <span className="records-identity"><code>{bag.bag_no || `#${bag.id}`}</code><strong>{bag.block}-{bag.room_no}</strong><small>{bag.item_count} parça{bag.intake_name ? ` · ${bag.intake_name}` : ''}</small>{hasGarmentLoss && <em className="records-loss-pill">! {bag.garment_missing} kayıp kıyafet</em>}{hasBurstPieces && <em className="records-burst-pill">≋ {bag.burst_waiting_pieces} fileden ayrılan</em>}</span>
                  <span className="records-status"><strong>{meta.label}</strong><small>Son işlem {formatDateTime(bag.updated_at)}</small></span>
                  {bag.status === 'delivered' && <span className="records-recipient"><small>Teslim alan</small><strong>{bag.delivered_to || bag.delivered_name || 'Belirtilmedi'}</strong></span>}
                  <span className="records-chevron">{expanded ? '⌃' : '⌄'}</span>
                </button>
                <div className="records-primary-action">{actionButton(bag)}</div>
              </div>

              {expanded && (
                <div className="records-detail">
                  <div className="records-timeline">
                    <TimelineStep label="Giriş yapıldı" value={bag.created_at} detail={bag.intake_name ? `Teslim eden: ${bag.intake_name}` : null} done />
                    <TimelineStep label="Yıkamaya alındı" value={bag.wash_started_at} done={Boolean(bag.wash_started_at)} />
                    <TimelineStep label="Yıkandı" value={bag.washed_at} detail={bag.washed_by ? `İşlemi yapan: ${bag.washed_by}` : null} done={Boolean(bag.washed_at)} />
                    {Boolean(bag.needs_ironing || bag.ironed_at) && <TimelineStep label="Ütülendi" value={bag.ironed_at} detail={bag.ironed_by ? `İşlemi yapan: ${bag.ironed_by}` : null} done={Boolean(bag.ironed_at)} />}
                    {bag.lost_at && <TimelineStep label="Torba kayıp bildirildi" value={bag.lost_at} detail={`${bag.lost_by ? `Bildiren: ${bag.lost_by}` : 'Bildiren bilinmiyor'}${bag.lost_notes ? ` · ${bag.lost_notes}` : ''}`} done />}
                    {bag.latest_garment_lost_at && <TimelineStep label="Kıyafet kayıp bildirildi" value={bag.latest_garment_lost_at} detail={`${bag.latest_garment_lost_name || 'Kıyafet'}${bag.latest_garment_lost_by ? ` · Bildiren: ${bag.latest_garment_lost_by}` : ''}`} done />}
                    <TimelineStep label="Teslim edildi" value={bag.delivered_at} detail={bag.delivered_at ? `${bag.delivered_to || bag.delivered_name || 'Teslim alan belirtilmedi'}${bag.delivered_by ? ` · Veren: ${bag.delivered_by}` : ''}` : null} done={Boolean(bag.delivered_at)} />
                  </div>
                  <div className="records-facts">
                    <div><span>Giriş imzası</span><strong>{bag.has_intake_signature ? '✓ Alındı' : '— Yok'}</strong></div>
                    <div><span>Teslim imzası</span><strong>{bag.has_delivery_signature ? '✓ Alındı' : bag.delivered_at ? '— Yok' : 'Bekleniyor'}</strong></div>
                    <div><span>Takip türü</span><strong>{bag.tracking_mode === 'individual' ? 'Parça bazlı' : 'Torba bazlı'}</strong></div>
                    {bag.garment_names && <div className="is-wide"><span>Kıyafetler</span><strong>{bag.garment_names.split(',').join(', ')}</strong></div>}
                    {bag.lost_at && (
                      <div className="is-wide is-loss"><span>Kayıp torba kaydı</span>
                        <strong>{formatDateTime(bag.lost_at)} · {bag.lost_by || 'Bildiren bilinmiyor'}</strong>
                        {bag.lost_notes && <small>{bag.lost_notes}</small>}
                      </div>
                    )}
                    {bag.garment_missing > 0 && (
                      <div className="is-wide is-loss"><span>Kayıp kıyafet ({bag.garment_missing})</span>
                        <strong>{bag.latest_garment_lost_name || 'Kıyafet'} · {formatDateTime(bag.latest_garment_lost_at)}</strong>
                        <small>{bag.latest_garment_lost_by ? `Bildiren: ${bag.latest_garment_lost_by}` : 'Bildiren bilinmiyor'}{bag.latest_garment_lost_note ? ` · ${bag.latest_garment_lost_note}` : ''}</small>
                      </div>
                    )}
                    {bag.notes && <div className="is-wide"><span>Not</span><strong>{bag.notes}</strong></div>}
                  </div>
                </div>
              )}
            </article>
          )
        })}
      </div>
    </section>
  )
}
