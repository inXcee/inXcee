import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import api from '../../shared/api/client.js'

export default function ErrorLogPage() {
  const qc = useQueryClient()
  const [source, setSource] = useState('')
  const [severity, setSeverity] = useState('')
  const [selected, setSelected] = useState(null)

  const params = new URLSearchParams()
  if (source) params.set('source', source)
  if (severity) params.set('severity', severity)
  params.set('limit', '200')

  const { data, isLoading } = useQuery({
    queryKey: ['error-log', source, severity],
    queryFn: () => api.get(`/error-log?${params}`).then(r => r.data),
    refetchInterval: 30_000,
  })

  const deleteOne = useMutation({
    mutationFn: (id) => api.delete(`/error-log/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['error-log'] })
      setSelected(null)
    },
  })

  const clearAll = useMutation({
    mutationFn: () => api.delete('/error-log/all'),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['error-log'] }),
  })

  const items = data?.items || []
  const total = data?.total || 0

  return (
    <div>
      <div className="fade-up" style={{ marginBottom: 24 }}>
        <h2 style={{ fontSize: 28, letterSpacing: 4 }}>HATA LOGLARI</h2>
        <p style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--text3)', letterSpacing: 1, marginTop: 4 }}>
          FRONTEND + BACKEND HATA KAYITLARI · 30 GUN SAKLAMA
        </p>
      </div>

      <div className="panel fade-up-1" style={{ marginBottom: 16 }}>
        <div className="panel-body" style={{ display: 'flex', gap: 12, alignItems: 'flex-end', flexWrap: 'wrap' }}>
          <div>
            <label className="form-label">KAYNAK</label>
            <select className="form-select" style={{ width: 140 }} value={source} onChange={e => setSource(e.target.value)}>
              <option value="">Tumunu</option>
              <option value="frontend">Frontend</option>
              <option value="backend">Backend</option>
            </select>
          </div>
          <div>
            <label className="form-label">SEVIYE</label>
            <select className="form-select" style={{ width: 140 }} value={severity} onChange={e => setSeverity(e.target.value)}>
              <option value="">Tumunu</option>
              <option value="error">Error</option>
              <option value="warning">Warning</option>
            </select>
          </div>
          <div style={{ flex: 1 }} />
          <div style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--text2)' }}>
            Toplam: <strong style={{ color: 'var(--text)' }}>{total}</strong>
          </div>
          <button
            type="button"
            disabled={total === 0 || clearAll.isPending}
            onClick={() => {
              if (confirm(`${total} hata kaydinin tamami silinecek. Devam edilsin mi?`)) clearAll.mutate()
            }}
            style={{
              padding: '6px 14px', background: 'rgba(239,68,68,0.1)',
              border: '1px solid rgba(239,68,68,0.3)', borderRadius: 6,
              fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--red)',
              cursor: total === 0 ? 'not-allowed' : 'pointer', opacity: total === 0 ? 0.5 : 1,
            }}
          >TUMUNU SIL</button>
        </div>
      </div>

      {isLoading ? (
        <div style={{ padding: 40, textAlign: 'center', fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--text3)' }}>Yukleniyor...</div>
      ) : items.length === 0 ? (
        <div className="panel" style={{ padding: 48, textAlign: 'center' }}>
          <div style={{ fontSize: 40, marginBottom: 8 }}>✓</div>
          <div style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--text3)' }}>Kayitli hata yok</div>
        </div>
      ) : (
        <div className="panel">
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--border)' }}>
                <Th>TARIH</Th>
                <Th>KAYNAK</Th>
                <Th>SEVIYE</Th>
                <Th>MESAJ</Th>
                <Th>URL</Th>
                <Th>KULLANICI</Th>
                <Th>—</Th>
              </tr>
            </thead>
            <tbody>
              {items.map(it => (
                <tr key={it.id} style={{ borderBottom: '1px solid var(--border)', cursor: 'pointer' }}
                    onClick={() => setSelected(it.id)}>
                  <Td mono small>{new Date(it.created_at).toLocaleString('tr-TR')}</Td>
                  <Td>
                    <Badge color={it.source === 'frontend' ? '#6366f1' : '#10b981'}>{it.source}</Badge>
                  </Td>
                  <Td>
                    <Badge color={it.severity === 'warning' ? '#f59e0b' : '#ef4444'}>{it.severity}</Badge>
                  </Td>
                  <Td truncate>{it.message}</Td>
                  <Td mono small truncate>{it.url || '—'}</Td>
                  <Td small>{it.user_name || (it.user_id ? `#${it.user_id}` : '—')}</Td>
                  <Td>
                    <button
                      type="button"
                      onClick={(e) => { e.stopPropagation(); if (confirm('Silinsin mi?')) deleteOne.mutate(it.id) }}
                      style={{
                        padding: '2px 8px', background: 'transparent',
                        border: '1px solid var(--border)', borderRadius: 4,
                        fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--text3)', cursor: 'pointer',
                      }}
                    >SİL</button>
                  </Td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {selected && <ErrorDetail id={selected} onClose={() => setSelected(null)} />}
    </div>
  )
}

function ErrorDetail({ id, onClose }) {
  const { data } = useQuery({
    queryKey: ['error-log', id],
    queryFn: () => api.get(`/error-log/${id}`).then(r => r.data),
  })
  if (!data) return null

  return (
    <div onClick={onClose} style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 100,
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16,
    }}>
      <div onClick={e => e.stopPropagation()} style={{
        background: 'var(--surface)', border: '1px solid var(--border)',
        borderRadius: 12, padding: 24, maxWidth: 800, width: '100%',
        maxHeight: '85vh', overflowY: 'auto',
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <h3 style={{ fontFamily: 'var(--display)', fontSize: 16, letterSpacing: 2 }}>HATA #{data.id}</h3>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--text)', fontSize: 18, cursor: 'pointer' }}>×</button>
        </div>
        <DetailRow k="Tarih" v={new Date(data.created_at).toLocaleString('tr-TR')} />
        <DetailRow k="Kaynak" v={data.source} />
        <DetailRow k="Severity" v={data.severity} />
        <DetailRow k="Kullanıcı" v={data.user_name || data.user_id || 'Anonim'} />
        <DetailRow k="URL" v={data.url || '—'} />
        <DetailRow k="User Agent" v={data.user_agent || '—'} mono />
        <DetailRow k="Mesaj" v={data.message} mono multiline />
        {data.stack && <DetailRow k="Stack" v={data.stack} mono multiline />}
        {data.context && <DetailRow k="Context" v={data.context} mono multiline />}
      </div>
    </div>
  )
}

function DetailRow({ k, v, mono, multiline }) {
  return (
    <div style={{ marginBottom: 10 }}>
      <div style={{ fontFamily: 'var(--mono)', fontSize: 9, letterSpacing: 1, color: 'var(--text3)', marginBottom: 2 }}>{k.toUpperCase()}</div>
      <div style={{
        fontFamily: mono ? 'var(--mono)' : 'inherit', fontSize: 11, color: 'var(--text)',
        whiteSpace: multiline ? 'pre-wrap' : 'normal', wordBreak: 'break-all',
        background: multiline ? 'var(--bg)' : 'transparent', padding: multiline ? 8 : 0,
        borderRadius: 4, border: multiline ? '1px solid var(--border)' : 'none',
        maxHeight: multiline ? 200 : 'none', overflowY: 'auto',
      }}>{v}</div>
    </div>
  )
}

function Th({ children }) {
  return <th style={{ padding: '10px 12px', textAlign: 'left', fontFamily: 'var(--mono)', fontSize: 9, letterSpacing: 1, color: 'var(--text3)', fontWeight: 600 }}>{children}</th>
}

function Td({ children, mono, small, truncate }) {
  return <td style={{
    padding: '8px 12px',
    fontFamily: mono ? 'var(--mono)' : 'inherit',
    fontSize: small ? 10 : 12,
    color: 'var(--text2)',
    maxWidth: truncate ? 300 : 'none',
    whiteSpace: truncate ? 'nowrap' : 'normal',
    overflow: truncate ? 'hidden' : 'visible',
    textOverflow: truncate ? 'ellipsis' : 'clip',
  }}>{children}</td>
}

function Badge({ children, color }) {
  return <span style={{
    padding: '2px 8px', borderRadius: 4, fontSize: 9, fontFamily: 'var(--mono)',
    letterSpacing: 1, fontWeight: 600,
    background: `${color}20`, color, border: `1px solid ${color}40`,
  }}>{children}</span>
}
