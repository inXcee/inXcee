import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import api from '../../shared/api/client.js'
import { BLOCKS } from '../../shared/blocks.js'

// Oda QR kodları — yönetim ekranı.
//
// QR altyapısı ve sakinin gördüğü portal yazılmıştı ama yöneticinin göreceği
// hiçbir ekran yoktu: kodlar üretildi, kimse nerede olduklarını göremedi,
// basacak bir çıktı da yoktu.
//
// Buradaki iş üç şey: kapsamı görmek, eksikleri üretmek, basmak.
//
// Baskı blok blok yapılır — 1078 etiketin tamamı tek dosyada ~11 saniye sürer
// ve 6 MB olur. Bu ekran filtreyi öne koyar, "hepsini bas" bilinçli bir seçim.

const TIPLER = [
  { value: '', label: 'Tüm konum tipleri' },
  { value: 'room', label: 'Odalar' },
  { value: 'common_area', label: 'Ortak alanlar' },
]

function Kutu({ etiket, deger, alt, renk }) {
  return (
    <div style={{ border: '1px solid var(--border)', borderRadius: 10, padding: '10px 14px', minWidth: 0 }}>
      <div style={{ fontFamily: 'var(--mono)', fontSize: 9, letterSpacing: 1, color: 'var(--text3)' }}>{etiket}</div>
      <div style={{ fontFamily: 'var(--mono)', fontSize: 20, color: renk || 'var(--text)' }}>{deger}</div>
      {alt && <div style={{ fontSize: 10, color: 'var(--text3)' }}>{alt}</div>}
    </div>
  )
}

export default function QrCodesPage() {
  const qc = useQueryClient()
  const [blok, setBlok] = useState('')
  const [kat, setKat] = useState('')
  const [tip, setTip] = useState('')
  const [indiriliyor, setIndiriliyor] = useState(false)
  const [hata, setHata] = useState('')

  const filtre = useMemo(() => ({
    ...(blok ? { block: blok } : {}),
    ...(kat ? { floor: kat } : {}),
    ...(tip ? { type: tip } : {}),
  }), [blok, kat, tip])

  const kapsam = useQuery({
    queryKey: ['qr-coverage'],
    queryFn: () => api.get('/location-portal/coverage').then(r => r.data),
  })

  const liste = useQuery({
    queryKey: ['qr-locations', filtre],
    queryFn: () => api.get('/location-portal/locations', { params: { ...filtre, limit: 200 } }).then(r => r.data),
  })

  const ayarlar = useQuery({
    queryKey: ['portal-settings'],
    queryFn: () => api.get('/location-portal/settings').then(r => r.data),
  })

  const uretMut = useMutation({
    mutationFn: () => api.post('/location-portal/locations/generate-missing', filtre).then(r => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['qr-coverage'] })
      qc.invalidateQueries({ queryKey: ['qr-locations'] })
    },
    onError: e => setHata(e?.response?.data?.error || 'QR üretilemedi'),
  })

  // PDF'i api istemcisiyle indiriyoruz ki Authorization başlığı gitsin;
  // düz bir <a href> yetki başlığını taşımaz ve 401 döner.
  const pdfIndir = async () => {
    setIndiriliyor(true)
    setHata('')
    try {
      const res = await api.get('/location-portal/qr-sheet.pdf', { params: filtre, responseType: 'blob' })
      const url = URL.createObjectURL(new Blob([res.data], { type: 'application/pdf' }))
      const a = document.createElement('a')
      a.href = url
      a.download = ['qr', blok, kat, tip].filter(Boolean).join('-') + '-etiketleri.pdf'
      a.click()
      URL.revokeObjectURL(url)
    } catch {
      setHata('PDF indirilemedi. Filtreyi daraltıp tekrar deneyin.')
    } finally {
      setIndiriliyor(false)
    }
  }

  const k = kapsam.data || {}
  const eksik = (k.active_locations ?? 0) - (k.locations_with_qr ?? 0)
  const kayitlar = liste.data?.items || []
  const toplam = liste.data?.total ?? 0
  const portalKapali = ayarlar.data && !ayarlar.data.location_portal_enabled

  return (
    <div className="fade-up" style={{ padding: '20px 22px', maxWidth: 1100 }}>
      <h1 style={{ fontFamily: 'var(--display)', fontSize: 20, letterSpacing: 1, margin: '0 0 4px' }}>ODA QR KODLARI</h1>
      <div style={{ fontSize: 12, color: 'var(--text3)', marginBottom: 16 }}>
        Her oda ve ortak alan için bir QR. Sakin okutunca arıza bildirir, anket doldurur.
      </div>

      {/* Portal kapalıyken QR basmak boşa emek: okutan kişi hiçbir şey yapamaz. */}
      {portalKapali && (
        <div style={{
          border: '1px solid rgba(245,158,11,.4)', background: 'rgba(245,158,11,.10)',
          borderRadius: 9, padding: '8px 12px', fontSize: 12, marginBottom: 12,
        }}>
          ⚠ Portal kapalı — QR okutulduğunda hiçbir işlem yapılamaz. Çamaşırhane ayarlarından portalı açın.
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 8, marginBottom: 16 }}>
        <Kutu etiket="AKTİF KONUM" deger={k.active_locations ?? '—'} />
        <Kutu etiket="QR'I OLAN" deger={k.locations_with_qr ?? '—'} renk="var(--green)" />
        <Kutu
          etiket="QR'I OLMAYAN" deger={eksik >= 0 ? eksik : '—'}
          renk={eksik > 0 ? 'var(--red)' : 'var(--green)'}
          alt={eksik > 0 ? 'üretilmesi gerekiyor' : 'hepsi hazır'}
        />
      </div>

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', marginBottom: 12 }}>
        <select className="form-select" aria-label="Blok" value={blok} onChange={e => setBlok(e.target.value)}
          style={{ width: 'auto', fontSize: 12 }}>
          <option value="">Tüm bloklar</option>
          {BLOCKS.map(b => <option key={b.block} value={b.block}>{b.block}</option>)}
        </select>
        <input className="form-input" type="number" min="1" aria-label="Kat" placeholder="Kat"
          value={kat} onChange={e => setKat(e.target.value)} style={{ width: 80, fontSize: 12 }} />
        <select className="form-select" aria-label="Konum tipi" value={tip} onChange={e => setTip(e.target.value)}
          style={{ width: 'auto', fontSize: 12 }}>
          {TIPLER.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
        </select>

        <button className="btn btn-primary btn-sm" disabled={indiriliyor} onClick={pdfIndir}>
          {indiriliyor ? 'Hazırlanıyor…' : '🖨 Etiketleri bas (PDF)'}
        </button>

        {eksik > 0 && (
          <button className="btn btn-ghost btn-sm" disabled={uretMut.isPending} onClick={() => uretMut.mutate()}>
            {uretMut.isPending ? '…' : `Eksik ${eksik} QR'ı üret`}
          </button>
        )}
      </div>

      {/* Filtresiz baskı 1078 etiket / ~11 sn / 6 MB — bilerek seçilsin. */}
      {!blok && !kat && !tip && (
        <div style={{ fontSize: 11, color: 'var(--text3)', marginBottom: 10 }}>
          Filtre seçmezseniz tüm konumlar basılır ({k.active_locations ?? '?'} etiket, ~11 saniye).
          Blok seçerek çok daha hızlı basabilirsiniz.
        </div>
      )}

      {hata && <div style={{ color: 'var(--red)', fontSize: 12, marginBottom: 10 }}>{hata}</div>}
      {uretMut.data && (
        <div style={{ color: 'var(--green)', fontSize: 12, marginBottom: 10 }}>
          {uretMut.data.created} yeni QR üretildi.
        </div>
      )}

      <div style={{ fontFamily: 'var(--mono)', fontSize: 10, letterSpacing: 1, color: 'var(--text3)', marginBottom: 6 }}>
        KONUMLAR {toplam > 0 && `· ${toplam} kayıt`}
      </div>

      {liste.isPending && <div style={{ fontSize: 12, color: 'var(--text3)' }}>Yükleniyor…</div>}
      {liste.isError && (
        <div style={{ fontSize: 12, color: 'var(--red)' }}>
          Konumlar alınamadı — {liste.error?.response?.data?.error || liste.error?.message}
        </div>
      )}

      {liste.data && kayitlar.length === 0 && (
        <div style={{ fontSize: 12, color: 'var(--text3)' }}>Bu filtreye uyan konum yok.</div>
      )}

      {kayitlar.length > 0 && (
        <div style={{ display: 'grid', gap: 2, maxHeight: 420, overflowY: 'auto' }}>
          {kayitlar.map(item => (
            <div key={item.id} style={{
              display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap',
              padding: '5px 0', borderTop: '1px dashed var(--border)', fontSize: 12,
            }}>
              <strong style={{ minWidth: 170 }}>{item.display_name}</strong>
              <span style={{ color: 'var(--text3)', flex: '1 1 100px' }}>
                {[item.block, item.floor != null ? `Kat ${item.floor}` : null].filter(Boolean).join(' · ')}
              </span>
              <span style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--text3)' }}>
                {item.location_type === 'room' ? 'oda' : 'ortak alan'}
              </span>
              {/* QR'ı olmayan konum baskıda sessizce eksik kalır. */}
              <span style={{ fontFamily: 'var(--mono)', fontSize: 10, color: item.token ? 'var(--green)' : 'var(--red)' }}>
                {item.token ? 'QR var' : 'QR YOK'}
              </span>
            </div>
          ))}
          {toplam > kayitlar.length && (
            <div style={{ fontSize: 10, color: 'var(--text3)' }}>
              +{toplam - kayitlar.length} konum daha — baskı filtrenin tamamını kapsar, bu liste ilk 200'ü gösterir.
            </div>
          )}
        </div>
      )}
    </div>
  )
}
