import { useState, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import api from '../../shared/api/client.js'
import HelpHint from '../../shared/components/HelpHint.jsx'
import { SkeletonText } from '../../shared/components/Skeleton.jsx'

export default function KvkkAdminPage() {
  const qc = useQueryClient()
  const [text, setText] = useState('')
  const [saved, setSaved] = useState(false)
  const [exportId, setExportId] = useState('')
  const [exportError, setExportError] = useState('')
  const [anonId, setAnonId] = useState('')
  const [anonResult, setAnonResult] = useState(null)
  const [retentionDays, setRetentionDays] = useState('')
  const [enforceResult, setEnforceResult] = useState(null)

  const { data, isLoading } = useQuery({
    queryKey: ['kvkk-policy'],
    queryFn: () => api.get('/kvkk/policy').then(r => r.data),
  })

  const { data: retentionPolicy } = useQuery({
    queryKey: ['kvkk-retention-policy'],
    queryFn: () => api.get('/kvkk/retention-policy').then(r => r.data),
  })

  useEffect(() => {
    if (data?.text && !text) setText(data.text)
  }, [data, text])

  useEffect(() => {
    if (retentionPolicy && retentionDays === '') {
      setRetentionDays(String(retentionPolicy.days))
    }
  }, [retentionPolicy, retentionDays])

  const save = useMutation({
    mutationFn: (newText) => api.put('/kvkk/policy', { text: newText }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['kvkk-policy'] })
      setSaved(true)
      setTimeout(() => setSaved(false), 3000)
    },
  })

  const saveRetention = useMutation({
    mutationFn: (days) => api.put('/kvkk/retention-policy', { days }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['kvkk-retention-policy'] })
    },
  })

  const enforce = useMutation({
    mutationFn: () => api.post('/kvkk/retention-enforce'),
    onSuccess: (res) => {
      setEnforceResult(res.data)
    },
  })

  const anonymize = useMutation({
    mutationFn: (id) => api.post(`/kvkk/personnel/${id}/anonymize`),
    onSuccess: (res) => {
      setAnonResult({ ok: true, ...res.data })
      setAnonId('')
    },
    onError: (err) => {
      setAnonResult({ ok: false, error: err.response?.data?.error || 'Hata' })
    },
  })

  const handleExport = async () => {
    setExportError('')
    const id = parseInt(exportId, 10)
    if (!id) {
      setExportError('Geçerli bir personel ID girin')
      return
    }
    try {
      const res = await api.get(`/kvkk/personnel/${id}/export`, { responseType: 'blob' })
      const blob = new Blob([res.data], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `kvkk-export-personnel-${id}-${Date.now()}.json`
      a.click()
      URL.revokeObjectURL(url)
    } catch (err) {
      setExportError(err.response?.data?.error || err.message || 'Export hatası')
    }
  }

  return (
    <div>
      <div className="fade-up" style={{ marginBottom: 24 }}>
        <h2 style={{ fontSize: 28, letterSpacing: 4 }}>
          KVKK YÖNETİMİ<HelpHint topic="kvkk" title="KVKK" />
        </h2>
        <p style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--text3)', letterSpacing: 1, marginTop: 4 }}>
          AYDINLATMA METNİ · KİŞİSEL VERİ EXPORT · SAKLAMA POLİTİKASI
        </p>
      </div>

      {/* Aydınlatma Metni */}
      <div className="panel fade-up-1" style={{ marginBottom: 16 }}>
        <div className="panel-header"><div className="panel-title">AYDINLATMA METNİ</div></div>
        <div className="panel-body">
          {isLoading ? (
            <SkeletonText />
          ) : (
            <>
              <p style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--text3)', marginBottom: 8 }}>
                Bu metin /kvkk URL'inde herkese görünür. Login öncesi de erişilebilir (KVKK kanunu zorunluluğu).
                {data?.is_default && <span style={{ color: 'var(--accent)' }}> · Şu an sistem varsayılanı kullanılıyor.</span>}
              </p>
              <textarea
                value={text}
                onChange={e => setText(e.target.value)}
                rows={20}
                style={{
                  width: '100%', padding: 12, background: 'var(--bg)',
                  border: '1px solid var(--border)', borderRadius: 6,
                  fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--text)',
                  resize: 'vertical', lineHeight: 1.6,
                }}
              />
              <div style={{ display: 'flex', gap: 12, alignItems: 'center', marginTop: 12 }}>
                <button
                  type="button"
                  disabled={save.isPending || !text.trim()}
                  onClick={() => save.mutate(text)}
                  style={{
                    padding: '8px 18px', background: 'var(--accent)', color: '#000',
                    border: 'none', borderRadius: 6, cursor: save.isPending ? 'not-allowed' : 'pointer',
                    fontFamily: 'var(--display)', letterSpacing: 2, fontSize: 11,
                    opacity: save.isPending ? 0.6 : 1,
                  }}
                >{save.isPending ? 'KAYDEDİLİYOR...' : 'KAYDET'}</button>
                {saved && <span style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--green)' }}>✓ Kaydedildi</span>}
                {save.isError && (
                  <span style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--red)' }}>
                    {save.error?.response?.data?.error || 'Hata'}
                  </span>
                )}
              </div>
            </>
          )}
        </div>
      </div>

      {/* Saklama Politikası */}
      <div className="panel fade-up-2" style={{ marginBottom: 16 }}>
        <div className="panel-header">
          <div className="panel-title">SAKLAMA POLİTİKASI</div>
          {retentionPolicy && (
            <span style={{
              fontFamily: 'var(--mono)', fontSize: 9, letterSpacing: 1, padding: '3px 8px',
              borderRadius: 4,
              background: retentionPolicy.enabled ? 'rgba(39,201,106,.12)' : 'rgba(255,255,255,.06)',
              color: retentionPolicy.enabled ? 'var(--green)' : 'var(--text3)',
              border: `1px solid ${retentionPolicy.enabled ? 'rgba(39,201,106,.3)' : 'var(--border)'}`,
            }}>
              {retentionPolicy.enabled ? `AKTİF · ${retentionPolicy.days} GÜN` : 'DEVRE DIŞI'}
            </span>
          )}
        </div>
        <div className="panel-body">
          <p style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--text3)', marginBottom: 16 }}>
            Çıkış yaptıktan bu kadar gün sonra personel kişisel verileri otomatik anonimleştirilir.
            0 gir = devre dışı (manuel anonimleştirme gerekir). Maks. 3650 gün (10 yıl).
          </p>
          <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap', marginBottom: 16 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <input
                type="number"
                value={retentionDays}
                onChange={e => setRetentionDays(e.target.value)}
                min={0} max={3650}
                placeholder="Gün sayısı"
                style={{
                  padding: '8px 12px', background: 'var(--bg)',
                  border: '1px solid var(--border)', borderRadius: 6,
                  fontFamily: 'var(--mono)', fontSize: 12, color: 'var(--text)', width: 130,
                }}
              />
              <span style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--text3)' }}>gün</span>
            </div>
            <button
              type="button"
              disabled={saveRetention.isPending || retentionDays === ''}
              onClick={() => saveRetention.mutate(parseInt(retentionDays, 10))}
              style={{
                padding: '8px 18px', background: 'var(--accent)', color: '#000',
                border: 'none', borderRadius: 6, cursor: 'pointer',
                fontFamily: 'var(--display)', letterSpacing: 2, fontSize: 11,
                opacity: saveRetention.isPending ? 0.6 : 1,
              }}
            >{saveRetention.isPending ? 'KAYDEDİLİYOR...' : 'KAYDET'}</button>
            {saveRetention.isSuccess && (
              <span style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--green)' }}>✓ Güncellendi</span>
            )}
            {saveRetention.isError && (
              <span style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--red)' }}>
                {saveRetention.error?.response?.data?.error || 'Hata'}
              </span>
            )}
          </div>

          {/* Manuel uygulama */}
          <div style={{ borderTop: '1px solid var(--border)', paddingTop: 16 }}>
            <div style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--text3)', marginBottom: 8 }}>
              MANUEL UYGULAMA — Cron'u beklemeden şimdi çalıştır
            </div>
            <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
              <button
                type="button"
                disabled={enforce.isPending || !retentionPolicy?.enabled}
                onClick={() => { setEnforceResult(null); enforce.mutate() }}
                style={{
                  padding: '8px 18px',
                  background: retentionPolicy?.enabled ? 'rgba(239,68,68,.15)' : 'var(--surface2)',
                  color: retentionPolicy?.enabled ? 'var(--red)' : 'var(--text4)',
                  border: `1px solid ${retentionPolicy?.enabled ? 'rgba(239,68,68,.3)' : 'var(--border)'}`,
                  borderRadius: 6, cursor: retentionPolicy?.enabled ? 'pointer' : 'not-allowed',
                  fontFamily: 'var(--display)', letterSpacing: 2, fontSize: 11,
                  opacity: enforce.isPending ? 0.6 : 1,
                }}
                title={!retentionPolicy?.enabled ? 'Önce retention politikasını aktifleştirin' : ''}
              >{enforce.isPending ? 'ÇALIŞIYOR...' : '▶ ENFORCE ET'}</button>
              {!retentionPolicy?.enabled && (
                <span style={{ fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--text4)' }}>
                  Politika devre dışı — önce gün sayısı girin
                </span>
              )}
            </div>
            {enforceResult && (
              <div style={{
                marginTop: 12, padding: 12,
                background: enforceResult.skipped ? 'var(--surface2)' : 'rgba(39,201,106,.08)',
                border: `1px solid ${enforceResult.skipped ? 'var(--border)' : 'rgba(39,201,106,.25)'}`,
                borderRadius: 6, fontFamily: 'var(--mono)', fontSize: 11,
              }}>
                {enforceResult.skipped
                  ? '⚠ Atlandı — politika devre dışı'
                  : `✓ ${enforceResult.processed}/${enforceResult.candidates} personel anonimleştirildi (${enforceResult.retention_days} gün)`
                }
                {enforceResult.errors > 0 && (
                  <span style={{ color: 'var(--red)', marginLeft: 8 }}>· {enforceResult.errors} hata</span>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Personel Anonimleştir */}
      <div className="panel fade-up-3" style={{ marginBottom: 16 }}>
        <div className="panel-header"><div className="panel-title">PERSONEL ANONİMLEŞTİR (m.11)</div></div>
        <div className="panel-body">
          <p style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--text3)', marginBottom: 12 }}>
            Çıkış yapmış bir personelin TC/pasaport/telefon/fotoğraf alanlarını kalıcı olarak NULL yap.
            Kayıt silinmez; yalnızca kişisel tanımlayıcılar temizlenir.
          </p>
          <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
            <input
              type="number"
              value={anonId}
              onChange={e => { setAnonId(e.target.value); setAnonResult(null) }}
              placeholder="Personel ID"
              style={{
                padding: '8px 12px', background: 'var(--bg)',
                border: '1px solid var(--border)', borderRadius: 6,
                fontFamily: 'var(--mono)', fontSize: 12, color: 'var(--text)', width: 160,
              }}
            />
            <button
              type="button"
              disabled={anonymize.isPending || !anonId}
              onClick={() => anonymize.mutate(parseInt(anonId, 10))}
              style={{
                padding: '8px 18px',
                background: 'rgba(239,68,68,.15)', color: 'var(--red)',
                border: '1px solid rgba(239,68,68,.3)',
                borderRadius: 6, cursor: 'pointer',
                fontFamily: 'var(--display)', letterSpacing: 2, fontSize: 11,
                opacity: anonymize.isPending ? 0.6 : 1,
              }}
            >{anonymize.isPending ? 'İŞLENİYOR...' : 'ANONİMLEŞTİR'}</button>
          </div>
          {anonResult && (
            <div style={{
              marginTop: 12, padding: 10,
              background: anonResult.ok ? 'rgba(39,201,106,.08)' : 'rgba(239,68,68,.08)',
              border: `1px solid ${anonResult.ok ? 'rgba(39,201,106,.25)' : 'rgba(239,68,68,.3)'}`,
              borderRadius: 6, fontFamily: 'var(--mono)', fontSize: 10,
              color: anonResult.ok ? 'var(--green)' : 'var(--red)',
            }}>
              {anonResult.ok
                ? `✓ Personel #${anonResult.personnel_id} anonimleştirildi (${anonResult.anonymized_at?.slice(0, 10)})`
                : `✗ ${anonResult.error}`}
            </div>
          )}
        </div>
      </div>

      {/* Kişisel Veri Export */}
      <div className="panel fade-up-4">
        <div className="panel-header"><div className="panel-title">KİŞİSEL VERİ EXPORT</div></div>
        <div className="panel-body">
          <p style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--text3)', marginBottom: 12 }}>
            Bir personelin kayıtlı tüm kişisel verisini JSON dosyası olarak indir (KVKK m.11 — bilgi alma hakkı).
            Export edilen veriler: kişi bilgisi, oda atamaları, arıza talepleri, disiplin kayıtları, çamaşır kayıtları, notlar, audit log.
          </p>
          <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
            <input
              type="number"
              value={exportId}
              onChange={e => setExportId(e.target.value)}
              placeholder="Personel ID"
              style={{
                padding: '8px 12px', background: 'var(--bg)',
                border: '1px solid var(--border)', borderRadius: 6,
                fontFamily: 'var(--mono)', fontSize: 12, color: 'var(--text)',
                width: 160,
              }}
            />
            <button
              type="button"
              onClick={handleExport}
              style={{
                padding: '8px 18px', background: 'var(--accent2, #6366f1)',
                color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer',
                fontFamily: 'var(--display)', letterSpacing: 2, fontSize: 11,
              }}
            >↓ EXPORT</button>
          </div>
          {exportError && (
            <div style={{
              marginTop: 12, padding: 10, background: 'rgba(239,68,68,0.1)',
              border: '1px solid rgba(239,68,68,0.3)', borderRadius: 6,
              fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--red)',
            }}>{exportError}</div>
          )}
        </div>
      </div>
    </div>
  )
}
