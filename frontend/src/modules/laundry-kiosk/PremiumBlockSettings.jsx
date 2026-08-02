import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { blockDisplayName } from '../../shared/blocks.js'

export default function PremiumBlockSettings({ kioskApi }) {
  const [open, setOpen] = useState(false)
  const queryClient = useQueryClient()
  const configQuery = useQuery({
    queryKey: ['laundry-kiosk-block-config'],
    queryFn: () => kioskApi
      .get('/self-service/laundry-kiosk/block-config')
      .then(response => response.data),
    staleTime: 60000,
    enabled: open,
  })
  const mutation = useMutation({
    mutationFn: ({ block, isPremium }) => kioskApi.put(
      `/self-service/laundry-kiosk/block-config/${encodeURIComponent(block)}`,
      { is_premium: isPremium },
    ),
    onSuccess: response => {
      queryClient.setQueryData(['laundry-kiosk-block-config'], current => (
        (current || []).map(item => item.block === response.data.block
          ? { ...item, ...response.data }
          : item)
      ))
    },
  })

  const rows = Array.isArray(configQuery.data) ? configQuery.data : []
  const premiumCount = rows.filter(row => row.is_premium === 1).length

  return (
    <div style={panel}>
      <button type="button" onClick={() => setOpen(value => !value)} style={headerButton}>
        <span style={{ textAlign: 'left' }}>
          <span style={eyebrow}>HİZMET AYARI</span>
          <strong style={{ display: 'block', color: '#f1f5f9', marginTop: 3 }}>
            ♨️ Premium blokları ayarla
          </strong>
          <small style={{ display: 'block', color: '#94a3b8', marginTop: 3 }}>
            {rows.length > 0
              ? `${premiumCount} blokta ütü açık · M/S daima standart`
              : 'Blok ayarlarını görüntüle · M/S daima standart'}
          </small>
        </span>
        <span style={{ color: '#c4b5fd', fontWeight: 900 }}>{open ? '▲' : '▼'}</span>
      </button>

      {open && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div style={notice}>
            Premium kapatılırsa aktif ütü işleri hazıra alınır ve giriş/teslim imzası zorunlu olur.
            Premium bloklarda imza isteğe bağlıdır. M ve S bloklarında ütü hiçbir zaman açılamaz.
          </div>
          {configQuery.isLoading && <div style={muted}>Bloklar yükleniyor…</div>}
          {configQuery.isError && <div style={errorBox}>Blok ayarları yüklenemedi</div>}
          <div style={grid}>
            {rows.map(row => {
              const premium = row.is_premium === 1
              const saving = mutation.isPending && mutation.variables?.block === row.block
              return (
                <button
                  key={row.block}
                  type="button"
                  disabled={row.locked || saving}
                  aria-pressed={premium}
                  aria-label={`${blockDisplayName(row.block)} bloğu ${premium ? 'premium' : 'standart'}`}
                  onClick={() => mutation.mutate({ block: row.block, isPremium: !premium })}
                  style={blockButton(premium, row.locked)}
                >
                  <strong style={{ fontSize: 16 }}>{blockDisplayName(row.block)}</strong>
                  <span style={{ fontSize: 10 }}>{saving ? 'Kaydediliyor…' : premium ? 'ÜTÜ AÇIK · İMZA OPS.' : 'STANDART · İMZA ŞART'}</span>
                  {row.locked && <span style={{ fontSize: 9, color: '#64748b' }}>KİLİTLİ</span>}
                </button>
              )
            })}
          </div>
          {mutation.isError && (
            <div style={errorBox}>{mutation.error?.response?.data?.error || 'Ayar kaydedilemedi'}</div>
          )}
        </div>
      )}
    </div>
  )
}

const panel = {
  borderRadius: 13, border: '1px solid #334155', background: '#111827', padding: 11,
}
const headerButton = {
  width: '100%', minHeight: 58, padding: 0, border: 0, background: 'transparent',
  display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer',
}
const eyebrow = { display: 'block', color: '#64748b', fontSize: 9, letterSpacing: 1.1, fontWeight: 900 }
const notice = {
  color: '#c4b5fd', background: 'rgba(109,40,217,.12)', border: '1px solid rgba(139,92,246,.3)',
  borderRadius: 9, padding: '9px 10px', fontSize: 11, lineHeight: 1.45,
}
const grid = { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(94px, 1fr))', gap: 7 }
const blockButton = (premium, locked) => ({
  minHeight: 72, borderRadius: 11, border: `1px solid ${premium ? '#7c3aed' : '#334155'}`,
  background: locked ? '#111827' : premium ? 'rgba(109,40,217,.24)' : '#1e293b',
  color: locked ? '#64748b' : premium ? '#ddd6fe' : '#cbd5e1',
  display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 3,
  cursor: locked ? 'not-allowed' : 'pointer', opacity: locked ? 0.75 : 1,
})
const muted = { color: '#64748b', fontSize: 12, textAlign: 'center', padding: 10 }
const errorBox = { borderRadius: 9, padding: 9, background: '#2b1117', color: '#fecaca', fontSize: 11 }
