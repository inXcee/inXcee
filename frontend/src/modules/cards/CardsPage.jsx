import { useState, useMemo } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import api from '../../shared/api/client.js'
import { confirmDialog } from '../../shared/components/ConfirmDialog.jsx'
import { SkeletonTable } from '../../shared/components/Skeleton.jsx'

// Kart tipi → görünüm (backend CARD_META ile aynı renk/etiket dili)
const CARD_TYPES = [
  { type: 'access', label: 'Giriş Kartı', short: 'GİRİŞ', icon: '🚪', color: '#2563eb' },
  { type: 'meal',   label: 'Yemek Kartı', short: 'YEMEK', icon: '🍽', color: '#ea580c' },
]

// Roster satırından bir kart tipinin durumunu çıkar
function cardOf(staff, type) {
  if (!staff) return null
  const id = staff[`${type}_id`]
  if (!id) return null
  return { id, code: staff[`${type}_code`], nfc_uid: staff[`${type}_nfc`], photo_url: staff[`${type}_photo`] }
}

// Web NFC sadece Android Chrome'da (NDEFReader). Diğer platformlarda buton gizli.
const NFC_SUPPORTED = typeof window !== 'undefined' && 'NDEFReader' in window

export default function CardsPage() {
  const qc = useQueryClient()
  const [selectedId, setSelectedId] = useState(null)
  const [search, setSearch] = useState('')
  const [nfcDraft, setNfcDraft] = useState({})   // { [cardId]: uid }
  const [toast, setToast] = useState(null)

  const { data: roster = [], isLoading } = useQuery({
    queryKey: ['cards-roster'],
    queryFn: () => api.get('/cards/roster').then(r => r.data),
  })

  // selected'ı id'den türet → mutation sonrası invalidate ile otomatik tazelenir
  const selected = useMemo(() => roster.find(s => s.id === selectedId) || null, [roster, selectedId])

  const filtered = useMemo(() => {
    const q = search.trim().toLocaleLowerCase('tr')
    return q ? roster.filter(s => s.full_name.toLocaleLowerCase('tr').includes(q)) : roster
  }, [roster, search])

  // Kart kapsama özeti (kaç kişide aktif giriş / yemek kartı var)
  const coverage = useMemo(() => {
    const c = { access: 0, meal: 0 }
    roster.forEach(s => { if (s.access_id) c.access++; if (s.meal_id) c.meal++ })
    return c
  }, [roster])

  function showToast(msg, type = 'success') {
    setToast({ msg, type })
    setTimeout(() => setToast(null), 3000)
  }

  const invalidate = () => qc.invalidateQueries({ queryKey: ['cards-roster'] })

  const issueMut = useMutation({
    mutationFn: ({ holderId, card_type, regenerate }) =>
      api.post(`/cards/staff/${holderId}/issue`, { card_type, regenerate }),
    onSuccess: (_d, v) => { invalidate(); showToast(v.regenerate ? 'Kart yenilendi' : 'Kart üretildi') },
    onError: e => showToast(e.response?.data?.error ?? 'Hata', 'error'),
  })

  const revokeMut = useMutation({
    mutationFn: id => api.patch(`/cards/${id}/revoke`),
    onSuccess: () => { invalidate(); showToast('Kart iptal edildi') },
    onError: e => showToast(e.response?.data?.error ?? 'Hata', 'error'),
  })

  const lostMut = useMutation({
    mutationFn: id => api.patch(`/cards/${id}/report-lost`),
    onSuccess: () => { invalidate(); showToast('Kart kayıp işaretlendi') },
    onError: e => showToast(e.response?.data?.error ?? 'Hata', 'error'),
  })

  const bindMut = useMutation({
    mutationFn: ({ id, nfc_uid }) => api.patch(`/cards/${id}/bind-nfc`, { nfc_uid }),
    onSuccess: (_d, v) => { invalidate(); setNfcDraft(d => ({ ...d, [v.id]: '' })); showToast('NFC etiketi bağlandı') },
    onError: e => showToast(e.response?.data?.error ?? 'Hata', 'error'),
  })

  const bulkMut = useMutation({
    mutationFn: card_type => api.post('/cards/bulk-issue', { card_type }),
    onSuccess: r => { invalidate(); showToast(`${r.data.generated} eksik kart üretildi`) },
    onError: e => showToast(e.response?.data?.error ?? 'Hata', 'error'),
  })

  const photoMut = useMutation({
    mutationFn: ({ id, file }) => {
      const fd = new FormData()
      fd.append('photo', file)
      return api.post(`/cards/${id}/photo`, fd)
    },
    onSuccess: () => { invalidate(); showToast('Kart fotoğrafı eklendi') },
    onError: e => showToast(e.response?.data?.error ?? 'Foto yüklenemedi', 'error'),
  })

  const [nfcScanning, setNfcScanning] = useState(null) // okunan kart id'si

  // Android Web NFC: kartı telefona yaklaştır, UID'i (serialNumber) oku → bağla.
  async function scanNfc(cardId) {
    if (!NFC_SUPPORTED) return
    try {
      setNfcScanning(cardId)
      const reader = new window.NDEFReader()
      await reader.scan()
      reader.onreading = (e) => {
        const uid = e.serialNumber
        setNfcScanning(null)
        if (uid) bindMut.mutate({ id: cardId, nfc_uid: uid })
        else showToast('UID okunamadı — kart NFC desteklemiyor olabilir', 'error')
      }
      reader.onreadingerror = () => { setNfcScanning(null); showToast('NFC okuma hatası', 'error') }
    } catch (e) {
      setNfcScanning(null)
      showToast(e?.name === 'NotAllowedError' ? 'NFC izni reddedildi' : 'NFC başlatılamadı', 'error')
    }
  }

  async function downloadPdf(cardId, name, short) {
    try {
      const res = await api.get(`/cards/${cardId}/pdf`, { responseType: 'blob' })
      const url = URL.createObjectURL(new Blob([res.data], { type: 'application/pdf' }))
      const a = document.createElement('a')
      a.href = url
      a.download = `${short.toLocaleLowerCase('tr')}-${(name || 'kart').replace(/\s+/g, '_')}.pdf`
      a.click()
      URL.revokeObjectURL(url)
    } catch { showToast('PDF üretilemedi', 'error') }
  }

  async function downloadBatchPdf(cardType, label) {
    try {
      const res = await api.get(`/cards/batch-pdf?card_type=${cardType}`, { responseType: 'blob' })
      const url = URL.createObjectURL(new Blob([res.data], { type: 'application/pdf' }))
      const a = document.createElement('a')
      a.href = url
      a.download = `toplu-${cardType}.pdf`
      a.click()
      URL.revokeObjectURL(url)
    } catch (e) {
      const msg = e.response?.status === 400 ? 'Yazdırılacak aktif kart yok' : 'Toplu PDF üretilemedi'
      showToast(msg, 'error')
    }
  }

  const busy = issueMut.isPending || revokeMut.isPending || lostMut.isPending || bindMut.isPending

  return (
    <div style={{ padding: '24px' }}>
      <div className="fade-up" style={{ marginBottom: '20px' }}>
        <h2 style={{ fontSize: '28px', letterSpacing: '4px' }}>KARTLAR</h2>
        <p style={{ fontFamily: 'var(--mono)', fontSize: '10px', color: 'var(--text3)', letterSpacing: '1px', marginTop: '4px' }}>
          AMAÇ BAZINDA KİMLİK · GİRİŞ + YEMEK KARTI · PDF · NFC BAĞLAMA
        </p>
      </div>

      {/* Toplu üret + kapsama */}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', marginBottom: 16 }}>
        {CARD_TYPES.map(ct => {
          const missing = roster.length - coverage[ct.type]
          return (
            <button
              key={ct.type}
              className="btn btn-xs"
              disabled={bulkMut.isPending || missing <= 0}
              onClick={async () => {
                if (await confirmDialog({
                  title: `Toplu ${ct.short} kartı`,
                  body: `${missing} aktif çalışanın eksik ${ct.label.toLocaleLowerCase('tr')} üretilsin mi?`,
                })) bulkMut.mutate(ct.type)
              }}
              style={{
                borderRadius: 8, border: `1px solid ${ct.color}55`,
                background: `${ct.color}14`, color: ct.color,
              }}
            >
              {ct.icon} Eksik {ct.short.toLocaleLowerCase('tr')} üret ({missing})
            </button>
          )
        })}
        {CARD_TYPES.map(ct => (
          <button
            key={`batch-${ct.type}`}
            className="btn btn-xs"
            disabled={coverage[ct.type] <= 0}
            onClick={() => downloadBatchPdf(ct.type, ct.label)}
            style={{ borderRadius: 8, border: '1px solid var(--border)', background: 'var(--surface2)', color: 'var(--text)' }}
            title={`Tüm aktif ${ct.label.toLocaleLowerCase('tr')}larını tek PDF'te yazdır`}
          >
            ⊞ {ct.short.toLocaleLowerCase('tr')} toplu PDF ({coverage[ct.type]})
          </button>
        ))}
        <span style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--text3)', marginLeft: 'auto' }}>
          {coverage.access}/{roster.length} giriş · {coverage.meal}/{roster.length} yemek
        </span>
      </div>

      {toast && (
        <div style={{
          padding: '10px 16px', marginBottom: '16px', borderRadius: '6px',
          background: toast.type === 'success' ? '#dcfce7' : '#fee2e2',
          color: toast.type === 'success' ? '#166534' : '#991b1b',
          fontFamily: 'var(--mono)', fontSize: '12px',
        }}>
          {toast.msg}
        </div>
      )}

      <div className="layout-list-detail" style={{ display: 'grid', gridTemplateColumns: '300px 1fr', gap: '16px', alignItems: 'start' }}>
        {/* Sol: roster */}
        <div className="panel fade-up-1">
          <div style={{ height: '2px', background: 'var(--accent)' }} />
          <div className="panel-header">
            <div className="panel-title">ÇALIŞANLAR</div>
            <span style={{ fontFamily: 'var(--mono)', fontSize: '10px', color: 'var(--text3)' }}>{roster.length} kayıt</span>
          </div>
          <div style={{ padding: '10px 12px', borderBottom: '1px solid var(--border)' }}>
            <input
              className="form-input"
              placeholder="🔍 İsim ara…"
              value={search}
              onChange={e => setSearch(e.target.value)}
              style={{ fontSize: 12 }}
            />
          </div>
          <div className="panel-body" style={{ padding: 0, maxHeight: 'calc(100vh - 320px)', overflowY: 'auto' }}>
            {isLoading ? (
              <SkeletonTable rows={8} cols={3} />
            ) : filtered.length === 0 ? (
              <div style={{ padding: '16px', color: 'var(--text3)', fontFamily: 'var(--mono)', fontSize: '12px' }}>
                {search ? 'Eşleşen çalışan yok' : 'Aktif çalışan yok'}
              </div>
            ) : filtered.map(s => (
              <div
                key={s.id}
                onClick={() => setSelectedId(s.id)}
                style={{
                  padding: '11px 16px', cursor: 'pointer',
                  borderBottom: '1px solid var(--border)',
                  background: selectedId === s.id ? 'rgba(240,165,0,0.08)' : 'transparent',
                  borderLeft: selectedId === s.id ? '3px solid var(--accent)' : '3px solid transparent',
                  transition: 'all 0.15s',
                }}
                onMouseEnter={e => { if (selectedId !== s.id) e.currentTarget.style.background = 'var(--surface2)' }}
                onMouseLeave={e => { if (selectedId !== s.id) e.currentTarget.style.background = 'transparent' }}
              >
                <div style={{ fontFamily: 'var(--sans)', fontSize: 13, fontWeight: 500, color: 'var(--text)' }}>
                  {s.full_name}
                </div>
                <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginTop: 4, flexWrap: 'wrap' }}>
                  {CARD_TYPES.map(ct => {
                    const has = !!s[`${ct.type}_id`]
                    const nfc = !!s[`${ct.type}_nfc`]
                    return (
                      <span key={ct.type} style={{
                        fontFamily: 'var(--mono)', fontSize: 9, padding: '1px 6px', borderRadius: 4, letterSpacing: 0.5,
                        background: has ? `${ct.color}1f` : 'var(--surface2)',
                        color: has ? ct.color : 'var(--text4)',
                        border: `1px solid ${has ? ct.color + '44' : 'var(--border)'}`,
                      }}>
                        {has ? '●' : '○'} {ct.short}{has && nfc ? ' ⌁' : ''}
                      </span>
                    )
                  })}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Sağ: detay */}
        {selected ? (
          <div className="panel fade-up-2">
            <div style={{ height: '2px', background: 'linear-gradient(90deg, var(--accent), var(--accent3))' }} />
            <div className="panel-header">
              <div className="panel-title">{selected.full_name.toLocaleUpperCase('tr')}</div>
              <span style={{ fontFamily: 'var(--mono)', fontSize: '10px', color: 'var(--text3)' }}>
                staff #{selected.id}{selected.department_name ? ` · ${selected.department_name}` : ''}
              </span>
            </div>
            <div className="panel-body" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              {CARD_TYPES.map(ct => {
                const card = cardOf(selected, ct.type)
                return (
                  <div key={ct.type} style={{
                    border: `1px solid ${ct.color}33`, borderRadius: 10, overflow: 'hidden',
                  }}>
                    <div style={{
                      display: 'flex', alignItems: 'center', gap: 8, padding: '10px 14px',
                      background: `${ct.color}10`, borderBottom: card ? `1px solid ${ct.color}22` : 'none',
                    }}>
                      <span style={{ fontSize: 16 }}>{ct.icon}</span>
                      <span style={{ fontFamily: 'var(--sans)', fontWeight: 600, fontSize: 14, color: 'var(--text)' }}>{ct.label}</span>
                      <span style={{
                        marginLeft: 'auto', fontFamily: 'var(--mono)', fontSize: 9, padding: '2px 8px', borderRadius: 4,
                        background: card ? `${ct.color}22` : 'var(--surface2)',
                        color: card ? ct.color : 'var(--text4)',
                      }}>
                        {card ? 'AKTİF' : 'KART YOK'}
                      </span>
                    </div>

                    {!card ? (
                      <div style={{ padding: '14px' }}>
                        <button
                          className="btn btn-primary"
                          disabled={busy}
                          onClick={() => issueMut.mutate({ holderId: selected.id, card_type: ct.type })}
                        >
                          {ct.icon} {ct.short.toLocaleLowerCase('tr')} kartı üret
                        </button>
                      </div>
                    ) : (
                      <div style={{ padding: '14px', display: 'flex', flexDirection: 'column', gap: 12 }}>
                        {/* Kod + NFC durumu */}
                        <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
                          <div>
                            <div style={{ fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--text3)', letterSpacing: 1 }}>KOD</div>
                            <div style={{ fontFamily: 'var(--mono)', fontSize: 13, color: 'var(--text)' }}>
                              #{card.code.slice(-6).toLocaleUpperCase('tr')}
                            </div>
                          </div>
                          <div>
                            <div style={{ fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--text3)', letterSpacing: 1 }}>NFC ⌁</div>
                            <div style={{ fontFamily: 'var(--mono)', fontSize: 13, color: card.nfc_uid ? '#16a34a' : 'var(--text4)' }}>
                              {card.nfc_uid || 'bağlı değil'}
                            </div>
                          </div>
                        </div>

                        {/* Aksiyonlar */}
                        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                          <button className="btn btn-xs" style={{ border: '1px solid var(--border)', background: 'var(--surface2)', color: 'var(--text)' }}
                            disabled={busy}
                            onClick={() => downloadPdf(card.id, selected.full_name, ct.short)}>
                            📄 PDF
                          </button>
                          <button className="btn btn-xs" style={{ border: `1px solid ${ct.color}55`, background: `${ct.color}14`, color: ct.color }}
                            disabled={busy}
                            onClick={async () => {
                              if (await confirmDialog({ title: 'Kartı yenile', body: `Mevcut ${ct.label.toLocaleLowerCase('tr')} iptal edilip yeni kod üretilecek. Devam?`, danger: true }))
                                issueMut.mutate({ holderId: selected.id, card_type: ct.type, regenerate: true })
                            }}>
                            ↻ Yenile
                          </button>
                          <button className="btn btn-xs" style={{ border: '1px solid #f59e0b55', background: '#f59e0b14', color: '#b45309' }}
                            disabled={busy}
                            onClick={async () => {
                              if (await confirmDialog({ title: 'Kayıp bildir', body: `${selected.full_name} — ${ct.label.toLocaleLowerCase('tr')} kayıp olarak işaretlensin mi?`, danger: true }))
                                lostMut.mutate(card.id)
                            }}>
                            ⚠ Kayıp
                          </button>
                          <button className="btn btn-xs" style={{ border: '1px solid #ef444455', background: '#ef444414', color: '#dc2626' }}
                            disabled={busy}
                            onClick={async () => {
                              if (await confirmDialog({ title: 'Kartı iptal et', body: `${selected.full_name} — ${ct.label.toLocaleLowerCase('tr')} iptal edilsin mi?`, danger: true }))
                                revokeMut.mutate(card.id)
                            }}>
                            ✕ İptal
                          </button>
                        </div>

                        {/* NFC bağlama — telefonla oku ya da elle gir */}
                        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', borderTop: '1px solid var(--border)', paddingTop: 12 }}>
                          {NFC_SUPPORTED && (
                            <button className="btn btn-xs btn-primary"
                              disabled={busy || nfcScanning === card.id}
                              onClick={() => scanNfc(card.id)}>
                              {nfcScanning === card.id ? '📱 Kartı yaklaştır…' : '📱 NFC OKU'}
                            </button>
                          )}
                          <input
                            className="form-input"
                            placeholder="veya NFC UID elle gir"
                            value={nfcDraft[card.id] ?? ''}
                            onChange={e => setNfcDraft(d => ({ ...d, [card.id]: e.target.value }))}
                            style={{ flex: 1, minWidth: 160, fontSize: 12, fontFamily: 'var(--mono)' }}
                          />
                          <button className="btn btn-xs"
                            style={{ border: '1px solid var(--border)', background: 'var(--surface2)', color: 'var(--text)' }}
                            disabled={busy || !(nfcDraft[card.id] || '').trim()}
                            onClick={() => bindMut.mutate({ id: card.id, nfc_uid: nfcDraft[card.id].trim() })}>
                            {card.nfc_uid ? '⌁ Değiştir' : '⌁ Bağla'}
                          </button>
                        </div>

                        {/* Kart fotoğrafı — telefonla çek / referans */}
                        <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap', borderTop: '1px solid var(--border)', paddingTop: 12 }}>
                          {card.photo_url ? (
                            <a href={card.photo_url} target="_blank" rel="noreferrer">
                              <img src={card.photo_url} alt="Kart" style={{ width: 56, height: 36, objectFit: 'cover', borderRadius: 6, border: '1px solid var(--border)' }} />
                            </a>
                          ) : (
                            <span style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--text4)' }}>foto yok</span>
                          )}
                          <label className="btn btn-xs" style={{ border: '1px solid var(--border)', background: 'var(--surface2)', color: 'var(--text)', cursor: 'pointer' }}>
                            📷 {card.photo_url ? 'Foto değiştir' : 'Foto çek'}
                            <input
                              type="file" accept="image/*" capture="environment" hidden
                              disabled={photoMut.isPending}
                              onChange={e => { const f = e.target.files?.[0]; if (f) photoMut.mutate({ id: card.id, file: f }); e.target.value = '' }}
                            />
                          </label>
                        </div>
                      </div>
                    )}
                  </div>
                )
              })}

              <div style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--text4)' }}>
                Faz 2: NFC istasyon okutma & foto — kart bağlandığında turnike/istasyon erişimi bu UID ile çalışır.
              </div>
            </div>
          </div>
        ) : (
          <div className="panel fade-up-2" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '200px' }}>
            <span style={{ fontFamily: 'var(--mono)', fontSize: '12px', color: 'var(--text4)' }}>
              Soldaki listeden bir çalışan seçin
            </span>
          </div>
        )}
      </div>
    </div>
  )
}
