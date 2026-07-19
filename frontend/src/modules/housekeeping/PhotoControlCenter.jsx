import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import api from '../../shared/api/client.js'
import { useAuthStore } from '../../shared/store/authStore.js'
import { PHOTO_CATEGORIES, PHOTO_CATEGORY_MAP } from './shared.jsx'
import TaskPhotoGallery from './TaskPhotoGallery.jsx'

const AREA_META = {
  room: { label: 'Oda', icon: '🛏', color: 'var(--blue)' },
  corridor: { label: 'Koridor', icon: '↔', color: 'var(--purple)' },
  toilet: { label: 'Tuvalet / WC', icon: '🚽', color: 'var(--accent)' },
  bathroom: { label: 'Banyo', icon: '🚿', color: 'var(--teal)' },
  stairs: { label: 'Merdiven', icon: '↗', color: 'var(--purple)' },
  common: { label: 'Ortak Alan', icon: '🏢', color: 'var(--text2)' },
}

function taskStatus(item) {
  if (item.skipped) return 'skipped'
  if (!item.completed_at) return 'pending'
  return item.photo_url ? 'with_photo' : 'without_photo'
}

function statusMeta(status) {
  return {
    with_photo: { label: 'Fotoğraflı', icon: '✓', color: 'var(--green)' },
    without_photo: { label: 'Fotoğraf eksik', icon: '!', color: 'var(--red)' },
    pending: { label: 'Bekliyor', icon: '○', color: 'var(--blue)' },
    skipped: { label: 'Atlandı', icon: '⊘', color: 'var(--text3)' },
  }[status]
}

function formatDate(value, withTime = false) {
  if (!value) return '—'
  return new Date(value).toLocaleString('tr-TR', withTime
    ? { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }
    : { day: '2-digit', month: 'short', weekday: 'short' })
}

export default function PhotoControlCenter() {
  const qc = useQueryClient()
  const user = useAuthStore(state => state.user)
  const isManager = user?.role === 'campus_manager'
  const [days, setDays] = useState(7)
  const [block, setBlock] = useState('all')
  const [floor, setFloor] = useState('all')
  const [area, setArea] = useState('all')
  const [status, setStatus] = useState('all')
  const [category, setCategory] = useState('all')
  const [dateScope, setDateScope] = useState('today')
  const [query, setQuery] = useState('')
  const [visible, setVisible] = useState(48)
  const [galleryTask, setGalleryTask] = useState(null)

  const { data, isLoading, isError } = useQuery({
    queryKey: ['housekeeping-photo-overview', days],
    queryFn: () => api.get(`/housekeeping/photo-overview?days=${days}`).then(response => response.data),
    refetchInterval: 30000,
  })
  const retentionDays = data?.retention_days || 7
  const items = data?.items || []

  const updateRetention = useMutation({
    mutationFn: (retention_days) => api.patch('/housekeeping/photo-retention', { retention_days }),
    onSuccess: (response) => {
      const nextDays = response.data.retention_days
      setDays(nextDays)
      qc.invalidateQueries({ queryKey: ['housekeeping-photo-overview'] })
    },
  })
  const cleanupNow = useMutation({
    mutationFn: () => api.post('/housekeeping/photo-retention/cleanup'),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['housekeeping-photo-overview'] }),
  })

  const blocks = useMemo(() => [...new Set(items.map(item => item.block).filter(Boolean))].sort(), [items])
  const floors = useMemo(() => [...new Set(items.filter(item => block === 'all' || item.block === block).map(item => item.floor))].sort((a, b) => a - b), [items, block])
  const today = new Date().toLocaleDateString('sv-SE')
  const filtered = useMemo(() => items.filter(item => {
    if (dateScope === 'today' && String(item.scheduled_at).slice(0, 10) !== today) return false
    if (block !== 'all' && item.block !== block) return false
    if (floor !== 'all' && Number(item.floor) !== Number(floor)) return false
    if (area !== 'all' && item.area_code !== area) return false
    if (status !== 'all' && taskStatus(item) !== status) return false
    if (category !== 'all' && !String(item.photo_categories || '').split(',').includes(category)) return false
    if (query && !`${item.area} ${item.qr_location}`.toLocaleLowerCase('tr-TR').includes(query.toLocaleLowerCase('tr-TR'))) return false
    return true
  }), [items, dateScope, today, block, floor, area, status, category, query])

  const filteredSummary = useMemo(() => filtered.reduce((totals, item) => {
    totals[taskStatus(item)]++
    return totals
  }, { with_photo: 0, without_photo: 0, pending: 0, skipped: 0 }), [filtered])

  const resetFilters = () => {
    setBlock('all'); setFloor('all'); setArea('all'); setStatus('all'); setCategory('all'); setDateScope('today'); setQuery(''); setVisible(48)
  }

  return (
    <div className="fade-up-1">
      <div className="panel" style={{ marginBottom: '14px', overflow: 'hidden' }}>
        <div style={{ height: '3px', background: 'linear-gradient(90deg,var(--teal),var(--blue),var(--purple))' }} />
        <div style={{ padding: '16px 18px', display: 'flex', gap: '16px', justifyContent: 'space-between', flexWrap: 'wrap' }}>
          <div>
            <div className="panel-title">📷 TEMİZLİK FOTOĞRAF KONTROL MERKEZİ</div>
            <div className="panel-subtitle" style={{ marginTop: '5px', maxWidth: '690px' }}>
              Oda, koridor, tuvalet, banyo ve merdiven kanıtlarını blok ve kat bazında tek ekrandan denetleyin.
            </div>
          </div>
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
            <span className="badge badge-blue">OTOMATİK SİLME: {retentionDays} GÜN</span>
            {isManager && [3, 7].map(option => (
              <button key={option} className={`filter-chip${retentionDays === option ? ' active' : ''}`}
                disabled={updateRetention.isPending} onClick={() => updateRetention.mutate(option)}>
                {option} GÜN SAKLA
              </button>
            ))}
            {isManager && (
              <button className="btn btn-ghost btn-sm" onClick={() => cleanupNow.mutate()} disabled={cleanupNow.isPending}>
                {cleanupNow.isPending ? 'TEMİZLENİYOR…' : 'SÜRESİ DOLANLARI TEMİZLE'}
              </button>
            )}
          </div>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(135px,1fr))', gap: '9px', marginBottom: '12px' }}>
        {[
          ['with_photo', 'Fotoğraflı tamam', 'var(--green)'],
          ['without_photo', 'Fotoğraf eksik', 'var(--red)'],
          ['pending', 'Bekleyen', 'var(--blue)'],
          ['skipped', 'Atlanan', 'var(--text3)'],
        ].map(([key, label, color]) => (
          <button key={key} onClick={() => setStatus(status === key ? 'all' : key)} style={{
            textAlign: 'left', padding: '12px 14px', borderRadius: '9px', cursor: 'pointer',
            background: status === key ? `color-mix(in srgb, ${color} 16%, var(--surface))` : 'var(--surface)',
            border: `1px solid ${status === key ? color : 'var(--border)'}`, color: 'var(--text)',
          }}>
            <div style={{ fontFamily: 'var(--display)', fontSize: '24px', color, lineHeight: 1 }}>{filteredSummary[key]}</div>
            <div style={{ fontFamily: 'var(--mono)', fontSize: '8px', color: 'var(--text3)', marginTop: '5px', letterSpacing: '1px' }}>{label.toUpperCase()}</div>
          </button>
        ))}
      </div>

      <div className="panel" style={{ marginBottom: '12px' }}>
        <div style={{ padding: '11px 14px', display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', background: 'var(--surface2)', border: '1px solid var(--border)', padding: '2px', borderRadius: '7px' }}>
            {[['today', 'BUGÜN'], ['all', `SON ${retentionDays} GÜN`]].map(([value, label]) => (
              <button key={value} className={`filter-chip${dateScope === value ? ' active' : ''}`} onClick={() => setDateScope(value)}>{label}</button>
            ))}
          </div>
          <select className="form-select" aria-label="Blok filtresi" value={block} onChange={event => { setBlock(event.target.value); setFloor('all'); setVisible(48) }} style={{ width: '120px' }}>
            <option value="all">Tüm bloklar</option>
            {blocks.map(value => <option key={value} value={value}>{value} Blok</option>)}
          </select>
          <select className="form-select" aria-label="Kat filtresi" value={floor} onChange={event => setFloor(event.target.value)} style={{ width: '105px' }}>
            <option value="all">Tüm katlar</option>
            {floors.map(value => <option key={value} value={value}>Kat {value}</option>)}
          </select>
          <select className="form-select" aria-label="Alan filtresi" value={area} onChange={event => setArea(event.target.value)} style={{ width: '145px' }}>
            <option value="all">Tüm alanlar</option>
            {Object.entries(AREA_META).map(([key, meta]) => <option key={key} value={key}>{meta.label}</option>)}
          </select>
          <select className="form-select" aria-label="Kategori filtresi" value={category} onChange={event => setCategory(event.target.value)} style={{ width: '135px' }}>
            <option value="all">Tüm kategoriler</option>
            {PHOTO_CATEGORIES.map(c => <option key={c.id} value={c.id}>{c.icon} {c.label}</option>)}
          </select>
          <input className="form-input" aria-label="Oda veya alan ara" value={query} onChange={event => setQuery(event.target.value)} placeholder="Oda / alan ara…" style={{ width: '175px' }} />
          <button className="btn btn-ghost btn-sm" onClick={resetFilters}>FİLTRELERİ SIFIRLA</button>
          <span style={{ marginLeft: 'auto', fontFamily: 'var(--mono)', fontSize: '9px', color: 'var(--text3)' }}>{filtered.length} KAYIT</span>
        </div>
      </div>

      {isLoading && <div className="panel" style={{ padding: '30px', textAlign: 'center', color: 'var(--text3)' }}>Fotoğraf kayıtları yükleniyor…</div>}
      {isError && <div className="alert alert-danger">Fotoğraf kayıtları alınamadı. Sayfayı yenileyip tekrar deneyin.</div>}
      {!isLoading && !isError && filtered.length === 0 && (
        <div className="panel" style={{ padding: '34px', textAlign: 'center' }}>
          <div style={{ fontSize: '28px', marginBottom: '8px' }}>📭</div>
          <div className="panel-title">BU FİLTRELERDE KAYIT YOK</div>
          <button className="btn btn-ghost btn-sm" style={{ marginTop: '12px' }} onClick={resetFilters}>TÜM BUGÜNÜ GÖSTER</button>
        </div>
      )}

      {!isLoading && filtered.length > 0 && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(210px,1fr))', gap: '10px' }}>
          {filtered.slice(0, visible).map(item => {
            const meta = AREA_META[item.area_code] || AREA_META.common
            const state = taskStatus(item)
            const stateMeta = statusMeta(state)
            return (
              <article key={item.id} className="panel" style={{ overflow: 'hidden', borderColor: state === 'without_photo' ? 'rgba(239,68,68,.55)' : undefined }}>
                <div style={{ height: '3px', background: stateMeta.color }} />
                {item.photo_url ? (
                  <button onClick={() => setGalleryTask(item)} title={`${item.photo_count || 1} fotoğrafı gör`} style={{ position: 'relative', width: '100%', height: '125px', border: 0, padding: 0, cursor: 'zoom-in', background: 'var(--surface2)' }}>
                    <img loading="lazy" src={item.photo_url} alt={`${item.area} temizlik kanıtı`} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                    {item.photo_count > 1 && (
                      <span style={{ position: 'absolute', top: '6px', right: '6px', background: 'rgba(0,0,0,.66)', color: '#fff', borderRadius: '999px', padding: '2px 8px', fontFamily: 'var(--mono)', fontSize: '10px', fontWeight: 700 }}>📷 {item.photo_count}</span>
                    )}
                  </button>
                ) : (
                  <button onClick={() => isManager && setGalleryTask(item)} title={isManager ? 'Fotoğraf ekle' : undefined} style={{ width: '100%', height: '78px', display: 'grid', placeItems: 'center', border: 0, cursor: isManager ? 'pointer' : 'default', background: state === 'without_photo' ? 'rgba(239,68,68,.08)' : 'var(--surface2)' }}>
                    <div style={{ textAlign: 'center' }}><div style={{ fontSize: '24px' }}>{state === 'without_photo' ? '📷!' : meta.icon}</div><div style={{ fontFamily: 'var(--mono)', fontSize: '7px', color: stateMeta.color, marginTop: '3px' }}>{isManager && state === 'without_photo' ? '+ FOTO EKLE' : stateMeta.label.toUpperCase()}</div></div>
                  </button>
                )}
                <div style={{ padding: '10px 11px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: '8px', alignItems: 'start' }}>
                    <div>
                      <div style={{ fontFamily: 'var(--display)', fontSize: '13px', color: 'var(--text)' }}>{item.area}</div>
                      <div style={{ fontFamily: 'var(--mono)', fontSize: '8px', color: 'var(--text3)', marginTop: '3px' }}>{item.block} BLOK · KAT {item.floor} · {meta.label}</div>
                      {item.photo_categories && (
                        <div style={{ display: 'flex', gap: '3px', flexWrap: 'wrap', marginTop: '4px' }}>
                          {String(item.photo_categories).split(',').filter(Boolean).map(c => {
                            const cm = PHOTO_CATEGORY_MAP[c]
                            return cm ? <span key={c} style={{ fontFamily: 'var(--mono)', fontSize: '7px', color: cm.color, border: `1px solid ${cm.color}`, borderRadius: '4px', padding: '0 4px' }}>{cm.label}</span> : null
                          })}
                        </div>
                      )}
                    </div>
                    <span style={{ color: stateMeta.color, fontWeight: 700 }} title={stateMeta.label}>{stateMeta.icon}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '9px', paddingTop: '8px', borderTop: '1px solid var(--border)', gap: '8px' }}>
                    <span style={{ fontFamily: 'var(--mono)', fontSize: '8px', color: 'var(--text3)' }}>{formatDate(item.scheduled_at)}</span>
                    <span style={{ fontFamily: 'var(--mono)', fontSize: '8px', color: 'var(--text2)', textAlign: 'right' }}>{item.worker_name || item.assignee_name || (item.completed_at ? formatDate(item.completed_at, true) : 'Atanmadı')}</span>
                  </div>
                  {item.skip_reason && <div style={{ marginTop: '7px', fontSize: '9px', color: 'var(--text3)' }}>Atlama: {item.skip_reason}</div>}
                </div>
              </article>
            )
          })}
        </div>
      )}

      {filtered.length > visible && (
        <button className="btn btn-ghost" onClick={() => setVisible(value => value + 48)} style={{ width: '100%', marginTop: '12px' }}>
          DAHA FAZLA GÖSTER · {filtered.length - visible} KAYIT KALDI
        </button>
      )}
      <div style={{ fontFamily: 'var(--mono)', fontSize: '8px', color: 'var(--text4)', marginTop: '12px', textAlign: 'center' }}>
        Temizlik kayıtları korunur; yalnızca kanıt fotoğrafları seçilen sürenin sonunda gece otomatik kaldırılır.
      </div>

      {galleryTask && (
        <TaskPhotoGallery
          task={galleryTask}
          isManager={isManager}
          onClose={() => setGalleryTask(null)}
          onChanged={() => qc.invalidateQueries({ queryKey: ['housekeeping-photo-overview'] })}
        />
      )}
    </div>
  )
}
