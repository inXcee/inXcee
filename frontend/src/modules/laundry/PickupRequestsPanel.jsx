import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import api from '../../shared/api/client.js'

// Oda QR'ından gelen çamaşır alma talepleri.
//
// Bu panel somut bir boşluktan doğdu: Faz 5 talebi oluşturup çamaşırhaneye
// bildirim atıyordu ama talebi GÖRECEK ekran yoktu. Sakin "talebiniz iletildi"
// makbuzu alıyor, zil çalıyor, sonrası boşluktu.
//
// Kapatmanın ikinci işlevi var: oda başına tek açık talep kısıtı (kısmi UNIQUE
// index) yüzünden talep kapatılmazsa o oda bir daha "yeni" talep açamaz —
// hepsi eski kayda birleşir. Yani kapatmak, sakinin bir sonraki isteğinin
// görünmesini de sağlıyor.

// Bekleme süresi: "2 saat önce" demek "14:05'te" demekten daha eyleme dönük.
export function bekleme(isoTarih, simdi = Date.now()) {
  if (!isoTarih) return { metin: 'zaman bilinmiyor', acil: false }
  const t = new Date(String(isoTarih).replace(' ', 'T') + (String(isoTarih).endsWith('Z') ? '' : 'Z')).getTime()
  if (!Number.isFinite(t)) return { metin: 'zaman bilinmiyor', acil: false }
  const dk = Math.max(0, Math.round((simdi - t) / 60000))
  if (dk < 60) return { metin: `${dk} dk önce`, acil: false }
  const saat = Math.floor(dk / 60)
  if (saat < 24) return { metin: `${saat} saat önce`, acil: saat >= 8 }
  return { metin: `${Math.floor(saat / 24)} gün önce`, acil: true }
}

export default function PickupRequestsPanel() {
  const qc = useQueryClient()
  const [kapatilan, setKapatilan] = useState(null)
  const [gerekce, setGerekce] = useState('')

  const talepler = useQuery({
    queryKey: ['laundry-pickup-requests'],
    queryFn: () => api.get('/laundry/pickup-requests').then(r => r.data),
    refetchInterval: 60_000,
  })

  const kapat = useMutation({
    mutationFn: ({ id, status, reason }) =>
      api.post(`/laundry/pickup-requests/${id}/close`, { status, reason }).then(r => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['laundry-pickup-requests'] })
      setKapatilan(null); setGerekce('')
    },
  })

  const d = talepler.data
  // Okunamayan liste "talep yok" diye okunmamalı.
  if (d?.available === false) {
    return (
      <div style={{ border: '1px solid rgba(220,38,38,.4)', background: 'rgba(220,38,38,.08)', borderRadius: 10, padding: '10px 13px', fontSize: 12.5, marginBottom: 14 }}>
        {d.reason}
      </div>
    )
  }
  const items = d?.items || []
  if (!items.length) return null   // talep yoksa yer kaplamasın

  return (
    <section style={{ border: '1px solid rgba(14,165,233,.45)', background: 'rgba(14,165,233,.07)', borderRadius: 12, padding: 14, marginBottom: 16 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap', marginBottom: 4 }}>
        <strong style={{ fontSize: 13.5 }}>Odadan gelen çamaşır talepleri</strong>
        <span style={{ fontFamily: 'var(--mono)', fontSize: 18 }}>{items.length}</span>
        <span style={{ fontSize: 11, color: 'var(--text3)', marginLeft: 'auto' }}>
          Sakin QR okutup istedi — torba henüz teslim alınmadı
        </span>
      </div>

      <div style={{ display: 'grid', gap: 8, marginTop: 10 }}>
        {items.map(t => {
          const b = bekleme(t.created_at)
          return (
            <div key={t.id} style={{
              border: '1px solid var(--border)', background: 'var(--bg)', borderRadius: 10,
              padding: '9px 12px', display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap', fontSize: 12.5,
            }}>
              <strong style={{ minWidth: 140 }}>{t.display_name}</strong>
              {t.resident_name && <span style={{ color: 'var(--text3)' }}>{t.resident_name}</span>}
              {t.bag_estimate ? <span>~{t.bag_estimate} torba</span> : null}
              {t.request_count > 1 && (
                <span style={{ color: '#b45309' }}>{t.request_count} kez istendi</span>
              )}
              <span style={{ color: b.acil ? '#dc2626' : 'var(--text3)' }}>{b.metin}</span>
              {t.note && <span style={{ color: 'var(--text3)', flex: '1 1 160px' }}>“{t.note}”</span>}

              <span style={{ marginLeft: 'auto', display: 'flex', gap: 6 }}>
                <button
                  type="button"
                  disabled={kapat.isPending}
                  onClick={() => kapat.mutate({ id: t.id, status: 'collected' })}
                  style={{ border: '1px solid var(--border)', background: 'transparent', color: 'var(--text)', borderRadius: 7, padding: '4px 11px', fontSize: 11.5, cursor: 'pointer', minHeight: 32 }}
                >
                  Torbayı aldım
                </button>
                <button
                  type="button"
                  onClick={() => { setKapatilan(kapatilan === t.id ? null : t.id); setGerekce('') }}
                  style={{ border: '1px solid var(--border)', background: 'transparent', color: '#b45309', borderRadius: 7, padding: '4px 11px', fontSize: 11.5, cursor: 'pointer', minHeight: 32 }}
                >
                  İptal
                </button>
              </span>

              {kapatilan === t.id && (
                <div style={{ flexBasis: '100%', display: 'flex', gap: 6, marginTop: 6 }}>
                  <input
                    value={gerekce}
                    onChange={e => setGerekce(e.target.value)}
                    placeholder="İptal gerekçesi (örn. sakin vazgeçti)"
                    aria-label="İptal gerekçesi"
                    style={{ flex: 1, background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 7, padding: '6px 9px', fontSize: 12, color: 'var(--text)' }}
                  />
                  <button
                    type="button"
                    disabled={!gerekce.trim() || kapat.isPending}
                    onClick={() => kapat.mutate({ id: t.id, status: 'cancelled', reason: gerekce.trim() })}
                    style={{ border: '1px solid #b45309', background: '#b45309', color: '#fff', borderRadius: 7, padding: '4px 12px', fontSize: 11.5, cursor: 'pointer' }}
                  >
                    İptal et
                  </button>
                </div>
              )}
            </div>
          )
        })}
      </div>

      {kapat.isError && (
        <div style={{ fontSize: 11.5, color: '#dc2626', marginTop: 8 }}>
          {kapat.error?.response?.data?.error || 'Talep kapatılamadı'}
        </div>
      )}
      <div style={{ fontSize: 10.5, color: 'var(--text3)', marginTop: 8 }}>
        Talebi kapatmak torbayı teslim almak DEĞİLDİR — torba fiziksel olarak alınırken kart, imza ve
        gerekçe kuralları ayrıca uygulanır. Kapatmazsanız o oda yeni talep açamaz.
      </div>
    </section>
  )
}
