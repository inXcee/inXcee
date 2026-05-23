import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import api from '../../shared/api/client.js'
import { useAuthStore } from '../../shared/store/authStore.js'
import { SkeletonCard } from '../../shared/components/Skeleton.jsx'

export default function KvkkPage() {
  const { data, isLoading } = useQuery({
    queryKey: ['kvkk-policy'],
    queryFn: () => api.get('/kvkk/policy').then(r => r.data),
    staleTime: 5 * 60_000,
  })
  const token = useAuthStore(s => s.token)

  return (
    <div style={{
      minHeight: '100vh', background: 'var(--bg)', padding: '40px 16px',
      fontFamily: 'var(--mono)', color: 'var(--text)',
    }}>
      <div style={{ maxWidth: 760, margin: '0 auto' }}>
        <div style={{ marginBottom: 24, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h1 style={{ fontFamily: 'var(--display)', fontSize: 22, letterSpacing: 4 }}>KVKK AYDINLATMA METNİ</h1>
          <Link to={token ? '/' : '/login'} style={{
            fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--accent)',
            letterSpacing: 1, textDecoration: 'none',
          }}>← GERİ</Link>
        </div>

        {isLoading ? (
          <SkeletonCard lines={10} />
        ) : (
          <div className="panel">
            <div className="panel-body">
              <pre style={{
                whiteSpace: 'pre-wrap', wordBreak: 'break-word',
                fontFamily: 'var(--mono)', fontSize: 12, lineHeight: 1.7,
                color: 'var(--text2)', margin: 0,
              }}>{data?.text}</pre>
              {data?.is_default && (
                <p style={{ fontSize: 9, color: 'var(--text3)', marginTop: 16, fontStyle: 'italic' }}>
                  Bu metin sistem varsayılanıdır. Yöneticiniz tarafından özelleştirilebilir.
                </p>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
