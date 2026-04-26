import { useState, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import api from '../../shared/api/client.js'

export default function KvkkAdminPage() {
  const qc = useQueryClient()
  const [text, setText] = useState('')
  const [saved, setSaved] = useState(false)
  const [exportId, setExportId] = useState('')
  const [exportError, setExportError] = useState('')

  const { data, isLoading } = useQuery({
    queryKey: ['kvkk-policy'],
    queryFn: () => api.get('/kvkk/policy').then(r => r.data),
  })

  useEffect(() => {
    if (data?.text && !text) setText(data.text)
  }, [data, text])

  const save = useMutation({
    mutationFn: (newText) => api.put('/kvkk/policy', { text: newText }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['kvkk-policy'] })
      setSaved(true)
      setTimeout(() => setSaved(false), 3000)
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
        <h2 style={{ fontSize: 28, letterSpacing: 4 }}>KVKK YÖNETİMİ</h2>
        <p style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--text3)', letterSpacing: 1, marginTop: 4 }}>
          AYDINLATMA METNİ + KİŞİSEL VERİ EXPORT
        </p>
      </div>

      <div className="panel fade-up-1" style={{ marginBottom: 16 }}>
        <div className="panel-header"><div className="panel-title">AYDINLATMA METNİ</div></div>
        <div className="panel-body">
          {isLoading ? (
            <div style={{ color: 'var(--text3)', fontFamily: 'var(--mono)' }}>Yükleniyor...</div>
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

      <div className="panel fade-up-2">
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
