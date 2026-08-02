import { useEffect, useMemo, useState } from 'react'
import { confirmDialog } from '../../shared/components/ConfirmDialog.jsx'
import { useToastStore } from '../../shared/store/toastStore.js'

const STAGE_LABELS = {
  pending_collection: 'Teslim alma', dirty: 'Yıkama bekleme', washing: 'Yıkama',
  ironing: 'Ütü kontrolü', ready: 'Teslim hazırlığı', delivery: 'Teslim kontrolü',
  intake: 'Giriş kontrolü', delivered: 'Teslim sonrası',
}

function asDate(value) {
  if (!value) return null
  const normalized = value.includes('T') ? value : value.replace(' ', 'T')
  const date = new Date(`${normalized}${/[zZ]|[+-]\d\d:\d\d$/.test(normalized) ? '' : 'Z'}`)
  return Number.isNaN(date.getTime()) ? null : date
}

function formatDateTime(value) {
  const date = asDate(value)
  return date ? date.toLocaleString('tr-TR', {
    day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
  }) : '—'
}

function durationSince(value, endValue) {
  const start = asDate(value)
  const end = asDate(endValue) || new Date()
  if (!start) return 'Süre bilinmiyor'
  const minutes = Math.max(0, Math.floor((end.getTime() - start.getTime()) / 60_000))
  if (minutes < 60) return `${minutes} dk`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours} sa ${minutes % 60} dk`
  return `${Math.floor(hours / 24)} gün ${hours % 24} sa`
}

export default function LossCenterView({ kioskApi }) {
  const [data, setData] = useState({ summary: {}, incidents: [] })
  const [loading, setLoading] = useState(true)
  const [scope, setScope] = useState('open')
  const [kind, setKind] = useState('all')
  const [query, setQuery] = useState('')
  const [busyId, setBusyId] = useState(null)

  async function load(showLoader = true) {
    if (showLoader) setLoading(true)
    try {
      const response = await kioskApi.get('/self-service/laundry-kiosk/losses?scope=all')
      setData(response.data)
    } catch (error) {
      useToastStore.getState().addToast(error.response?.data?.error || 'Kayıp kayıtları yüklenemedi', 'error')
    } finally {
      if (showLoader) setLoading(false)
    }
  }

  useEffect(() => {
    load()
    const timer = window.setInterval(() => load(false), 30_000)
    return () => window.clearInterval(timer)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const visible = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase('tr-TR')
    return (data.incidents || []).filter(incident => {
      if (scope !== 'all' && incident.status !== scope) return false
      if (kind !== 'all' && incident.kind !== kind) return false
      if (!needle) return true
      return [incident.bag_no, incident.block, incident.room_no, incident.intake_name,
        incident.garment_code, incident.garment_type, incident.note, incident.reported_by]
        .filter(Boolean).join(' ').toLocaleLowerCase('tr-TR').includes(needle)
    })
  }, [data.incidents, kind, query, scope])

  async function markFound(incident) {
    const label = incident.kind === 'bag'
      ? `${incident.bag_no} numaralı torba`
      : `${incident.garment_type || 'Kıyafet'} · ${incident.garment_code}`
    const approved = await confirmDialog({
      title: 'Bulundu olarak kapat',
      body: `${label} bulundu ve yeniden teslime hazırlanacak. Kayıp olayının geçmiş kaydı korunacak.`,
    })
    if (!approved) return
    const key = `${incident.kind}-${incident.incident_id}`
    setBusyId(key)
    try {
      const endpoint = incident.kind === 'bag'
        ? `/self-service/laundry-kiosk/bags/${incident.item_id}/found`
        : `/self-service/laundry-kiosk/bags/${incident.item_id}/garments/${incident.garment_id}/found`
      await kioskApi.post(endpoint, {})
      useToastStore.getState().addToast(`${label} bulundu olarak kaydedildi`, 'success')
      await load(false)
    } catch (error) {
      useToastStore.getState().addToast(error.response?.data?.error || 'Kayıp kaydı kapatılamadı', 'error')
    } finally {
      setBusyId(null)
    }
  }

  const summary = data.summary || {}
  return (
    <section className="loss-center">
      <header className="loss-center-header">
        <div>
          <span className="kiosk-eyebrow">KAYIP ARAŞTIRMA VE ÇÖZÜM</span>
          <h1>Kayıp Merkezi</h1>
          <p>Torba ve kıyafet kayıplarını; oda, kişi, bildirim saati ve sorumlusuyla tek yerden takip edin.</p>
        </div>
        <button type="button" className="records-refresh" onClick={() => load(false)} disabled={loading}>
          {loading ? 'Yükleniyor…' : '↻ Yenile'}
        </button>
      </header>

      <div className="loss-summary-grid">
        <div className="is-critical"><span>Açık olay</span><strong>{summary.open_total || 0}</strong><small>Hâlâ bulunmayı bekliyor</small></div>
        <div><span>Kayıp torba</span><strong>{summary.lost_bags || 0}</strong><small>Torbanın tamamı bulunamadı</small></div>
        <div><span>Kayıp kıyafet</span><strong>{summary.lost_garments || 0}</strong><small>Torba içinden eksik parça</small></div>
        <div className="is-resolved"><span>Çözülen olay</span><strong>{summary.resolved_total || 0}</strong><small>Geçmiş kaydı korunuyor</small></div>
      </div>

      {summary.open_total > 0 && (
        <div className="loss-priority-strip">
          <span>!</span>
          <div><strong>{summary.open_total} açık kayıp araştırması var</strong><small>En eski açık kayıt: {formatDateTime(summary.oldest_open_at)} · {durationSince(summary.oldest_open_at)}</small></div>
          <em>VARDİYA ÖNCELİĞİ</em>
        </div>
      )}

      <div className="loss-toolbar">
        <label><span>⌕</span><input value={query} onChange={event => setQuery(event.target.value)} placeholder="Torba, oda, kişi, kıyafet veya not ara…" /></label>
        <div role="group" aria-label="Kayıp durumu">
          {[['open', 'Açık'], ['resolved', 'Bulundu'], ['all', 'Tümü']].map(([value, label]) => (
            <button key={value} type="button" className={scope === value ? 'is-active' : ''} onClick={() => setScope(value)}>{label}</button>
          ))}
        </div>
        <select value={kind} onChange={event => setKind(event.target.value)} aria-label="Kayıp türü">
          <option value="all">Torba ve kıyafet</option><option value="bag">Yalnız torba</option><option value="garment">Yalnız kıyafet</option>
        </select>
      </div>

      <div className="loss-result-line"><strong>{visible.length} olay</strong><small>Açık kayıtlar en üstte gösterilir</small></div>
      {!loading && visible.length === 0 && (
        <div className="loss-empty"><span>✓</span><strong>Bu filtrede kayıp kaydı yok.</strong><small>Arama kriterini veya durum filtresini değiştirebilirsiniz.</small></div>
      )}

      <div className="loss-list">
        {visible.map(incident => {
          const key = `${incident.kind}-${incident.incident_id}`
          const isOpen = incident.status === 'open'
          return (
            <article key={key} className={isOpen ? 'is-open' : 'is-resolved'}>
              <div className="loss-card-icon">{incident.kind === 'bag' ? '▰' : '👕'}</div>
              <div className="loss-card-main">
                <div className="loss-card-title">
                  <span className={`loss-kind loss-kind--${incident.kind}`}>{incident.kind === 'bag' ? 'KAYIP TORBA' : 'KAYIP KIYAFET'}</span>
                  <code>{incident.bag_no || `#${incident.item_id}`}</code>
                  <strong>{incident.block}-{incident.room_no}</strong>
                  <em className={isOpen ? 'is-open' : 'is-resolved'}>{isOpen ? 'ARAŞTIRILIYOR' : 'BULUNDU'}</em>
                </div>
                {incident.kind === 'garment' && <h2>{incident.garment_type || 'Kıyafet'} <small>{incident.garment_code}</small></h2>}
                <div className="loss-card-facts">
                  <div><span>Çamaşır girişi</span><strong>{formatDateTime(incident.intake_at)}</strong></div>
                  <div><span>Kayıp bildirimi</span><strong>{formatDateTime(incident.reported_at)}</strong></div>
                  <div><span>Bulunamayan aşama</span><strong>{STAGE_LABELS[incident.last_stage] || incident.last_stage || 'Bilinmiyor'}</strong></div>
                  <div><span>Geçen süre</span><strong>{durationSince(incident.reported_at, incident.resolved_at)}</strong></div>
                  <div><span>Çamaşırı veren</span><strong>{incident.intake_name || 'Belirtilmedi'}</strong></div>
                  <div><span>Bildiren personel</span><strong>{incident.reported_by || 'Bilinmiyor'}</strong></div>
                </div>
                <div className="loss-card-note"><span>ARAŞTIRMA NOTU</span><strong>{incident.note || 'Ek açıklama girilmedi.'}</strong></div>
                {!isOpen && <div className="loss-resolution">✓ {formatDateTime(incident.resolved_at)} tarihinde {incident.resolved_by || 'Sistem'} tarafından bulundu.</div>}
              </div>
              {isOpen && (
                <button type="button" className="loss-found-button" onClick={() => markFound(incident)} disabled={busyId === key}>
                  <span>✓</span><strong>{busyId === key ? 'Kaydediliyor…' : 'Bulundu'}</strong><small>Olayı kapat</small>
                </button>
              )}
            </article>
          )
        })}
      </div>
    </section>
  )
}
