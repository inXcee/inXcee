import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import api from '../../shared/api/client.js'
import { BLOCKS } from '../../shared/blocks.js'
import { aksiyonGerekenler, durumKovalari, kurulumOrani, partiDurumu, tahminiSayfa } from './logic/qrDeployment.js'

// Faz 7 — QR etiket basımı ve saha kurulumu.
//
// "Oda QR Kodları" ekranı kodu ÜRETMEYİ ve tek tuşla basmayı çözüyordu. Burada
// çözülen başka bir şey: 1078 kâğıdın hangisinin gerçekten kapıda olduğu.
//
// Akış bilerek iki adımlı — önce parti açılır, sonra o partinin PDF'i inilir.
// Böylece kâğıttaki seri ile kayıt birebir tutar ve aynı parti numarası her
// indirişte aynı kâğıdı verir.

const TIPLER = [
  { value: '', label: 'Tüm konum tipleri' },
  { value: 'room', label: 'Odalar' },
  { value: 'common_area', label: 'Ortak alanlar' },
]

const Kart = ({ baslik, alt, children, sag }) => (
  <section style={{ border: '1px solid var(--border)', borderRadius: 12, padding: 16, marginBottom: 16 }}>
    <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, flexWrap: 'wrap', marginBottom: alt ? 2 : 10 }}>
      <h2 style={{ fontFamily: 'var(--display)', fontSize: 14, letterSpacing: 1, margin: 0 }}>{baslik}</h2>
      <div style={{ marginLeft: 'auto' }}>{sag}</div>
    </div>
    {alt && <div style={{ fontSize: 11.5, color: 'var(--text3)', marginBottom: 12 }}>{alt}</div>}
    {children}
  </section>
)

const alanStil = { background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 8, padding: '7px 9px', color: 'var(--text)', fontSize: 12.5 }
const dugmeStil = (birincil) => ({
  border: `1px solid ${birincil ? 'var(--accent)' : 'var(--border)'}`,
  background: birincil ? 'var(--accent)' : 'transparent',
  color: birincil ? '#fff' : 'var(--text)',
  borderRadius: 8, padding: '8px 14px', fontSize: 12.5, cursor: 'pointer',
})

export default function QrDeploymentPage() {
  const qc = useQueryClient()
  const [blok, setBlok] = useState('')
  const [kat, setKat] = useState('')
  const [tip, setTip] = useState('')
  const [sablon, setSablon] = useState('a4_8')
  const [kal, setKal] = useState({ offset_x_mm: 0, offset_y_mm: 0, scale: 1 })
  const [mesaj, setMesaj] = useState(null)
  const [okutulan, setOkutulan] = useState('')
  const [beklenenKonum, setBeklenenKonum] = useState('')
  const [mesgul, setMesgul] = useState(false)

  const filtre = useMemo(() => ({
    ...(blok ? { block: blok } : {}),
    ...(kat ? { floor: kat } : {}),
    ...(tip ? { type: tip } : {}),
  }), [blok, kat, tip])

  const sablonlar = useQuery({
    queryKey: ['qr-label-templates'],
    queryFn: () => api.get('/location-portal/label-templates').then(r => r.data),
  })
  const partiler = useQuery({
    queryKey: ['qr-print-batches'],
    queryFn: () => api.get('/location-portal/print-batches').then(r => r.data),
  })
  const rapor = useQuery({
    queryKey: ['qr-deployments', filtre],
    queryFn: () => api.get('/location-portal/deployments', { params: filtre }).then(r => r.data),
  })
  const bayat = useQuery({
    queryKey: ['qr-stale'],
    queryFn: () => api.get('/location-portal/deployments/stale').then(r => r.data),
  })
  const uyusmazlik = useQuery({
    queryKey: ['qr-mismatches'],
    queryFn: () => api.get('/location-portal/deployments/mismatches').then(r => r.data),
  })

  const tazele = () => {
    qc.invalidateQueries({ queryKey: ['qr-print-batches'] })
    qc.invalidateQueries({ queryKey: ['qr-deployments'] })
    qc.invalidateQueries({ queryKey: ['qr-stale'] })
    qc.invalidateQueries({ queryKey: ['qr-mismatches'] })
  }

  // PDF api istemcisiyle inilir ki Authorization başlığı gitsin; düz <a href>
  // yetki başlığını taşımaz ve 401 döner.
  const pdfIndir = async (yol, dosya) => {
    const res = await api.get(yol, { responseType: 'blob' })
    const url = URL.createObjectURL(new Blob([res.data], { type: 'application/pdf' }))
    const a = document.createElement('a')
    a.href = url
    a.download = dosya
    a.click()
    URL.revokeObjectURL(url)
  }

  const partiAcMut = useMutation({
    mutationFn: () => api.post('/location-portal/print-batches', {
      template: sablon, calibration: kal, filters: filtre,
    }).then(r => r.data),
    onSuccess: async (parti) => {
      setMesaj({ tur: 'ok', metin: `${parti.batch_no} açıldı — ${parti.label_count} etiket, ${parti.page_count} sayfa. PDF indiriliyor…` })
      try {
        await pdfIndir(`/location-portal/print-batches/${parti.id}/labels.pdf`, `${parti.batch_no}-etiketler.pdf`)
        setMesaj({ tur: 'ok', metin: `${parti.batch_no} indirildi. Kâğıt çıktıktan sonra "Basıldı" olarak onaylayın.` })
      } catch {
        setMesaj({ tur: 'uyari', metin: `${parti.batch_no} açıldı ama PDF inmedi. Parti listesinden tekrar indirebilirsiniz.` })
      }
      tazele()
    },
    onError: e => setMesaj({ tur: 'hata', metin: e?.response?.data?.error || 'Parti açılamadı' }),
  })

  const partiIslem = useMutation({
    mutationFn: ({ id, islem }) => api.post(`/location-portal/print-batches/${id}/${islem}`).then(r => r.data),
    onSuccess: () => { tazele(); setMesaj({ tur: 'ok', metin: 'Parti güncellendi' }) },
    onError: e => setMesaj({ tur: 'hata', metin: e?.response?.data?.error || 'İşlem başarısız' }),
  })

  const dogrulaMut = useMutation({
    mutationFn: () => api.post('/location-portal/deployments/verify', {
      token: okutulan.trim(),
      ...(beklenenKonum ? { expected_location_id: Number(beklenenKonum) } : {}),
    }).then(r => r.data),
    onSuccess: (r) => { setMesaj({ tur: 'ok', metin: r.message }); setOkutulan(''); tazele() },
    onError: (e) => {
      const d = e?.response?.data
      // 409 = uyuşmazlık; bu bir hata değil, sahadaki gerçek bir bulgu.
      setMesaj({ tur: d?.code === 'location_mismatch' ? 'uyari' : 'hata', metin: d?.message || d?.error || 'Doğrulanamadı' })
      tazele()
    },
  })

  const kurulumMut = useMutation({
    mutationFn: (ids) => api.post('/location-portal/deployments/install', { location_ids: ids }).then(r => r.data),
    onSuccess: (r) => {
      const atlanan = r.skipped_no_active_qr?.length
      setMesaj({
        tur: atlanan ? 'uyari' : 'ok',
        metin: atlanan
          ? `${r.updated} konum işaretlendi, ${atlanan} konumun aktif QR'ı olmadığı için atlandı.`
          : `${r.updated} konum "asıldı" olarak işaretlendi.`,
      })
      tazele()
    },
    onError: e => setMesaj({ tur: 'hata', metin: e?.response?.data?.error || 'Kaydedilemedi' }),
  })

  const sablonBilgi = sablonlar.data?.templates?.find(t => t.key === sablon)
  const ozet = rapor.data?.summary
  const oran = kurulumOrani(ozet)
  const kovalar = durumKovalari(ozet)
  const isListesi = aksiyonGerekenler(rapor.data?.items || [])
  // BLOCKS'ta `floors` bir SAYI (Y bloklarda 1, 2 ya da 3). Kat listesi ondan
  // üretilir; [1,2] hardcode etmek 3 katlı blokları eksik gösterirdi.
  const katSayisi = blok ? (BLOCKS.find(b => b.block === blok)?.floors || 0) : 0
  const katlar = Array.from({ length: katSayisi }, (_, i) => i + 1)

  return (
    <div className="fade-up" style={{ padding: '20px 22px', maxWidth: 1150 }}>
      <h1 style={{ fontFamily: 'var(--display)', fontSize: 20, letterSpacing: 1, margin: '0 0 4px' }}>
        QR BASIM VE SAHA KURULUMU
      </h1>
      <div style={{ fontSize: 12, color: 'var(--text3)', marginBottom: 16 }}>
        Etiket basımı parti parti kaydedilir; hangi kâğıdın gerçekten kapıda olduğu buradan takip edilir.
      </div>

      {mesaj && (
        <div style={{
          border: `1px solid ${mesaj.tur === 'hata' ? 'rgba(220,38,38,.4)' : mesaj.tur === 'uyari' ? 'rgba(245,158,11,.4)' : 'rgba(15,118,110,.4)'}`,
          background: mesaj.tur === 'hata' ? 'rgba(220,38,38,.10)' : mesaj.tur === 'uyari' ? 'rgba(245,158,11,.10)' : 'rgba(15,118,110,.10)',
          borderRadius: 9, padding: '8px 12px', fontSize: 12, marginBottom: 12,
        }}>
          {mesaj.metin}
        </div>
      )}

      {/* --- BASIM --- */}
      <Kart
        baslik="ETİKET BASIMI"
        alt="Önce parti açılır, sonra o partinin PDF'i iner. Yazıcıda “sayfaya sığdır” KAPALI, ölçek %100 olmalı."
      >
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'flex-end', marginBottom: 12 }}>
          <label style={{ display: 'grid', gap: 4, fontSize: 10.5, color: 'var(--text3)' }}>
            ŞABLON
            <select value={sablon} onChange={e => setSablon(e.target.value)} style={{ ...alanStil, minWidth: 240 }}>
              {(sablonlar.data?.templates || []).map(t => (
                <option key={t.key} value={t.key}>{t.label} — sayfada {t.per_page}</option>
              ))}
            </select>
          </label>
          <label style={{ display: 'grid', gap: 4, fontSize: 10.5, color: 'var(--text3)' }}>
            BLOK
            <select value={blok} onChange={e => { setBlok(e.target.value); setKat('') }} style={alanStil}>
              <option value="">Tüm bloklar</option>
              {BLOCKS.map(b => <option key={b.block} value={b.block}>{b.displayName || b.block}</option>)}
            </select>
          </label>
          <label style={{ display: 'grid', gap: 4, fontSize: 10.5, color: 'var(--text3)' }}>
            KAT
            {/* Kat listesi bloktan gelir — Y bloklarda 1, 2 ya da 3 kat olabilir. */}
            <select value={kat} onChange={e => setKat(e.target.value)} style={alanStil} disabled={!blok}>
              <option value="">Tüm katlar</option>
              {katlar.map(f => <option key={f} value={f}>{f}</option>)}
            </select>
          </label>
          <label style={{ display: 'grid', gap: 4, fontSize: 10.5, color: 'var(--text3)' }}>
            TİP
            <select value={tip} onChange={e => setTip(e.target.value)} style={alanStil}>
              {TIPLER.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
            </select>
          </label>
        </div>

        <details style={{ marginBottom: 12 }}>
          <summary style={{ fontSize: 11.5, color: 'var(--text3)', cursor: 'pointer' }}>
            Yazıcı kalibrasyonu (etiketler kayıyorsa)
          </summary>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'flex-end', marginTop: 10 }}>
            {[['offset_x_mm', 'YATAY KAYMA (mm)'], ['offset_y_mm', 'DİKEY KAYMA (mm)']].map(([alan, etiket]) => (
              <label key={alan} style={{ display: 'grid', gap: 4, fontSize: 10.5, color: 'var(--text3)' }}>
                {etiket}
                <input
                  type="number" step="0.5" min="-10" max="10" value={kal[alan]}
                  onChange={e => setKal(k => ({ ...k, [alan]: Number(e.target.value) }))}
                  style={{ ...alanStil, width: 110 }}
                />
              </label>
            ))}
            <label style={{ display: 'grid', gap: 4, fontSize: 10.5, color: 'var(--text3)' }}>
              ÖLÇEK (0.98–1.02)
              <input
                type="number" step="0.005" min="0.98" max="1.02" value={kal.scale}
                onChange={e => setKal(k => ({ ...k, scale: Number(e.target.value) }))}
                style={{ ...alanStil, width: 110 }}
              />
            </label>
            <button
              type="button"
              style={dugmeStil(false)}
              onClick={async () => {
                setMesgul(true)
                try {
                  await pdfIndir(
                    `/location-portal/calibration.pdf?template=${sablon}&offset_x_mm=${kal.offset_x_mm}&offset_y_mm=${kal.offset_y_mm}&scale=${kal.scale}`,
                    'etiket-kalibrasyon.pdf',
                  )
                } catch { setMesaj({ tur: 'hata', metin: 'Kalibrasyon sayfası inmedi' }) } finally { setMesgul(false) }
              }}
            >
              Kalibrasyon sayfası indir
            </button>
          </div>
          <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 8 }}>
            Kalibrasyon sayfasında QR yoktur; yalnız etiket sınırları çizilir. Basıp etiket kâğıdının üstüne
            tutarak kaymayı ölçün, değeri buraya yazın.
          </div>
        </details>

        <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
          <button
            type="button"
            style={dugmeStil(true)}
            disabled={partiAcMut.isPending || mesgul}
            onClick={() => { setMesaj(null); partiAcMut.mutate() }}
          >
            {partiAcMut.isPending ? 'Parti açılıyor…' : 'Parti aç ve PDF indir'}
          </button>
          {sablonBilgi && rapor.data?.summary && (
            <span style={{ fontSize: 11.5, color: 'var(--text3)' }}>
              Filtreye uyan {ozet.total} konum → yaklaşık{' '}
              {tahminiSayfa(ozet.total - (ozet.qr_missing || 0), sablonBilgi.per_page)} sayfa
              {ozet.qr_missing ? ` (${ozet.qr_missing} konumun QR'ı yok, basılamaz)` : ''}
            </span>
          )}
        </div>
      </Kart>

      {/* --- SAHA DURUMU --- */}
      <Kart
        baslik="SAHA DURUMU"
        alt="Basıldı ≠ asıldı ≠ doğru kapıya asıldı. Üçü ayrı sayılır."
        sag={
          oran.measurable
            ? <span style={{ fontFamily: 'var(--mono)', fontSize: 18 }}>{oran.label}</span>
            : <span style={{ fontSize: 11.5, color: '#b45309' }}>Oran ölçülemiyor — {oran.reason}</span>
        }
      >
        {rapor.data && rapor.data.available === false && (
          <div style={{ fontSize: 12, color: '#dc2626' }}>{rapor.data.reason}</div>
        )}
        {ozet?.coverage_note && (
          <div style={{
            border: '1px solid rgba(148,163,184,.4)', background: 'rgba(148,163,184,.10)',
            borderRadius: 8, padding: '7px 11px', fontSize: 11.5, marginBottom: 12,
          }}>
            {ozet.coverage_note}
          </div>
        )}

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: 10, marginBottom: 14 }}>
          {kovalar.map(k => (
            <div key={k.key} style={{ border: '1px solid var(--border)', borderRadius: 10, padding: '9px 12px' }}>
              <div style={{ fontFamily: 'var(--mono)', fontSize: 22, color: k.renk }}>{k.adet}</div>
              <div style={{ fontSize: 11.5 }}>{k.label}</div>
              <div style={{ fontSize: 10, color: 'var(--text3)' }}>{k.aciklama}</div>
            </div>
          ))}
        </div>

        {isListesi.length > 0 && (
          <>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
              <strong style={{ fontSize: 12 }}>Sahada iş gerektiren {isListesi.length} konum</strong>
              <button
                type="button" style={dugmeStil(false)}
                disabled={kurulumMut.isPending}
                onClick={() => kurulumMut.mutate(isListesi.filter(i => i.state === 'printed').map(i => i.location_id))}
              >
                Basılanları “asıldı” işaretle
              </button>
            </div>
            <div style={{ maxHeight: 260, overflow: 'auto', border: '1px solid var(--border)', borderRadius: 8 }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11.5 }}>
                <tbody>
                  {isListesi.slice(0, 200).map(i => (
                    <tr key={i.location_id} style={{ borderBottom: '1px solid var(--border)' }}>
                      <td style={{ padding: '5px 9px' }}>{i.display_name}</td>
                      <td style={{ padding: '5px 9px', fontFamily: 'var(--mono)', color: 'var(--text3)' }}>{i.serial || '—'}</td>
                      <td style={{ padding: '5px 9px' }}>{i.label}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {isListesi.length > 200 && (
              <div style={{ fontSize: 10.5, color: 'var(--text3)', marginTop: 6 }}>
                İlk 200 satır gösteriliyor ({isListesi.length} toplam). Blok filtresiyle daraltın.
              </div>
            )}
          </>
        )}
      </Kart>

      {/* --- YERİNDE DOĞRULAMA --- */}
      <Kart
        baslik="YERİNDE DOĞRULAMA"
        alt="Kapının önünde etiketi okutun. Beklenen konumu da seçerseniz yanlış kapıya asılmış etiket yakalanır."
      >
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <label style={{ display: 'grid', gap: 4, fontSize: 10.5, color: 'var(--text3)', flex: '1 1 320px' }}>
            OKUTULAN QR (bağlantı ya da kod)
            <input
              value={okutulan}
              onChange={e => setOkutulan(e.target.value)}
              placeholder="https://avskamp.com/q/…"
              style={alanStil}
            />
          </label>
          <label style={{ display: 'grid', gap: 4, fontSize: 10.5, color: 'var(--text3)', flex: '1 1 240px' }}>
            BEKLENEN KONUM (isteğe bağlı)
            <select value={beklenenKonum} onChange={e => setBeklenenKonum(e.target.value)} style={alanStil}>
              <option value="">Seçilmedi — yalnız etiket doğrulanır</option>
              {(rapor.data?.items || []).slice(0, 400).map(i => (
                <option key={i.location_id} value={i.location_id}>{i.display_name}</option>
              ))}
            </select>
          </label>
          <button
            type="button" style={dugmeStil(true)}
            disabled={!okutulan.trim() || dogrulaMut.isPending}
            onClick={() => { setMesaj(null); dogrulaMut.mutate() }}
          >
            Doğrula
          </button>
        </div>

        {uyusmazlik.data?.items?.length > 0 && (
          <div style={{ marginTop: 14 }}>
            <strong style={{ fontSize: 12, color: '#dc2626' }}>
              Açık uyuşmazlık: {uyusmazlik.data.items.length}
            </strong>
            <ul style={{ fontSize: 11.5, margin: '6px 0 0', paddingLeft: 18 }}>
              {uyusmazlik.data.items.slice(0, 20).map(m => (
                <li key={m.id}>
                  {m.reason === 'location_mismatch'
                    ? `${m.expected_name || '?'} yerinde ${m.scanned_name || '?'} etiketi bulundu`
                    : m.reason === 'revoked_label'
                      ? `${m.scanned_name || '?'} etiketi iptal edilmiş QR taşıyor`
                      : `${m.expected_name || '?'} — tanınmayan QR okutuldu`}
                  <button
                    type="button"
                    style={{ ...dugmeStil(false), padding: '1px 8px', fontSize: 10.5, marginLeft: 8 }}
                    onClick={() => api.post(`/location-portal/deployments/mismatches/${m.id}/resolve`).then(tazele)}
                  >
                    düzeltildi
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}
        {uyusmazlik.data?.available === false && (
          <div style={{ fontSize: 11.5, color: '#dc2626', marginTop: 10 }}>{uyusmazlik.data.reason}</div>
        )}
      </Kart>

      {/* --- PARTİLER --- */}
      <Kart baslik="BASIM PARTİLERİ" alt="Her parti neyin basıldığının kaydıdır; aynı numara her indirişte aynı kâğıdı verir.">
        {partiler.data?.available === false && (
          <div style={{ fontSize: 12, color: '#dc2626' }}>{partiler.data.reason}</div>
        )}
        {partiler.data?.items?.length === 0 && (
          <div style={{ fontSize: 11.5, color: 'var(--text3)' }}>Henüz basım partisi açılmamış.</div>
        )}
        <div style={{ display: 'grid', gap: 8 }}>
          {(partiler.data?.items || []).map(p => {
            const d = partiDurumu(p)
            return (
              <div key={p.id} style={{
                border: '1px solid var(--border)', borderRadius: 9, padding: '8px 12px',
                display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap', fontSize: 11.5,
              }}>
                <span style={{ fontFamily: 'var(--mono)' }}>{p.batch_no}</span>
                <span>{p.label_count} etiket / {p.page_count} sayfa</span>
                <span style={{ color: 'var(--text3)' }}>{p.template_key}</span>
                <span style={{ color: 'var(--text3)' }}>{(p.created_at || '').slice(0, 16).replace('T', ' ')}</span>
                <span style={{ color: d.renk }}>{d.metin}</span>
                <span style={{ marginLeft: 'auto', display: 'flex', gap: 6 }}>
                  <button
                    type="button" style={{ ...dugmeStil(false), padding: '3px 10px', fontSize: 11 }}
                    onClick={() => pdfIndir(`/location-portal/print-batches/${p.id}/labels.pdf`, `${p.batch_no}-etiketler.pdf`)}
                  >
                    PDF
                  </button>
                  {p.status === 'generated' && (
                    <>
                      <button
                        type="button" style={{ ...dugmeStil(false), padding: '3px 10px', fontSize: 11 }}
                        onClick={() => partiIslem.mutate({ id: p.id, islem: 'confirm' })}
                      >
                        Basıldı
                      </button>
                      <button
                        type="button" style={{ ...dugmeStil(false), padding: '3px 10px', fontSize: 11 }}
                        onClick={() => partiIslem.mutate({ id: p.id, islem: 'cancel' })}
                      >
                        İptal
                      </button>
                    </>
                  )}
                </span>
              </div>
            )
          })}
        </div>
      </Kart>

      {/* --- BAYAT ETİKETLER --- */}
      {bayat.data?.items?.length > 0 && (
        <Kart
          baslik="YENİDEN BASILMASI GEREKENLER"
          alt="QR'ı yenilenen konumların kapısındaki kâğıt artık çalışmıyor."
        >
          <div style={{ maxHeight: 220, overflow: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11.5 }}>
              <tbody>
                {bayat.data.items.map(i => (
                  <tr key={i.location_id} style={{ borderBottom: '1px solid var(--border)' }}>
                    <td style={{ padding: '5px 9px' }}>{i.display_name}</td>
                    <td style={{ padding: '5px 9px', fontFamily: 'var(--mono)', color: 'var(--text3)' }}>{i.serial || '—'}</td>
                    <td style={{ padding: '5px 9px', color: 'var(--text3)' }}>{i.batch_no || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Kart>
      )}
    </div>
  )
}
