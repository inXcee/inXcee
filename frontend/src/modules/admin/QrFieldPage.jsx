import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import api from '../../shared/api/client.js'
import { BLOCKS } from '../../shared/blocks.js'
import QrScannerModal from '../../shared/components/QrScannerModal.jsx'
import {
  elleIsaretUyarisi,
  sahaIlerleme,
  sahaKuyrugu,
  taramaSonucu,
  tokenAyikla,
} from './logic/qrField.js'

// Saha dağıtımı — koridoru gezen görevlinin ekranı.
//
// Faz 7 dürüst bir ölçüm kurdu ("kayıt yoksa kurulmadı denmez") ama bilinmeyeni
// ÇÖZMENİN yolunu bırakmadı: kampüsteki 1078 konum "bilinmiyor" kovasında
// donup kaldı, kapsama oranı hep "ölçülemiyor" dedi. Bu ekran o boşluğu
// kapatıyor.
//
// Telefonda, tek elle, koridorda kullanılacak: büyük hedef alanlar, tek
// sıradaki konum, kameradan okutma, ve yanlış kapı çıkarsa görevliyi suçlamayan
// net bir talimat.

const RENK = {
  basari: '#0f766e', uyusmazlik: '#dc2626', bayat: '#b45309',
  taninmiyor: '#7c3aed', hata: '#dc2626',
}

const DURUM_ETIKET = {
  unknown: 'Durum bilinmiyor — doğrula',
  printed: 'Basıldı, asıldığı kaydedilmedi',
  installed: 'Asıldı, yerinde doğrulanmadı',
  stale: 'Bayat — yeni etiket gerekli',
  damaged: 'Hasarlı',
  removed: 'Kaldırılmış',
  qr_missing: 'QR üretilmemiş',
}

const dugme = (birincil, renk) => ({
  border: `1px solid ${renk || (birincil ? 'var(--accent)' : 'var(--border)')}`,
  background: birincil ? (renk || 'var(--accent)') : 'transparent',
  color: birincil ? '#fff' : (renk || 'var(--text)'),
  borderRadius: 12,
  padding: '14px 18px',
  fontSize: 15,
  fontWeight: 600,
  cursor: 'pointer',
  minHeight: 52,          // parmakla basılacak: 48px altına inilmiyor
  width: '100%',
})

const alan = {
  background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 10,
  padding: '10px 12px', color: 'var(--text)', fontSize: 15, minHeight: 46, width: '100%',
}

export default function QrFieldPage() {
  const qc = useQueryClient()
  const [blok, setBlok] = useState('')
  const [kat, setKat] = useState('')
  const [tarayiciAcik, setTarayiciAcik] = useState(false)
  const [sonuc, setSonuc] = useState(null)
  const [atlanan, setAtlanan] = useState(() => new Set())
  const [elleToken, setElleToken] = useState('')

  const rapor = useQuery({
    queryKey: ['qr-deployments', { block: blok, floor: kat }],
    queryFn: () => api.get('/location-portal/deployments', {
      params: { ...(blok ? { block: blok } : {}), ...(kat ? { floor: kat } : {}) },
    }).then(r => r.data),
  })

  const items = rapor.data?.items || []
  const kuyruk = useMemo(
    () => sahaKuyrugu(items, { block: blok, floor: kat }).filter(i => !atlanan.has(i.location_id)),
    [items, blok, kat, atlanan],
  )
  const siradaki = kuyruk[0] || null
  const ilerleme = sahaIlerleme(items, { block: blok, floor: kat })

  const tazele = () => qc.invalidateQueries({ queryKey: ['qr-deployments'] })

  const dogrula = useMutation({
    mutationFn: ({ token, locationId }) => api.post('/location-portal/deployments/verify', {
      token, ...(locationId ? { expected_location_id: locationId } : {}),
    }).then(r => r.data),
    onSuccess: (d) => { setSonuc(taramaSonucu(d, siradaki)); tazele() },
    onError: (e) => { setSonuc(taramaSonucu(e?.response?.data, siradaki)); tazele() },
  })

  const elleAsildi = useMutation({
    mutationFn: (locationId) => api.post('/location-portal/deployments/install', {
      location_ids: [locationId],
    }).then(r => r.data),
    onSuccess: (d) => {
      // Aktif QR yoksa satır hiç yazılmaz; sessizce "tamam" demek yalan olurdu.
      setSonuc(d.skipped_no_active_qr?.length
        ? { tur: 'hata', baslik: 'İşaretlenemedi', detay: 'Bu konumun aktif QR kodu yok — önce QR üretilmeli.', ilerle: false }
        : { tur: 'basari', baslik: 'Asıldı olarak kaydedildi', detay: 'Yerinde doğrulanmış sayılmaz; fırsat olunca okutun.', ilerle: true })
      tazele()
    },
    onError: () => setSonuc({ tur: 'hata', baslik: 'Kaydedilemedi', detay: 'Bağlantıyı kontrol edin', ilerle: false }),
  })

  const okutuldu = (metin) => {
    const token = tokenAyikla(metin)
    if (!token) {
      setSonuc({ tur: 'taninmiyor', baslik: 'Okunamadı', detay: 'Bu bir QR etiketi gibi görünmüyor. Tekrar deneyin.', ilerle: false })
      return
    }
    setSonuc(null)
    dogrula.mutate({ token, locationId: siradaki?.location_id })
  }

  const katSayisi = blok ? (BLOCKS.find(b => b.block === blok)?.floors || 0) : 0
  const katlar = Array.from({ length: katSayisi }, (_, i) => i + 1)

  return (
    <div className="fade-up" style={{ padding: '16px 14px', maxWidth: 560, margin: '0 auto' }}>
      <h1 style={{ fontFamily: 'var(--display)', fontSize: 18, letterSpacing: 1, margin: '0 0 4px' }}>
        SAHA DAĞITIMI
      </h1>
      <div style={{ fontSize: 12, color: 'var(--text3)', marginBottom: 14 }}>
        Koridoru gezerken kapıdaki etiketi okutun. Yanlış kapıya asılmış etiketi sistem yakalar.
      </div>

      {/* Kapsam seçimi */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
        <select value={blok} onChange={e => { setBlok(e.target.value); setKat(''); setAtlanan(new Set()) }}
          style={alan} aria-label="Blok">
          <option value="">Tüm bloklar</option>
          {BLOCKS.map(b => <option key={b.block} value={b.block}>{b.displayName || b.block}</option>)}
        </select>
        <select value={kat} onChange={e => { setKat(e.target.value); setAtlanan(new Set()) }}
          style={alan} aria-label="Kat" disabled={!blok}>
          <option value="">Tüm katlar</option>
          {katlar.map(f => <option key={f} value={f}>{f}. kat</option>)}
        </select>
      </div>

      {/* İlerleme — payda açıkça yazılı */}
      {ilerleme.measurable ? (
        <div style={{ marginBottom: 14 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 5 }}>
            <span>{ilerleme.label}</span>
            <span style={{ color: 'var(--text3)' }}>
              {ilerleme.unknown > 0 ? `${ilerleme.unknown} konum hiç kaydedilmemiş` : 'hepsi kayıtlı'}
            </span>
          </div>
          <div style={{ height: 8, borderRadius: 4, background: 'var(--border)', overflow: 'hidden' }}>
            <div style={{ width: `${ilerleme.percent}%`, height: '100%', background: RENK.basari }} />
          </div>
        </div>
      ) : (
        <div style={{ fontSize: 12, color: 'var(--text3)', marginBottom: 14 }}>{ilerleme.reason}</div>
      )}

      {rapor.data?.available === false && (
        <div style={{ color: RENK.hata, fontSize: 13, marginBottom: 12 }}>{rapor.data.reason}</div>
      )}

      {/* Tarama sonucu — en görünür yer */}
      {sonuc && (
        <div style={{
          border: `2px solid ${RENK[sonuc.tur]}`, background: `${RENK[sonuc.tur]}14`,
          borderRadius: 14, padding: '13px 15px', marginBottom: 14,
        }} role="status">
          <strong style={{ color: RENK[sonuc.tur], fontSize: 15, display: 'block' }}>{sonuc.baslik}</strong>
          <span style={{ fontSize: 13, lineHeight: 1.5 }}>{sonuc.detay}</span>
        </div>
      )}

      {/* Sıradaki konum */}
      {siradaki ? (
        <section style={{ border: '1px solid var(--border)', borderRadius: 14, padding: 16, marginBottom: 12 }}>
          <div style={{ fontSize: 10.5, letterSpacing: 1, color: 'var(--text3)' }}>SIRADAKİ</div>
          <div style={{ fontSize: 24, fontWeight: 700, margin: '3px 0 2px' }}>{siradaki.display_name}</div>
          <div style={{ fontSize: 12.5, color: 'var(--text3)', marginBottom: 4 }}>
            {DURUM_ETIKET[siradaki.state] || siradaki.label}
          </div>
          {siradaki.serial && (
            <div style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--text3)', marginBottom: 12 }}>
              {siradaki.serial}
            </div>
          )}

          <div style={{ display: 'grid', gap: 8 }}>
            <button type="button" style={dugme(true)} onClick={() => { setSonuc(null); setTarayiciAcik(true) }}>
              📷 Etiketi okut
            </button>

            <details>
              <summary style={{ fontSize: 12.5, color: 'var(--text3)', cursor: 'pointer', padding: '6px 0' }}>
                Kamera çalışmıyor mu?
              </summary>
              <div style={{ display: 'grid', gap: 8, marginTop: 8 }}>
                <input
                  value={elleToken}
                  onChange={e => setElleToken(e.target.value)}
                  placeholder="QR bağlantısını yapıştırın"
                  style={alan}
                  aria-label="QR bağlantısı"
                />
                <button
                  type="button" style={dugme(false)}
                  disabled={!elleToken.trim() || dogrula.isPending}
                  onClick={() => { okutuldu(elleToken); setElleToken('') }}
                >
                  Yapıştırılanı doğrula
                </button>

                {/* Elle işaret doğrulamanın YERİNİ TUTMAZ; ekran bunu söylüyor. */}
                <div style={{ fontSize: 11.5, color: '#b45309', lineHeight: 1.45 }}>
                  {elleIsaretUyarisi(siradaki.state)}
                </div>
                <button
                  type="button" style={dugme(false, '#b45309')}
                  disabled={elleAsildi.isPending || siradaki.state === 'qr_missing'}
                  onClick={() => elleAsildi.mutate(siradaki.location_id)}
                >
                  Okutmadan “asıldı” işaretle
                </button>
              </div>
            </details>

            <button
              type="button" style={dugme(false)}
              onClick={() => { setAtlanan(s => new Set(s).add(siradaki.location_id)); setSonuc(null) }}
            >
              Atla — şimdi ulaşamıyorum
            </button>
          </div>
        </section>
      ) : (
        <section style={{ border: '1px solid var(--border)', borderRadius: 14, padding: 20, textAlign: 'center' }}>
          <div style={{ fontSize: 30 }}>✓</div>
          <strong style={{ fontSize: 15 }}>
            {items.length === 0 ? 'Bu kapsamda konum yok' : 'Bu kapsamda yapılacak iş kalmadı'}
          </strong>
          {atlanan.size > 0 && (
            <div style={{ fontSize: 12.5, color: 'var(--text3)', marginTop: 8 }}>
              {atlanan.size} konumu atladınız.{' '}
              <button type="button" onClick={() => setAtlanan(new Set())}
                style={{ background: 'none', border: 0, color: 'var(--accent)', cursor: 'pointer', fontSize: 12.5, textDecoration: 'underline' }}>
                geri al
              </button>
            </div>
          )}
        </section>
      )}

      {/* Kuyruğun devamı — görevli ne kadar kaldığını görsün */}
      {kuyruk.length > 1 && (
        <div style={{ marginTop: 14 }}>
          <div style={{ fontSize: 10.5, letterSpacing: 1, color: 'var(--text3)', marginBottom: 6 }}>
            SIRADA {kuyruk.length - 1} KONUM DAHA
          </div>
          <div style={{ border: '1px solid var(--border)', borderRadius: 10, maxHeight: 200, overflow: 'auto' }}>
            {kuyruk.slice(1, 30).map(i => (
              <div key={i.location_id} style={{
                display: 'flex', justifyContent: 'space-between', gap: 10,
                padding: '8px 11px', borderBottom: '1px solid var(--border)', fontSize: 12.5,
              }}>
                <span>{i.display_name}</span>
                <span style={{ color: 'var(--text3)', fontSize: 11, textAlign: 'right' }}>
                  {DURUM_ETIKET[i.state] || i.state}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      <QrScannerModal
        open={tarayiciAcik}
        onClose={() => setTarayiciAcik(false)}
        onScan={okutuldu}
        title={siradaki ? `${siradaki.display_name} etiketini okutun` : 'Etiketi okutun'}
      />
    </div>
  )
}
