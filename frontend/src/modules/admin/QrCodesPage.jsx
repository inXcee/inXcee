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
// Baskı blok blok yapılır. Süre SUNUCUDA ölçüldü (CX22, 2 çekirdek): etiket
// başına ~37 ms. 1078 etiketin tamamı ~40 saniye ve 7 MB. Geliştirme
// makinesinde 4 kat hızlıydı — oradaki ölçüme göre "11 saniye" yazmak
// kullanıcıya yalan söylemek olurdu.

// Sunucuda ölçülen etiket başına süre. Tahmini buradan üretiyoruz ki konum
// sayısı değişince metin de kendiliğinden doğru kalsın.
const MS_PER_ETIKET = 37

function sureTahmini(adet) {
  const sn = Math.round((adet || 0) * MS_PER_ETIKET / 1000)
  if (sn < 60) return `~${sn} saniye`
  return `~${Math.ceil(sn / 60)} dakika`
}

const kucukDugme = {
  border: '1px solid var(--border)', background: 'transparent', color: 'var(--text)',
  borderRadius: 6, padding: '1px 7px', fontSize: 10, cursor: 'pointer',
}

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

  // Tekli etiket indirme. api istemcisi kullanilir ki Authorization gitsin.
  const tekliIndir = async (item, bicim) => {
    setHata('')
    try {
      const res = await api.get(`/location-portal/locations/${item.id}/label.${bicim}`, { responseType: 'blob' })
      const tur = bicim === 'pdf' ? 'application/pdf' : bicim === 'svg' ? 'image/svg+xml' : 'image/png'
      const url = URL.createObjectURL(new Blob([res.data], { type: tur }))
      const a = document.createElement('a')
      a.href = url
      a.download = `${item.display_name.replace(/[^\p{L}\p{N}]+/gu, '-')}.${bicim}`
      a.click()
      URL.revokeObjectURL(url)
    } catch (e) {
      setHata(e?.response?.status === 409
        ? 'Bu konumun aktif QR kodu yok — önce QR üretin.'
        : 'Etiket indirilemedi.')
    }
  }

  // Token döndürmek/iptal etmek kapıdaki kâğıdı ÖLDÜRÜR. Sessizce yapılmamalı.
  const tokenIslem = async (item, islem) => {
    const soru = islem === 'rotate'
      ? `${item.display_name} için yeni QR üretilsin mi? Kapıdaki etiket çalışmaz hâle gelir ve yeniden basılması gerekir.`
      : `${item.display_name} QR'ı iptal edilsin mi? Kapıdaki etiket çalışmaz hâle gelir ve yerine yenisi ÜRETİLMEZ.`
    if (!window.confirm(soru)) return
    setHata('')
    try {
      await api.post(`/location-portal/locations/${item.id}/${islem}`, { reason: 'admin' })
      qc.invalidateQueries({ queryKey: ['qr-locations'] })
      qc.invalidateQueries({ queryKey: ['qr-coverage'] })
    } catch (e) {
      setHata(e?.response?.data?.error || 'İşlem başarısız')
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
          {indiriliyor ? 'Hazırlanıyor, bekleyin…' : '🖨 Etiketleri bas (PDF)'}
        </button>

        {eksik > 0 && (
          <button className="btn btn-ghost btn-sm" disabled={uretMut.isPending} onClick={() => uretMut.mutate()}>
            {uretMut.isPending ? '…' : `Eksik ${eksik} QR'ı üret`}
          </button>
        )}
      </div>

      {/* Filtresiz baskı bütün kampüsü kapsar — süre sunucu ölçümünden hesaplanır. */}
      {!blok && !kat && !tip && (
        <div style={{ fontSize: 11, color: 'var(--text3)', marginBottom: 10 }}>
          Filtre seçmezseniz tüm konumlar basılır: {k.active_locations ?? '?'} etiket,{' '}
          {Math.ceil((k.active_locations ?? 0) / 12)} sayfa, {sureTahmini(k.active_locations)}.
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
              {/* Tekli etiket: kâğıt yırtıldığında 135 sayfalık föyü yeniden
                  basmamak için. Üç biçim de aynı kaynaktan üretilir. */}
              {item.token && (
                <span style={{ display: 'flex', gap: 4 }}>
                  {['pdf', 'svg', 'png'].map(bicim => (
                    <button
                      key={bicim} type="button" style={kucukDugme}
                      onClick={() => tekliIndir(item, bicim)}
                    >
                      {bicim.toUpperCase()}
                    </button>
                  ))}
                  <button
                    type="button" style={kucukDugme}
                    title="Token yenilenir; kapıdaki etiket geçersiz olur ve yeniden basılmalıdır"
                    onClick={() => tokenIslem(item, 'rotate')}
                  >
                    Döndür
                  </button>
                  <button
                    type="button" style={{ ...kucukDugme, color: 'var(--red)' }}
                    title="QR iptal edilir; kapıdaki etiket çalışmaz hâle gelir"
                    onClick={() => tokenIslem(item, 'revoke')}
                  >
                    İptal
                  </button>
                </span>
              )}
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
