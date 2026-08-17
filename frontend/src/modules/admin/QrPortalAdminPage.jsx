import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import api from '../../shared/api/client.js'
import { BLOCKS } from '../../shared/blocks.js'
import {
  acmaUyarisi,
  gunlukOrtalama,
  pinAnahtariDurumu,
  sayiGerekcesi,
  sessizlikOzeti,
  HIZMET_ANAHTARLARI,
  PIN_ANAHTARLARI,
} from './logic/qrPortalAdmin.js'

// Faz 6 — QR portalı ayarları ve analitiği.
//
// Ayarlar bu ekrandan önce yalnız API'den değiştirilebiliyordu; portalı açmak
// için veritabanına girmek gerekiyordu.
//
// Analitik tarafının tek derdi şu: BİR SIFIR ÜÇ FARKLI ŞEY DEMEK OLABİLİR —
// hizmet kapalıydı, etiket kapıda değildi, ya da gerçekten kullanılmadı.
// Üçünü tek "0" altında toplamak "sakinler portalı kullanmıyor" gibi yanlış
// bir sonuca ve arkasından gereksiz bir kampanyaya yol açar.

const RENK = { ok: '#0f766e', uyari: '#b45309', bilinmiyor: '#64748b', hata: '#dc2626' }

const Kart = ({ baslik, alt, sag, children }) => (
  <section style={{ border: '1px solid var(--border)', borderRadius: 12, padding: 16, marginBottom: 16 }}>
    <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, flexWrap: 'wrap' }}>
      <h2 style={{ fontFamily: 'var(--display)', fontSize: 14, letterSpacing: 1, margin: 0 }}>{baslik}</h2>
      <div style={{ marginLeft: 'auto' }}>{sag}</div>
    </div>
    {alt && <div style={{ fontSize: 11.5, color: 'var(--text3)', margin: '4px 0 12px' }}>{alt}</div>}
    {children}
  </section>
)

function Anahtar({ label, desc, checked, disabled, hint, onChange }) {
  return (
    <label style={{
      display: 'flex', gap: 10, alignItems: 'flex-start', padding: '9px 11px',
      border: '1px solid var(--border)', borderRadius: 9, opacity: disabled ? 0.55 : 1,
      cursor: disabled ? 'not-allowed' : 'pointer',
    }}>
      <input
        type="checkbox" checked={!!checked} disabled={disabled}
        onChange={e => onChange(e.target.checked)}
        style={{ marginTop: 2 }}
      />
      <span style={{ minWidth: 0 }}>
        <span style={{ fontSize: 12.5, display: 'block' }}>{label}</span>
        {desc && <span style={{ fontSize: 10.5, color: 'var(--text3)' }}>{desc}</span>}
        {hint && <span style={{ fontSize: 10.5, color: RENK.uyari, display: 'block' }}>{hint}</span>}
      </span>
    </label>
  )
}

const Rozet = ({ seviye, children }) => (
  <div style={{
    border: `1px solid ${RENK[seviye]}55`, background: `${RENK[seviye]}18`,
    borderRadius: 9, padding: '8px 12px', fontSize: 11.5, marginBottom: 12,
  }}>
    {children}
  </div>
)

export default function QrPortalAdminPage() {
  const qc = useQueryClient()
  const [blok, setBlok] = useState('')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [mesaj, setMesaj] = useState(null)

  const ayarlar = useQuery({
    queryKey: ['portal-settings'],
    queryFn: () => api.get('/location-portal/settings').then(r => r.data),
  })
  const analitik = useQuery({
    queryKey: ['portal-analytics', blok, from, to],
    queryFn: () => api.get('/location-portal/analytics', {
      params: { ...(blok ? { block: blok } : {}), ...(from ? { from } : {}), ...(to ? { to } : {}) },
    }).then(r => r.data),
  })

  const kaydet = useMutation({
    mutationFn: (patch) => api.put('/location-portal/settings', patch).then(r => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['portal-settings'] })
      qc.invalidateQueries({ queryKey: ['portal-analytics'] })
      setMesaj({ tur: 'ok', metin: 'Ayar kaydedildi' })
    },
    onError: e => setMesaj({ tur: 'hata', metin: e?.response?.data?.error || 'Ayar kaydedilemedi' }),
  })

  const a = ayarlar.data || {}
  const an = analitik.data
  const uyari = acmaUyarisi(an?.labels)
  const sessizlik = sessizlikOzeti(an?.silence)
  const ortalama = gunlukOrtalama(an?.window, an?.totals?.scans)
  const alanStil = { background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 8, padding: '6px 9px', color: 'var(--text)', fontSize: 12.5 }

  return (
    <div className="fade-up" style={{ padding: '20px 22px', maxWidth: 1100 }}>
      <h1 style={{ fontFamily: 'var(--display)', fontSize: 20, letterSpacing: 1, margin: '0 0 4px' }}>
        QR PORTAL YÖNETİMİ
      </h1>
      <div style={{ fontSize: 12, color: 'var(--text3)', marginBottom: 16 }}>
        Sakinin QR okutunca göreceği hizmetleri buradan açıp kapatın; kullanımı aşağıdan izleyin.
      </div>

      {mesaj && (
        <Rozet seviye={mesaj.tur === 'hata' ? 'hata' : 'ok'}>{mesaj.metin}</Rozet>
      )}

      {/* --- AYARLAR --- */}
      <Kart
        baslik="PORTAL AYARLARI"
        alt="Ana anahtar kapalıyken hiçbir hizmet çalışmaz; QR okutan sakin kapalı sayfa görür."
      >
        {/* Spec: "Açmadan önce dağıtım kapsama uyarısı" — etiketi kapıda olmayan
            portal, açık olsa da kimsenin ulaşamadığı hizmettir. */}
        <Rozet seviye={uyari.seviye}>
          <strong>Dağıtım kapsaması: </strong>{uyari.metin}
        </Rozet>

        <div style={{ marginBottom: 12 }}>
          <Anahtar
            label="Portal ana anahtarı"
            desc="Kapalıyken tüm QR'lar kapalı sayfaya düşer"
            checked={a.location_portal_enabled}
            onChange={v => kaydet.mutate({ location_portal_enabled: v })}
          />
        </div>

        <div style={{ fontSize: 10.5, color: 'var(--text3)', letterSpacing: 1, marginBottom: 6 }}>HİZMETLER</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: 8, marginBottom: 14 }}>
          {HIZMET_ANAHTARLARI.map(h => (
            <Anahtar
              key={h.key} label={h.label} desc={h.desc}
              checked={a[h.key]}
              disabled={!a.location_portal_enabled}
              hint={!a.location_portal_enabled ? 'Ana anahtar kapalı — etkisi yok' : null}
              onChange={v => kaydet.mutate({ [h.key]: v })}
            />
          ))}
        </div>

        <div style={{ fontSize: 10.5, color: 'var(--text3)', letterSpacing: 1, marginBottom: 6 }}>PIN ZORUNLULUĞU</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: 8 }}>
          {PIN_ANAHTARLARI.map(p => {
            const d = pinAnahtariDurumu(a, p)
            return (
              <Anahtar
                key={p.key} label={p.label}
                checked={a[p.key]} disabled={d.disabled} hint={d.hint}
                onChange={v => kaydet.mutate({ [p.key]: v })}
              />
            )
          })}
        </div>
        <div style={{ fontSize: 10.5, color: 'var(--text3)', marginTop: 8 }}>
          PIN zorunluluğu açıksa yalnız kiosk PIN'i olan sakin işlem yapabilir. PIN'i olmayan sakinler
          hizmeti hiç kullanamaz — dağıtımı tamamlamadan açmayın.
        </div>
      </Kart>

      {/* --- ANALİTİK --- */}
      <Kart
        baslik="QR ANALİTİĞİ"
        alt="Sayıların yanında neden o sayı olduğu da yazar; kapalı hizmetin sıfırı kullanılmadığı anlamına gelmez."
        sag={
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            <select value={blok} onChange={e => setBlok(e.target.value)} style={alanStil} aria-label="Blok">
              <option value="">Tüm bloklar</option>
              {BLOCKS.map(b => <option key={b.block} value={b.block}>{b.displayName || b.block}</option>)}
            </select>
            <input type="date" value={from} onChange={e => setFrom(e.target.value)} style={alanStil} aria-label="Başlangıç" />
            <input type="date" value={to} onChange={e => setTo(e.target.value)} style={alanStil} aria-label="Bitiş" />
          </div>
        }
      >
        {an?.available === false && <Rozet seviye="hata">{an.reason}</Rozet>}
        {an?.portal_note && <Rozet seviye="uyari">{an.portal_note}</Rozet>}
        {an?.window?.note && <Rozet seviye="bilinmiyor">{an.window.note}</Rozet>}

        {an?.available && (
          <>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 10, marginBottom: 14 }}>
              <div style={{ border: '1px solid var(--border)', borderRadius: 10, padding: '9px 12px' }}>
                <div style={{ fontFamily: 'var(--mono)', fontSize: 22 }}>{an.totals.scans}</div>
                <div style={{ fontSize: 11.5 }}>QR okutma</div>
                <div style={{ fontSize: 10, color: 'var(--text3)' }}>
                  {ortalama.measurable
                    ? `günde ~${ortalama.value} (${ortalama.days} gün)`
                    : 'günlük ortalama hesaplanamıyor'}
                </div>
              </div>
              {an.services.map(s => {
                const gerekce = sayiGerekcesi(s, an.portal_enabled)
                return (
                  <div key={s.key} style={{ border: '1px solid var(--border)', borderRadius: 10, padding: '9px 12px' }}>
                    <div style={{ fontFamily: 'var(--mono)', fontSize: 22, color: s.enabled ? 'var(--text)' : RENK.bilinmiyor }}>
                      {s.events}
                    </div>
                    <div style={{ fontSize: 11.5 }}>{s.label}</div>
                    <div style={{ fontSize: 10, color: gerekce ? RENK.uyari : 'var(--text3)' }}>
                      {gerekce || (s.note ? s.note : 'kayıtlı işlem')}
                    </div>
                  </div>
                )
              })}
            </div>

            {sessizlik && (
              <Rozet seviye={sessizlik.seviye}>
                <strong>Sessizlik: </strong>{sessizlik.metin}
              </Rozet>
            )}

            {/* Sakin memnuniyeti: toplanıyordu ama hiçbir ekran okumuyordu.
                Şikayet takip görevi açıyor (aksiyon yolu vardı), puanlar
                görünmüyordu — "hangi blokta temizlik puanı düşük" cevapsızdı. */}
            {an.cleaning_reviews && (
              <div style={{ border: '1px solid var(--border)', borderRadius: 10, padding: '11px 13px', marginBottom: 14 }}>
                <div style={{ display: 'flex', gap: 14, alignItems: 'baseline', flexWrap: 'wrap' }}>
                  <strong style={{ fontSize: 12.5 }}>Sakin temizlik değerlendirmesi</strong>
                  {an.cleaning_reviews.rating_measurable ? (
                    <span style={{ fontFamily: 'var(--mono)', fontSize: 18 }}>
                      {an.cleaning_reviews.average_rating}/5
                      <span style={{ fontSize: 11, color: 'var(--text3)' }}>
                        {' '}({an.cleaning_reviews.rated_count} puan)
                      </span>
                    </span>
                  ) : (
                    <span style={{ fontSize: 11.5, color: RENK.bilinmiyor }}>{an.cleaning_reviews.rating_note}</span>
                  )}
                  <span style={{ fontSize: 11.5, color: 'var(--text3)', marginLeft: 'auto' }}>
                    {an.cleaning_reviews.total} değerlendirme · {an.cleaning_reviews.issues} şikayet ·{' '}
                    {an.cleaning_reviews.followup_tasks} takip görevi açıldı
                  </span>
                </div>

                {an.cleaning_reviews.by_block.length > 0 && (
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11.5, marginTop: 8 }}>
                    <tbody>
                      {an.cleaning_reviews.by_block.map(b => (
                        <tr key={b.block} style={{ borderTop: '1px solid var(--border)' }}>
                          <td style={{ padding: '4px 6px' }}>{b.block}</td>
                          <td style={{ padding: '4px 6px', fontFamily: 'var(--mono)' }}>
                            {b.average_rating != null ? `${b.average_rating}/5` : 'puan yok'}
                          </td>
                          <td style={{ padding: '4px 6px', color: b.issues > 0 ? RENK.uyari : 'var(--text3)' }}>
                            {b.issues > 0 ? `${b.issues} şikayet` : 'şikayet yok'}
                          </td>
                          <td style={{ padding: '4px 6px', color: 'var(--text3)' }}>{b.total} değerlendirme</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            )}

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 14 }}>
              <div>
                <div style={{ fontSize: 11, color: 'var(--text3)', letterSpacing: 1, marginBottom: 6 }}>BLOK KIRILIMI</div>
                <div style={{ maxHeight: 240, overflow: 'auto', border: '1px solid var(--border)', borderRadius: 8 }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11.5 }}>
                    <tbody>
                      {an.by_block.map(b => (
                        <tr key={b.block} style={{ borderBottom: '1px solid var(--border)' }}>
                          <td style={{ padding: '5px 9px' }}>{b.block}</td>
                          <td style={{ padding: '5px 9px', fontFamily: 'var(--mono)' }}>{b.scans}</td>
                          <td style={{ padding: '5px 9px', color: 'var(--text3)' }}>
                            {b.labels_proven}/{b.locations} etiket kapıda
                          </td>
                          <td style={{ padding: '5px 9px', color: RENK.bilinmiyor, fontSize: 10.5 }}>
                            {b.coverage_note || ''}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              <div>
                <div style={{ fontSize: 11, color: 'var(--text3)', letterSpacing: 1, marginBottom: 6 }}>EN ÇOK OKUTULANLAR</div>
                {an.busiest.length === 0 ? (
                  <div style={{ fontSize: 11.5, color: 'var(--text3)' }}>Hiçbir konum okutulmamış.</div>
                ) : (
                  <div style={{ maxHeight: 240, overflow: 'auto', border: '1px solid var(--border)', borderRadius: 8 }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11.5 }}>
                      <tbody>
                        {an.busiest.map(k => (
                          <tr key={k.location_id} style={{ borderBottom: '1px solid var(--border)' }}>
                            <td style={{ padding: '5px 9px' }}>{k.display_name}</td>
                            <td style={{ padding: '5px 9px', fontFamily: 'var(--mono)' }}>{k.scans}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
                <div style={{ fontSize: 10.5, color: 'var(--text3)', marginTop: 8 }}>
                  Kimlik: {an.identity.anonymous || 0} anonim · {an.identity.resident_pin || 0} sakin PIN ·{' '}
                  {an.identity.worker || 0} görevli
                </div>
                {an.settings_last_changed_at && (
                  <div style={{ fontSize: 10.5, color: 'var(--text3)', marginTop: 4 }}>
                    Ayarlar en son {String(an.settings_last_changed_at).slice(0, 16)} tarihinde değişti.
                    Ayar geçmişi tutulmuyor, bu tarihten öncesi için "o gün açık mıydı" sorusu cevaplanamaz.
                  </div>
                )}
              </div>
            </div>
          </>
        )}
      </Kart>
    </div>
  )
}
