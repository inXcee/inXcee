import { useMemo, useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import api from '../../shared/api/client.js'
import { confirmDialog } from '../../shared/components/ConfirmDialog.jsx'
import { SkeletonTable } from '../../shared/components/Skeleton.jsx'

const ACCENT = '#0f9f9a'

function activeCard(resident) {
  if (!resident?.laundry_id) return null
  return {
    id: resident.laundry_id,
    code: resident.laundry_code,
    nfc_uid: resident.laundry_nfc,
  }
}

function downloadBlob(data, fileName) {
  const url = URL.createObjectURL(new Blob([data], { type: 'application/pdf' }))
  const link = document.createElement('a')
  link.href = url
  link.download = fileName
  link.click()
  URL.revokeObjectURL(url)
}

export default function ResidentLaundryCardsPanel({ roster, isLoading, onChanged, showToast }) {
  const [search, setSearch] = useState('')
  const [selectedId, setSelectedId] = useState(null)
  const [nfcDraft, setNfcDraft] = useState('')

  const selected = useMemo(() => roster.find(row => row.id === selectedId) || null, [roster, selectedId])
  const filtered = useMemo(() => {
    const query = search.trim().toLocaleLowerCase('tr')
    if (!query) return roster
    return roster.filter(row => `${row.full_name} ${row.company || ''} ${row.block || ''} ${row.room_no || ''}`.toLocaleLowerCase('tr').includes(query))
  }, [roster, search])
  const issued = roster.filter(row => row.laundry_id).length
  const nfcBound = roster.filter(row => row.laundry_nfc).length
  const missing = roster.length - issued

  const issue = useMutation({
    mutationFn: ({ residentId, regenerate = false }) => api.post(`/cards/personnel/${residentId}/issue`, { card_type: 'laundry', regenerate }),
    onSuccess: (_response, variables) => { onChanged(); showToast(variables.regenerate ? 'Çamaşır kartı yenilendi' : 'Çamaşır kartı üretildi') },
    onError: error => showToast(error.response?.data?.error || 'Kart üretilemedi', 'error'),
  })
  const changeStatus = useMutation({
    mutationFn: ({ cardId, action }) => api.patch(`/cards/${cardId}/${action}`),
    onSuccess: (_response, variables) => { onChanged(); setSelectedId(null); showToast(variables.action === 'report-lost' ? 'Kart kayıp işaretlendi' : 'Kart iptal edildi') },
    onError: error => showToast(error.response?.data?.error || 'Kart güncellenemedi', 'error'),
  })
  const bindNfc = useMutation({
    mutationFn: ({ cardId, uid }) => api.patch(`/cards/${cardId}/bind-nfc`, { nfc_uid: uid }),
    onSuccess: () => { onChanged(); setNfcDraft(''); showToast('NFC etiketi bağlandı') },
    onError: error => showToast(error.response?.data?.error || 'NFC bağlanamadı', 'error'),
  })
  const bulkIssue = useMutation({
    mutationFn: () => api.post('/cards/bulk-issue', { holder_type: 'personnel', card_type: 'laundry' }),
    onSuccess: response => { onChanged(); showToast(`${response.data.generated} eksik çamaşır kartı üretildi`) },
    onError: error => showToast(error.response?.data?.error || 'Toplu üretim başarısız', 'error'),
  })

  async function pdf(cardId, name) {
    try {
      const response = await api.get(`/cards/${cardId}/pdf`, { responseType: 'blob' })
      downloadBlob(response.data, `camasir-${(name || 'kart').replace(/\s+/g, '_')}.pdf`)
    } catch { showToast('PDF üretilemedi', 'error') }
  }

  async function batchPdf() {
    try {
      const response = await api.get('/cards/batch-pdf?card_type=laundry', { responseType: 'blob' })
      downloadBlob(response.data, 'toplu-camasir-kartlari.pdf')
    } catch { showToast('Toplu PDF üretilemedi', 'error') }
  }

  const card = activeCard(selected)
  const busy = issue.isPending || changeStatus.isPending || bindNfc.isPending

  return (
    <div className="fade-up-1">
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 10, marginBottom: 14 }}>
        <Metric label="AKTİF ODALI SAKİN" value={roster.length} sub="kart kapsamına dahil" />
        <Metric label="AKTİF KART" value={issued} sub={roster.length ? `%${Math.round((issued / roster.length) * 100)} kapsam` : '%0 kapsam'} color={ACCENT} />
        <Metric label="NFC BAĞLI" value={nfcBound} sub={`${issued - nfcBound} kartta NFC yok`} color="#16a34a" />
        <Metric label="EKSİK KART" value={missing} sub="toplu üretilebilir" color={missing ? '#dc2626' : '#16a34a'} />
      </div>

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 14 }}>
        <button className="btn btn-xs" disabled={!missing || bulkIssue.isPending} onClick={async () => {
          if (await confirmDialog({ title: 'Eksik kartları üret', body: `${missing} aktif odalı sakine çamaşır kartı üretilecek. Devam edilsin mi?` })) bulkIssue.mutate()
        }} style={{ border: `1px solid ${ACCENT}55`, background: `${ACCENT}14`, color: ACCENT }}>
          🪪 Eksik kartları üret ({missing})
        </button>
        <button className="btn btn-xs" disabled={!issued} onClick={batchPdf} style={{ border: '1px solid var(--border)', background: 'var(--surface2)', color: 'var(--text)' }}>
          📄 Toplu PDF ({issued})
        </button>
      </div>

      <div className="layout-list-detail" style={{ display: 'grid', gridTemplateColumns: 'minmax(280px, 360px) 1fr', gap: 16, alignItems: 'start' }}>
        <div className="panel">
          <div style={{ height: 2, background: ACCENT }} />
          <div className="panel-header"><div className="panel-title">SAKİNLER</div><span style={muted}>{roster.length} kayıt</span></div>
          <div style={{ padding: 10, borderBottom: '1px solid var(--border)' }}>
            <input className="form-input" aria-label="Sakin çamaşır kartı ara" placeholder="İsim, şirket, blok veya oda ara…" value={search} onChange={event => setSearch(event.target.value)} />
          </div>
          <div style={{ maxHeight: 'calc(100vh - 390px)', overflowY: 'auto' }}>
            {isLoading ? <SkeletonTable rows={8} cols={3} /> : filtered.length === 0 ? <div style={{ padding: 18, ...muted }}>Aktif odalı sakin bulunamadı</div> : filtered.map(resident => (
              <button key={resident.id} type="button" onClick={() => { setSelectedId(resident.id); setNfcDraft('') }} style={{
                width: '100%', textAlign: 'left', padding: '11px 14px', cursor: 'pointer', border: 'none', borderBottom: '1px solid var(--border)',
                borderLeft: selectedId === resident.id ? `3px solid ${ACCENT}` : '3px solid transparent',
                background: selectedId === resident.id ? `${ACCENT}12` : 'transparent', color: 'var(--text)',
              }}>
                <div style={{ fontSize: 13, fontWeight: 600 }}>{resident.full_name}</div>
                <div style={{ ...muted, marginTop: 3 }}>{resident.company || 'Şirket yok'} · {resident.block}/{resident.room_no}</div>
                <div style={{ marginTop: 5, fontSize: 10, color: resident.laundry_id ? ACCENT : '#dc2626', fontFamily: 'var(--mono)' }}>
                  {resident.laundry_id ? `● KART${resident.laundry_nfc ? ' · NFC BAĞLI' : ' · NFC YOK'}` : '○ KART YOK'}
                </div>
              </button>
            ))}
          </div>
        </div>

        <div className="panel" style={{ minHeight: 240 }}>
          {!selected ? <div style={{ padding: 30, textAlign: 'center', ...muted }}>Kart işlemleri için bir sakin seçin</div> : (
            <>
              <div style={{ height: 2, background: `linear-gradient(90deg, ${ACCENT}, #22c55e)` }} />
              <div className="panel-header">
                <div><div className="panel-title">{selected.full_name.toLocaleUpperCase('tr')}</div><div style={{ ...muted, marginTop: 4 }}>{selected.company || 'Şirket yok'} · {selected.block}/{selected.room_no}</div></div>
                <span style={{ ...muted, color: card ? ACCENT : '#dc2626' }}>{card ? 'AKTİF KART' : 'KART YOK'}</span>
              </div>
              <div className="panel-body">
                {!card ? <button className="btn btn-primary" disabled={busy} onClick={() => issue.mutate({ residentId: selected.id })}>🪪 Çamaşır kartı üret</button> : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                    <div style={{ display: 'flex', gap: 28, flexWrap: 'wrap' }}>
                      <Info label="KART KODU" value={`#${card.code.slice(-6).toUpperCase()}`} />
                      <Info label="NFC" value={card.nfc_uid || 'bağlı değil'} color={card.nfc_uid ? '#16a34a' : 'var(--text4)'} />
                    </div>
                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                      <button className="btn btn-xs" disabled={busy} onClick={() => pdf(card.id, selected.full_name)}>📄 Tekli PDF</button>
                      <button className="btn btn-xs" disabled={busy} onClick={async () => {
                        if (await confirmDialog({ title: 'Kartı yenile', body: 'Mevcut kart iptal edilip yeni AVS-C kodu üretilecek. Devam edilsin mi?', danger: true })) issue.mutate({ residentId: selected.id, regenerate: true })
                      }}>↻ Yenile</button>
                      <button className="btn btn-xs" disabled={busy} onClick={async () => {
                        if (await confirmDialog({ title: 'Kayıp bildir', body: `${selected.full_name} kartı kayıp işaretlensin mi?`, danger: true })) changeStatus.mutate({ cardId: card.id, action: 'report-lost' })
                      }}>⚠ Kayıp</button>
                      <button className="btn btn-xs" disabled={busy} onClick={async () => {
                        if (await confirmDialog({ title: 'Kartı iptal et', body: 'Bu kart bir daha kullanılamayacak. Devam edilsin mi?', danger: true })) changeStatus.mutate({ cardId: card.id, action: 'revoke' })
                      }}>✕ İptal</button>
                    </div>
                    <div style={{ borderTop: '1px solid var(--border)', paddingTop: 12 }}>
                      <label className="form-label" htmlFor="resident-laundry-nfc">NFC UID {card.nfc_uid ? 'DEĞİŞTİR' : 'BAĞLA'}</label>
                      <div style={{ display: 'flex', gap: 8 }}>
                        <input id="resident-laundry-nfc" className="form-input" value={nfcDraft} onChange={event => setNfcDraft(event.target.value)} placeholder="USB okuyucuyla okutun veya UID girin" />
                        <button className="btn btn-primary" disabled={busy || !nfcDraft.trim()} onClick={() => bindNfc.mutate({ cardId: card.id, uid: nfcDraft.trim() })}>Bağla</button>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

function Metric({ label, value, sub, color = 'var(--text)' }) {
  return <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: 14 }}><div style={muted}>{label}</div><div style={{ fontFamily: 'var(--display)', fontSize: 24, color, marginTop: 4 }}>{value}</div><div style={{ ...muted, marginTop: 2 }}>{sub}</div></div>
}

function Info({ label, value, color = 'var(--text)' }) {
  return <div><div style={muted}>{label}</div><div style={{ fontFamily: 'var(--mono)', fontSize: 13, color, marginTop: 3 }}>{value}</div></div>
}

const muted = { fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--text3)' }
