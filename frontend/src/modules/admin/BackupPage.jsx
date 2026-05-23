import { useRef, useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import api from '../../shared/api/client.js'
import HelpHint from '../../shared/components/HelpHint.jsx'
import { confirmDialog } from '../../shared/components/ConfirmDialog.jsx'
import { SkeletonTable } from '../../shared/components/Skeleton.jsx'

function formatSize(bytes) {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`
}

export default function BackupPage() {
  const qc = useQueryClient()
  const fileRef = useRef(null)
  const [restoreError, setRestoreError] = useState('')
  const [restoreOk, setRestoreOk] = useState('')

  const { data: backups = [], isLoading } = useQuery({
    queryKey: ['backups'],
    queryFn: () => api.get('/backup/list').then(r => r.data),
    refetchInterval: 30_000,
  })

  const runBackup = useMutation({
    mutationFn: () => api.post('/backup/run'),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['backups'] }),
  })

  const deleteBackup = useMutation({
    mutationFn: (name) => api.delete(`/backup/${name}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['backups'] }),
  })

  const restore = useMutation({
    mutationFn: (file) => {
      const fd = new FormData()
      fd.append('backup', file)
      return api.post('/backup/restore', fd, { headers: { 'Content-Type': 'multipart/form-data' } })
    },
    onSuccess: (res) => {
      setRestoreOk(`Geri yükleme tamam. Pre-restore yedeği: ${res.data.pre_restore_backup}. ${res.data.requires_restart ? 'Sunucu yeniden başlatılmalı (PM2 otomatik yapacak).' : ''}`)
      setRestoreError('')
      if (fileRef.current) fileRef.current.value = ''
      qc.invalidateQueries({ queryKey: ['backups'] })
    },
    onError: (err) => {
      setRestoreError(err.response?.data?.error || 'Geri yükleme hatası')
      setRestoreOk('')
    },
  })

  const handleDownload = async (name) => {
    const res = await api.get(`/backup/download/${name}`, { responseType: 'blob' })
    const blob = new Blob([res.data], { type: 'application/octet-stream' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = name
    a.click()
    URL.revokeObjectURL(url)
  }

  const handleRestore = async () => {
    const file = fileRef.current?.files?.[0]
    if (!file) {
      setRestoreError('Dosya seçilmedi')
      return
    }
    const ok = await confirmDialog({
      title: 'Veritabanını Geri Yükle',
      body: `DİKKAT: Mevcut veritabanı tamamen değiştirilecek!\n\nYeni dosya: ${file.name} (${formatSize(file.size)})\n\nMevcut DB önce otomatik yedeklenecek (yys_pre-restore_*.db).\nSunucu yeniden başlatılacak. Devam edilsin mi?`,
      confirmLabel: 'Geri Yükle',
      danger: true,
    })
    if (!ok) return
    restore.mutate(file)
  }

  return (
    <div>
      <div className="fade-up" style={{ marginBottom: 24 }}>
        <h2 style={{ fontSize: 28, letterSpacing: 4 }}>
          YEDEKLEME<HelpHint topic="backup" title="YEDEKLEME" />
        </h2>
        <p style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--text3)', letterSpacing: 1, marginTop: 4 }}>
          VERİTABANI YEDEK YÖNETİMİ · OTOMATİK GECE 03:00 · 7 GÜN SAKLAMA
        </p>
      </div>

      <div className="panel fade-up-1" style={{ marginBottom: 16 }}>
        <div className="panel-body" style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
          <button
            type="button"
            disabled={runBackup.isPending}
            onClick={() => runBackup.mutate()}
            style={{
              padding: '10px 20px', background: 'var(--accent)', color: '#000',
              border: 'none', borderRadius: 6, cursor: runBackup.isPending ? 'not-allowed' : 'pointer',
              fontFamily: 'var(--display)', letterSpacing: 2, fontSize: 11,
              opacity: runBackup.isPending ? 0.6 : 1,
            }}
          >{runBackup.isPending ? 'YEDEKLENİYOR...' : '+ ŞİMDİ YEDEKLE'}</button>
          <span style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--text3)' }}>
            Toplam: <strong style={{ color: 'var(--text)' }}>{backups.length}</strong> yedek
          </span>
          {runBackup.isError && (
            <span style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--red)' }}>
              {runBackup.error?.response?.data?.error || 'Hata'}
            </span>
          )}
          {runBackup.isSuccess && (
            <span style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--green)' }}>
              ✓ Yeni yedek alındı
            </span>
          )}
        </div>
      </div>

      {isLoading ? (
        <SkeletonTable rows={4} cols={4} />
      ) : backups.length === 0 ? (
        <div className="panel" style={{ padding: 48, textAlign: 'center' }}>
          <div style={{ fontSize: 32, marginBottom: 8 }}>📂</div>
          <div style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--text3)' }}>Henüz yedek yok</div>
        </div>
      ) : (
        <div className="panel" style={{ marginBottom: 24 }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--border)' }}>
                <Th>DOSYA ADI</Th>
                <Th>BOYUT</Th>
                <Th>OLUŞTURULMA</Th>
                <Th>İŞLEM</Th>
              </tr>
            </thead>
            <tbody>
              {backups.map(b => (
                <tr key={b.name} style={{ borderBottom: '1px solid var(--border)' }}>
                  <Td mono>{b.name}</Td>
                  <Td mono small>{formatSize(b.size)}</Td>
                  <Td mono small>{new Date(b.created_at).toLocaleString('tr-TR')}</Td>
                  <Td>
                    <div style={{ display: 'flex', gap: 6 }}>
                      <button type="button" onClick={() => handleDownload(b.name)}
                        style={btnStyle('#10b981')}>↓ İNDİR</button>
                      <button type="button"
                        onClick={async () => { if (await confirmDialog({ title: 'Yedek Sil', body: `${b.name} silinsin mi?`, danger: true })) deleteBackup.mutate(b.name) }}
                        style={btnStyle('#ef4444')}>SİL</button>
                    </div>
                  </Td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Restore */}
      <div className="panel fade-up-2" style={{ borderColor: 'rgba(239,68,68,0.4)' }}>
        <div className="panel-body">
          <h3 style={{ fontFamily: 'var(--display)', fontSize: 14, letterSpacing: 2, color: 'var(--red)', marginBottom: 8 }}>
            ⚠ GERİ YÜKLEME
          </h3>
          <p style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--text3)', marginBottom: 12 }}>
            Mevcut veritabanı tamamen değiştirilir. Önce mevcut DB otomatik yedeklenir.
            Geri yükleme sonrası sunucu yeniden başlatılır.
          </p>
          <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
            <input
              ref={fileRef}
              type="file"
              accept=".db"
              style={{
                fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--text2)',
                padding: 8, border: '1px solid var(--border)', borderRadius: 6,
              }}
            />
            <button
              type="button"
              disabled={restore.isPending}
              onClick={handleRestore}
              style={{
                padding: '8px 16px', background: 'rgba(239,68,68,0.15)',
                border: '1px solid rgba(239,68,68,0.4)', borderRadius: 6,
                fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--red)',
                cursor: restore.isPending ? 'not-allowed' : 'pointer',
                opacity: restore.isPending ? 0.6 : 1, fontWeight: 700,
              }}
            >{restore.isPending ? 'YÜKLENİYOR...' : 'GERİ YÜKLE'}</button>
          </div>
          {restoreError && (
            <div style={{ marginTop: 12, padding: 10, background: 'rgba(239,68,68,0.1)',
              border: '1px solid rgba(239,68,68,0.3)', borderRadius: 6,
              fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--red)' }}>
              {restoreError}
            </div>
          )}
          {restoreOk && (
            <div style={{ marginTop: 12, padding: 10, background: 'rgba(16,185,129,0.1)',
              border: '1px solid rgba(16,185,129,0.3)', borderRadius: 6,
              fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--green)' }}>
              ✓ {restoreOk}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

const btnStyle = (color) => ({
  padding: '4px 10px', background: `${color}15`,
  border: `1px solid ${color}40`, borderRadius: 4,
  fontFamily: 'var(--mono)', fontSize: 9, color, cursor: 'pointer', letterSpacing: 1,
})

function Th({ children }) {
  return <th style={{ padding: '10px 12px', textAlign: 'left', fontFamily: 'var(--mono)', fontSize: 9, letterSpacing: 1, color: 'var(--text3)', fontWeight: 600 }}>{children}</th>
}

function Td({ children, mono, small }) {
  return <td style={{ padding: '10px 12px', fontFamily: mono ? 'var(--mono)' : 'inherit', fontSize: small ? 10 : 12, color: 'var(--text2)' }}>{children}</td>
}
