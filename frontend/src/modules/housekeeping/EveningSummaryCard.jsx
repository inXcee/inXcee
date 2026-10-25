// Akşam saha özeti (docs/saha-ekrani.md → "Hermes akşam özeti"): Hermes'in Telegram'a gönderdiği metnin aynısı.
// Metin sunucuda kurulur; burada yalnız gösterilir ve kopyalanır.
import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import api from '../../shared/api/client.js'

export default function EveningSummaryCard({ date = '' }) {
  const [copied, setCopied] = useState(false)
  const query = useQuery({
    queryKey: ['evening-summary', date],
    queryFn: () => api.get(`/housekeeping/evening-summary${date ? `?date=${date}` : ''}`).then(r => r.data),
    refetchInterval: 5 * 60 * 1000,
  })
  const summary = query.data

  async function copy() {
    try {
      await navigator.clipboard.writeText(summary.text)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch { /* pano izni yoksa metin ekranda seçilebilir */ }
  }

  return (
    <div className="panel" style={{ marginBottom: '14px', padding: '16px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: '12px', flexWrap: 'wrap', alignItems: 'flex-start' }}>
        <div>
          <div className="panel-title">🌙 AKŞAM ÖZETİ</div>
          <div className="panel-subtitle" style={{ marginTop: '5px', maxWidth: '620px' }}>
            Hermes her akşam bu metni Telegram'a gönderir. Doluluk, temizlik, çamaşır ve sakin geri bildirimi tek bakışta.
          </div>
        </div>
        {summary && (
          <button type="button" className="btn btn-ghost btn-sm" onClick={copy}>{copied ? '✓ Kopyalandı' : 'Metni kopyala'}</button>
        )}
      </div>
      {query.isLoading && <div style={{ padding: '20px', textAlign: 'center', color: 'var(--text3)' }}>Özet hazırlanıyor…</div>}
      {query.isError && <div style={{ padding: '20px', textAlign: 'center' }}>Özet alınamadı.</div>}
      {summary && (
        <>
          {summary.alerts.length > 0 && (
            <div className="alert alert-warn" style={{ marginTop: '12px' }}>
              {`⚠ ${summary.alerts.length} dikkat satırı`}
            </div>
          )}
          <pre data-testid="evening-summary-text" style={{
            marginTop: '12px', whiteSpace: 'pre-wrap', wordBreak: 'break-word', fontFamily: 'inherit', fontSize: '13px',
            lineHeight: 1.55, background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: '8px', padding: '12px 14px',
          }}>{summary.text}</pre>
        </>
      )}
    </div>
  )
}
