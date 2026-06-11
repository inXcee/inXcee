import { useState, useMemo } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import api from '../../shared/api/client.js'
import { confirmDialog } from '../../shared/components/ConfirmDialog.jsx'
import { SkeletonTable } from '../../shared/components/Skeleton.jsx'

const STATION_TYPES = [
  { type: 'entry',     label: 'Giriş',      icon: '🚪', color: '#16a34a' },
  { type: 'exit',      label: 'Çıkış',      icon: '🚧', color: '#dc2626' },
  { type: 'cafeteria', label: 'Yemekhane',  icon: '🍽', color: '#ea580c' },
  { type: 'transport', label: 'Servis',     icon: '🚌', color: '#2563eb' },
  { type: 'generic',   label: 'Genel',      icon: '⌖',  color: '#6b7280' },
]
const typeMeta = t => STATION_TYPES.find(s => s.type === t) || STATION_TYPES[4]

const RESULT_META = {
  ok:           { label: 'OK',          color: '#16a34a' },
  denied:       { label: 'RED',         color: '#dc2626' },
  not_eligible: { label: 'UYGUN DEĞİL', color: '#b45309' },
  duplicate:    { label: 'TEKRAR',      color: '#b45309' },
  unknown_card: { label: 'TANIMSIZ',    color: '#6b7280' },
  alarm:        { label: '⚠ ALARM',     color: '#991b1b' },
}

// scanned_at UTC — yerel saat gösterimi
const fmtScanTime = s => s ? new Date(s.replace(' ', 'T') + 'Z').toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' }) : null

export default function StationsPage() {
  const qc = useQueryClient()
  const [selectedId, setSelectedId] = useState(null)
  const [form, setForm] = useState({ name: '', station_type: 'entry', location: '', capture_photo: true })
  const [revealKey, setRevealKey] = useState(null)  // { name, api_key }
  const [toast, setToast] = useState(null)
  const [evStation, setEvStation] = useState(0)     // hareket filtresi: 0 = tüm istasyonlar
  const [evOnlyFail, setEvOnlyFail] = useState(false)
  const [lightbox, setLightbox] = useState(null)    // okutma fotoğrafı büyütme

  const { data: stations = [], isLoading } = useQuery({
    queryKey: ['stations'],
    queryFn: () => api.get('/stations').then(r => r.data),
  })
  const { data: events = [] } = useQuery({
    queryKey: ['station-events', evStation, evOnlyFail],
    queryFn: () => api.get(`/stations/recent-events?limit=60${evStation ? `&station_id=${evStation}` : ''}${evOnlyFail ? '&only_fail=1' : ''}`).then(r => r.data),
    refetchInterval: 15000,
  })
  const { data: stats } = useQuery({
    queryKey: ['station-stats-today'],
    queryFn: () => api.get('/stations/stats-today').then(r => r.data),
    refetchInterval: 30000,
  })
  const todayByStation = useMemo(() => {
    const m = {}
    for (const s of stats?.stations || []) m[s.id] = s
    return m
  }, [stats])

  const selected = useMemo(() => stations.find(s => s.id === selectedId) || null, [stations, selectedId])

  function showToast(msg, type = 'success') { setToast({ msg, type }); setTimeout(() => setToast(null), 3000) }
  const invalidate = () => { qc.invalidateQueries({ queryKey: ['stations'] }) }

  const createMut = useMutation({
    mutationFn: body => api.post('/stations', body).then(r => r.data),
    onSuccess: data => {
      invalidate()
      setForm({ name: '', station_type: 'entry', location: '', capture_photo: true })
      setRevealKey({ name: data.name, api_key: data.api_key })
      setSelectedId(data.id)
      showToast('İstasyon oluşturuldu')
    },
    onError: e => showToast(e.response?.data?.error ?? 'Hata', 'error'),
  })

  const updateMut = useMutation({
    mutationFn: ({ id, ...body }) => api.patch(`/stations/${id}`, body),
    onSuccess: () => { invalidate(); showToast('Kaydedildi') },
    onError: e => showToast(e.response?.data?.error ?? 'Hata', 'error'),
  })

  const rotateMut = useMutation({
    mutationFn: id => api.post(`/stations/${id}/rotate-key`).then(r => r.data),
    onSuccess: (data, id) => {
      const st = stations.find(s => s.id === id)
      setRevealKey({ name: st?.name || 'İstasyon', api_key: data.api_key })
      showToast('Anahtar yenilendi — eski anahtar geçersiz')
    },
    onError: e => showToast(e.response?.data?.error ?? 'Hata', 'error'),
  })

  const deleteMut = useMutation({
    mutationFn: id => api.delete(`/stations/${id}`),
    onSuccess: () => { invalidate(); setSelectedId(null); showToast('İstasyon silindi') },
    onError: e => showToast(e.response?.data?.error ?? 'Hata', 'error'),
  })

  const stationUrl = id => `${window.location.origin}/station`

  return (
    <div style={{ padding: '24px' }}>
      <div className="fade-up" style={{ marginBottom: '20px' }}>
        <h2 style={{ fontSize: '28px', letterSpacing: '4px' }}>OKUTMA İSTASYONLARI</h2>
        <p style={{ fontFamily: 'var(--mono)', fontSize: '10px', color: 'var(--text3)', letterSpacing: '1px', marginTop: '4px' }}>
          SABİT NFC OKUYUCU NOKTALARI · API-KEY · GİRİŞ/ÇIKIŞ/YEMEK · FOTO KANIT
        </p>
      </div>

      {/* Anahtar açığa çıkarma — bir kez gösterilir */}
      {revealKey && (
        <div style={{
          marginBottom: 16, padding: '14px 16px', borderRadius: 10,
          background: 'rgba(240,165,0,0.08)', border: '1px solid var(--accent)',
        }}>
          <div style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--accent)', letterSpacing: 1, marginBottom: 6 }}>
            ⚠ {revealKey.name} — İSTASYON ANAHTARI (yalnızca şimdi görünür, güvenli sakla)
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <code style={{
              fontFamily: 'var(--mono)', fontSize: 14, padding: '8px 12px', borderRadius: 6,
              background: 'var(--surface2)', border: '1px solid var(--border)', color: 'var(--text)', userSelect: 'all',
            }}>{revealKey.api_key}</code>
            <button className="btn btn-xs" style={{ border: '1px solid var(--border)', background: 'var(--surface2)', color: 'var(--text)' }}
              onClick={() => { navigator.clipboard?.writeText(revealKey.api_key); showToast('Anahtar kopyalandı') }}>
              📋 Kopyala
            </button>
            <button className="btn btn-xs btn-primary" onClick={() => setRevealKey(null)}>Gizle</button>
          </div>
          <div style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--text3)', marginTop: 8 }}>
            İstasyon kurulumu: <strong>{stationUrl()}</strong> aç → bu anahtarı gir. Okuyucu USB klavye modunda (HID) çalışır.
          </div>
        </div>
      )}

      {toast && (
        <div style={{
          padding: '10px 16px', marginBottom: '16px', borderRadius: '6px',
          background: toast.type === 'success' ? '#dcfce7' : '#fee2e2',
          color: toast.type === 'success' ? '#166534' : '#991b1b',
          fontFamily: 'var(--mono)', fontSize: '12px',
        }}>{toast.msg}</div>
      )}

      {/* BUGÜN KPI şeridi — tüm istasyonlar toplamı */}
      {stats && (
        <div className="fade-up-1" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(130px, 1fr))', gap: '10px', marginBottom: '16px' }}>
          {(() => {
            const t = stats.totals || {}
            const total = Object.values(t).reduce((a, b) => a + b, 0)
            const kpis = [
              { label: 'BUGÜN TOPLAM', value: total, color: 'var(--text)' },
              { label: 'GEÇİŞ OK', value: t.ok || 0, color: '#16a34a' },
              { label: 'REDDEDİLEN', value: (t.denied || 0) + (t.not_eligible || 0), color: '#dc2626' },
              { label: 'TEKRAR', value: t.duplicate || 0, color: '#b45309' },
              { label: 'TANIMSIZ KART', value: t.unknown_card || 0, color: '#6b7280' },
              { label: '⚠ ALARM', value: t.alarm || 0, color: t.alarm > 0 ? '#991b1b' : 'var(--text3)' },
            ]
            return kpis.map(k => (
              <div key={k.label} style={{ padding: '12px 14px', background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: '8px' }}>
                <div style={{ fontFamily: 'var(--display)', fontSize: '26px', color: k.color, lineHeight: 1 }}>{k.value}</div>
                <div style={{ fontFamily: 'var(--mono)', fontSize: '7.5px', color: 'var(--text3)', letterSpacing: '1.5px', marginTop: '4px' }}>{k.label}</div>
              </div>
            ))
          })()}
        </div>
      )}

      <div className="layout-list-detail" style={{ display: 'grid', gridTemplateColumns: '320px 1fr', gap: '16px', alignItems: 'start' }}>
        {/* Sol: istasyon listesi + yeni */}
        <div className="panel fade-up-1">
          <div style={{ height: '2px', background: 'var(--accent)' }} />
          <div className="panel-header">
            <div className="panel-title">İSTASYONLAR</div>
            <span style={{ fontFamily: 'var(--mono)', fontSize: '10px', color: 'var(--text3)' }}>{stations.length}</span>
          </div>
          <div className="panel-body" style={{ padding: 0 }}>
            {isLoading ? <SkeletonTable rows={4} cols={2} /> : stations.length === 0 ? (
              <div style={{ padding: 16, color: 'var(--text3)', fontFamily: 'var(--mono)', fontSize: 12 }}>Henüz istasyon yok</div>
            ) : stations.map(s => {
              const m = typeMeta(s.station_type)
              return (
                <div key={s.id} onClick={() => setSelectedId(s.id)}
                  style={{
                    padding: '12px 16px', cursor: 'pointer', borderBottom: '1px solid var(--border)',
                    background: selectedId === s.id ? 'rgba(240,165,0,0.08)' : 'transparent',
                    borderLeft: selectedId === s.id ? '3px solid var(--accent)' : '3px solid transparent',
                    opacity: s.is_active ? 1 : 0.55,
                  }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ fontSize: 15 }}>{m.icon}</span>
                    <span style={{ fontFamily: 'var(--sans)', fontSize: 13, fontWeight: 500, color: 'var(--text)' }}>{s.name}</span>
                    <span style={{ marginLeft: 'auto', fontFamily: 'var(--mono)', fontSize: 9, padding: '1px 6px', borderRadius: 4, background: `${m.color}22`, color: m.color }}>{m.label}</span>
                  </div>
                  <div style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--text3)', marginTop: 3, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    {!s.is_active && <span style={{ color: '#dc2626' }}>● PASİF</span>}
                    {s.capture_photo ? <span>📷 foto</span> : <span style={{ color: 'var(--text4)' }}>foto yok</span>}
                    {s.location && <span>📍 {s.location}</span>}
                  </div>
                  {(() => {
                    const st = todayByStation[s.id]
                    if (!st) return null
                    return (
                      <div style={{ fontFamily: 'var(--mono)', fontSize: 10, marginTop: 4, display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                        <span style={{ color: st.total > 0 ? 'var(--text2)' : 'var(--text4)' }}>bugün {st.total}</span>
                        {st.ok_count > 0 && <span style={{ color: '#16a34a' }}>✓{st.ok_count}</span>}
                        {st.fail_count > 0 && <span style={{ color: '#dc2626' }}>✕{st.fail_count}</span>}
                        {st.last_scan_at && <span style={{ color: 'var(--text4)' }}>son {fmtScanTime(st.last_scan_at)}</span>}
                      </div>
                    )
                  })()}
                </div>
              )
            })}

            {/* Yeni istasyon */}
            <div style={{ padding: '12px 16px', borderTop: '1px solid var(--border)' }}>
              <div style={{ fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--text3)', letterSpacing: 1, marginBottom: 8 }}>YENİ İSTASYON</div>
              <input className="form-input" placeholder="İstasyon adı" value={form.name}
                onChange={e => setForm(f => ({ ...f, name: e.target.value }))} style={{ marginBottom: 6, fontSize: 12 }} />
              <select className="form-select" value={form.station_type}
                onChange={e => setForm(f => ({ ...f, station_type: e.target.value }))} style={{ marginBottom: 6, fontSize: 12 }}>
                {STATION_TYPES.map(t => <option key={t.type} value={t.type}>{t.icon} {t.label}</option>)}
              </select>
              <input className="form-input" placeholder="Konum (opsiyonel)" value={form.location}
                onChange={e => setForm(f => ({ ...f, location: e.target.value }))} style={{ marginBottom: 6, fontSize: 12 }} />
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--text2)', marginBottom: 8, cursor: 'pointer' }}>
                <input type="checkbox" checked={form.capture_photo} onChange={e => setForm(f => ({ ...f, capture_photo: e.target.checked }))} />
                Okutmada foto çek
              </label>
              <button className="btn btn-primary" style={{ width: '100%', fontSize: 12 }}
                disabled={createMut.isPending || form.name.trim().length < 2}
                onClick={() => createMut.mutate({ ...form, name: form.name.trim(), location: form.location.trim() || null })}>
                {createMut.isPending ? 'Oluşturuluyor...' : '+ İstasyon Oluştur'}
              </button>
            </div>
          </div>
        </div>

        {/* Sağ: detay + son hareketler */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {selected ? (
            <div className="panel fade-up-2">
              <div style={{ height: '2px', background: 'linear-gradient(90deg, var(--accent), var(--accent3))' }} />
              <div className="panel-header">
                <div className="panel-title">{selected.name.toLocaleUpperCase('tr')}</div>
                <span style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--text3)' }}>#{selected.id}</span>
              </div>
              <div className="panel-body" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, maxWidth: 460 }}>
                  <div>
                    <label style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--text3)', letterSpacing: 1, display: 'block', marginBottom: 6 }}>AD</label>
                    <input className="form-input" defaultValue={selected.name} key={`n${selected.id}`}
                      onBlur={e => e.target.value.trim() && e.target.value !== selected.name && updateMut.mutate({ id: selected.id, name: e.target.value.trim() })} />
                  </div>
                  <div>
                    <label style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--text3)', letterSpacing: 1, display: 'block', marginBottom: 6 }}>TİP</label>
                    <select className="form-select" value={selected.station_type}
                      onChange={e => updateMut.mutate({ id: selected.id, station_type: e.target.value })}>
                      {STATION_TYPES.map(t => <option key={t.type} value={t.type}>{t.icon} {t.label}</option>)}
                    </select>
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontFamily: 'var(--mono)', fontSize: 12, color: 'var(--text2)', cursor: 'pointer' }}>
                    <input type="checkbox" checked={!!selected.capture_photo}
                      onChange={e => updateMut.mutate({ id: selected.id, capture_photo: e.target.checked })} />
                    📷 Foto çek
                  </label>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontFamily: 'var(--mono)', fontSize: 12, color: 'var(--text2)', cursor: 'pointer' }}>
                    <input type="checkbox" checked={!!selected.is_active}
                      onChange={e => updateMut.mutate({ id: selected.id, is_active: e.target.checked })} />
                    Aktif
                  </label>
                </div>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', borderTop: '1px solid var(--border)', paddingTop: 14 }}>
                  <button className="btn btn-xs" style={{ border: '1px solid var(--accent)', background: 'rgba(240,165,0,0.1)', color: 'var(--accent)' }}
                    disabled={rotateMut.isPending}
                    onClick={async () => { if (await confirmDialog({ title: 'Anahtar yenile', body: 'Eski anahtar geçersiz olacak, istasyonu yeni anahtarla yeniden kurmanız gerekir. Devam?', danger: true })) rotateMut.mutate(selected.id) }}>
                    ↻ Anahtar Yenile
                  </button>
                  <button className="btn btn-xs" style={{ border: '1px solid #ef444455', background: '#ef444414', color: '#dc2626' }}
                    disabled={deleteMut.isPending}
                    onClick={async () => { if (await confirmDialog({ title: 'İstasyon sil', body: `"${selected.name}" silinsin mi?`, danger: true })) deleteMut.mutate(selected.id) }}>
                    ✕ Sil
                  </button>
                </div>
              </div>
            </div>
          ) : (
            <div className="panel fade-up-2" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 120 }}>
              <span style={{ fontFamily: 'var(--mono)', fontSize: 12, color: 'var(--text4)' }}>Detay için bir istasyon seçin veya yeni oluşturun</span>
            </div>
          )}

          {/* Son hareketler — istasyon + sorunlu filtresi */}
          <div className="panel fade-up-3">
            <div style={{ height: '2px', background: 'var(--accent3)' }} />
            <div className="panel-header" style={{ flexWrap: 'wrap', gap: 8 }}>
              <div className="panel-title">SON HAREKETLER</div>
              <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
                <select className="form-select" value={evStation} onChange={e => setEvStation(+e.target.value)}
                  style={{ fontSize: 11, padding: '4px 8px', width: 'auto' }}>
                  <option value={0}>Tüm istasyonlar</option>
                  {stations.map(s => <option key={s.id} value={s.id}>{typeMeta(s.station_type).icon} {s.name}</option>)}
                </select>
                <button onClick={() => setEvOnlyFail(v => !v)}
                  className={`filter-chip ${evOnlyFail ? 'active' : ''}`}
                  style={{ fontSize: 10 }}>
                  ⚠ Sadece sorunlu
                </button>
                <span style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--text3)' }}>canlı · 15sn</span>
              </div>
            </div>
            <div className="panel-body" style={{ padding: 0, maxHeight: 420, overflowY: 'auto' }}>
              {events.length === 0 ? (
                <div style={{ padding: 16, color: 'var(--text3)', fontFamily: 'var(--mono)', fontSize: 12 }}>
                  {evOnlyFail ? 'Sorunlu okutma yok — iyi haber 👍' : 'Henüz okutma yok'}
                </div>
              ) : events.map(ev => {
                const rm = RESULT_META[ev.result] || RESULT_META.unknown_card
                return (
                  <div key={ev.id} style={{ padding: '10px 16px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 10 }}>
                    {ev.photo_url
                      ? <img src={ev.photo_url} alt="okutma fotoğrafı" title="Büyütmek için tıkla"
                          onClick={() => setLightbox(ev.photo_url)}
                          style={{ width: 32, height: 32, borderRadius: 6, objectFit: 'cover', flexShrink: 0, cursor: 'pointer' }} />
                      : <span style={{ width: 32, height: 32, borderRadius: 6, background: 'var(--surface2)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, flexShrink: 0 }}>{typeMeta(ev.station_type).icon}</span>}
                    <div style={{ minWidth: 0, flex: 1 }}>
                      <div style={{ fontFamily: 'var(--sans)', fontSize: 13, color: 'var(--text)' }}>
                        {ev.holder_name || (ev.raw_uid ? `UID ${ev.raw_uid}` : 'Bilinmiyor')}
                      </div>
                      <div style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--text3)' }}>
                        {ev.station_name || '—'} · {ev.event_type}{ev.meal_type ? ` (${ev.meal_type})` : ''}
                      </div>
                    </div>
                    <span style={{ fontFamily: 'var(--mono)', fontSize: 9, padding: '2px 7px', borderRadius: 4, background: `${rm.color}22`, color: rm.color, flexShrink: 0 }}>{rm.label}</span>
                    <span style={{ fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--text4)', flexShrink: 0 }}>
                      {new Date(ev.scanned_at + 'Z').toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </div>
                )
              })}
            </div>
          </div>
        </div>
      </div>

      {/* Okutma fotoğrafı lightbox */}
      {lightbox && (
        <div onClick={() => setLightbox(null)} role="dialog" aria-label="Fotoğraf önizleme — kapatmak için tıkla"
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.88)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'zoom-out', padding: 24 }}>
          <img src={lightbox} alt="okutma fotoğrafı" style={{ maxWidth: '100%', maxHeight: '100%', borderRadius: 8 }} />
        </div>
      )}
    </div>
  )
}
