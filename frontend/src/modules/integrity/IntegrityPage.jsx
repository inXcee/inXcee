import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import api from '../../shared/api/client.js'
import { useToastStore } from '../../shared/store/toastStore.js'
import { confirmDialog } from '../../shared/components/ConfirmDialog.jsx'
import { SkeletonTable } from '../../shared/components/Skeleton.jsx'
import { useUrlParamState } from '../../shared/hooks/useUrlParamState.js'

const toast = (m, t = 'success') => useToastStore.getState().addToast(m, t)
const toastErr = (e) => toast(e?.response?.data?.error || 'Hata', 'error')

const TABS = [
  { key: 'scan',    label: '🔍 TUTARSIZLIK' },
  { key: 'kvkk',    label: '⚖ KVKK V2' },
  { key: 'audit',   label: '📋 AUDIT' },
  { key: 'backup',  label: '💾 YEDEK' },
]

const SEV = {
  critical: { color: 'var(--red)', label: '🔴 KRİTİK' },
  warning:  { color: 'var(--amber)', label: '🟡 UYARI' },
  info:     { color: 'var(--blue)', label: '🔵 BİLGİ' },
}

export default function IntegrityPage() {
  const [tab, setTab] = useUrlParamState('tab', 'scan')

  return (
    <div style={{ maxWidth: 1200 }} className="fade-up">
      <div style={{ marginBottom: 16 }}>
        <h1 style={{ fontSize: 28, letterSpacing: 4, color: 'var(--text)', margin: 0 }}>SİSTEM SAĞLAMLIĞI</h1>
        <p style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--text3)', marginTop: 4, letterSpacing: 1.5 }}>
          TUTARSIZLIK TARAMASI · KVKK · AUDIT · YEDEK
        </p>
      </div>

      <div style={{ display: 'flex', gap: 2, marginBottom: 14, background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: 3 }}>
        {TABS.map(t => (
          <button key={t.key} onClick={() => setTab(t.key)} style={{
            flex: 1, padding: '10px 14px', border: 'none', borderRadius: 9,
            background: tab === t.key ? 'var(--accent)' : 'transparent',
            color: tab === t.key ? '#000' : 'var(--text3)',
            fontSize: 11, fontWeight: 700, fontFamily: 'var(--mono)', letterSpacing: 1.5, cursor: 'pointer',
          }}>{t.label}</button>
        ))}
      </div>

      {tab === 'scan' && <ScanTab />}
      {tab === 'kvkk' && <KvkkTab />}
      {tab === 'audit' && <AuditTab />}
      {tab === 'backup' && <BackupTab />}
    </div>
  )
}

function ScanTab() {
  const [sev, setSev] = useState('')
  const { data, isLoading, refetch } = useQuery({
    queryKey: ['integrity-scan'],
    queryFn: () => api.get('/integrity/scan').then(r => r.data),
  })

  if (isLoading) return <SkeletonTable rows={8} cols={4} />
  const filtered = sev ? data.issues.filter(i => i.severity === sev) : data.issues

  return (
    <div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10, marginBottom: 14 }}>
        {Object.entries(SEV).map(([k, v]) => (
          <button key={k} onClick={() => setSev(sev === k ? '' : k)} style={{
            padding: 14, border: `1px solid ${sev === k ? v.color : 'var(--border)'}`, borderRadius: 12,
            background: sev === k ? `${v.color}1a` : 'var(--surface)',
            cursor: 'pointer', textAlign: 'left',
          }}>
            <div style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--text3)' }}>{v.label}</div>
            <div style={{ fontFamily: 'var(--display)', fontSize: 26, color: v.color, marginTop: 4 }}>{data.counts[k]}</div>
          </button>
        ))}
      </div>

      <div style={{ marginBottom: 10, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--text3)' }}>
          {filtered.length} bulgu{sev ? ` (${SEV[sev].label})` : ''}
        </span>
        <button onClick={() => refetch()} className="btn btn-ghost btn-sm">🔄 YENİDEN TARA</button>
      </div>

      {!filtered.length ? (
        <div style={{ padding: 50, textAlign: 'center', background: 'var(--surface)', borderRadius: 14, border: '1px solid var(--border)' }}>
          <div style={{ fontSize: 40, opacity: 0.3, marginBottom: 8 }}>✓</div>
          <div style={{ fontFamily: 'var(--display)', fontSize: 14 }}>TUTARSIZLIK BULUNAMADI</div>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {filtered.map((i, idx) => (
            <div key={idx} style={{
              padding: '10px 14px', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10,
              borderLeft: `4px solid ${SEV[i.severity].color}`,
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  {i.full_name && <strong style={{ fontSize: 13 }}>{i.full_name} </strong>}
                  <span style={{ fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--text3)' }}>· {i.kind}</span>
                </div>
                <span style={{ fontFamily: 'var(--mono)', fontSize: 9, color: SEV[i.severity].color }}>{SEV[i.severity].label}</span>
              </div>
              <div style={{ fontSize: 12, marginTop: 4 }}>{i.detail}</div>
            </div>
          ))}
        </div>
      )}
      <div style={{ marginTop: 14, fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--text4)' }}>
        Son tarama: {new Date(data.scanned_at).toLocaleString('tr-TR')}
      </div>
    </div>
  )
}

function KvkkTab() {
  const qc = useQueryClient()
  const [statusFilter, setStatusFilter] = useState('pending')
  const [creating, setCreating] = useState(false)
  const [form, setForm] = useState({ kind: 'erase', target_type: 'staff', target_id: '', requester_name: '', requester_contact: '', details: '' })

  const { data = [], isLoading } = useQuery({
    queryKey: ['kvkk-list', statusFilter],
    queryFn: () => api.get(`/integrity/kvkk${statusFilter ? `?status=${statusFilter}` : ''}`).then(r => r.data),
  })
  const inv = () => qc.invalidateQueries({ queryKey: ['kvkk-list'] })
  const createMut = useMutation({
    mutationFn: () => api.post('/integrity/kvkk', form),
    onSuccess: () => { toast('Talep oluşturuldu'); setCreating(false); setForm({ kind: 'erase', target_type: 'staff', target_id: '', requester_name: '', requester_contact: '', details: '' }); inv() },
    onError: toastErr,
  })
  const decideMut = useMutation({
    mutationFn: ({ id, decision }) => api.post(`/integrity/kvkk/${id}/decide`, { decision }),
    onSuccess: () => { toast('Karar verildi'); inv() }, onError: toastErr,
  })
  const execMut = useMutation({
    mutationFn: (id) => api.post(`/integrity/kvkk/${id}/execute`),
    onSuccess: () => { toast('Uygulandı'); inv() }, onError: toastErr,
  })

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 12 }}>
        <div style={{ display: 'flex', gap: 4 }}>
          {[['', 'TÜMÜ'], ['pending', 'BEKLİYOR'], ['approved', 'ONAY'], ['completed', 'TAMAM'], ['rejected', 'RED']].map(([s, l]) => (
            <button key={s} onClick={() => setStatusFilter(s)} className="btn btn-ghost btn-xs"
              style={{ borderRadius: 8, ...(statusFilter === s ? { background: 'var(--accent)', color: '#000' } : {}) }}>{l}</button>
          ))}
        </div>
        <button onClick={() => setCreating(true)} className="btn btn-primary btn-sm" style={{ borderRadius: 10 }}>+ TALEP</button>
      </div>

      {creating && (
        <div style={{ marginBottom: 14, padding: 14, background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, marginBottom: 8 }}>
            <select className="form-select" value={form.kind} onChange={e => setForm({ ...form, kind: e.target.value })} style={{ fontSize: 12 }}>
              <option value="access">Erişim</option>
              <option value="rectify">Düzeltme</option>
              <option value="erase">Silme</option>
              <option value="restrict">Sınırlama</option>
              <option value="portability">Aktarılabilirlik</option>
            </select>
            <select className="form-select" value={form.target_type} onChange={e => setForm({ ...form, target_type: e.target.value })} style={{ fontSize: 12 }}>
              <option value="staff">staff</option>
              <option value="personnel">personnel</option>
            </select>
            <input className="form-input" type="number" placeholder="Target ID" value={form.target_id}
              onChange={e => setForm({ ...form, target_id: e.target.value })} style={{ fontSize: 12 }} />
            <input className="form-input" placeholder="Talep eden adı *" value={form.requester_name}
              onChange={e => setForm({ ...form, requester_name: e.target.value })} style={{ fontSize: 12 }} />
            <input className="form-input" placeholder="İletişim" value={form.requester_contact}
              onChange={e => setForm({ ...form, requester_contact: e.target.value })} style={{ fontSize: 12 }} />
            <textarea className="form-input" rows={2} placeholder="Detaylar" value={form.details}
              onChange={e => setForm({ ...form, details: e.target.value })} style={{ fontSize: 12, gridColumn: '1/-1' }} />
          </div>
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 6 }}>
            <button onClick={() => setCreating(false)} className="btn btn-ghost btn-sm">İPTAL</button>
            <button onClick={() => createMut.mutate()} disabled={!form.target_id || !form.requester_name || createMut.isPending} className="btn btn-primary btn-sm">OLUŞTUR</button>
          </div>
        </div>
      )}

      {isLoading ? <SkeletonTable rows={5} cols={4} /> : !data.length ? (
        <div style={{ padding: 50, textAlign: 'center', background: 'var(--surface)', borderRadius: 14 }}>
          <div style={{ fontSize: 36, opacity: 0.3 }}>⚖</div>
          <div style={{ fontFamily: 'var(--display)', fontSize: 14, marginTop: 8 }}>KVKK TALEBİ YOK</div>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {data.map(r => (
            <div key={r.id} style={{ padding: 14, background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12,
              borderLeft: `4px solid ${r.status === 'completed' ? 'var(--green)' : r.status === 'rejected' ? 'var(--red)' : 'var(--amber)'}` }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 14, fontWeight: 700 }}>
                    {r.kind.toUpperCase()} · {r.target_type}:{r.target_id}
                  </div>
                  <div style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--text3)', marginTop: 2 }}>
                    Talep: {r.requester_name} {r.requester_contact && `· ${r.requester_contact}`}
                  </div>
                  {r.details && <div style={{ fontSize: 11, marginTop: 6, color: 'var(--text3)' }}>{r.details}</div>}
                  {r.executes_at && (
                    <div style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--amber)', marginTop: 4 }}>
                      ⏱ Uygulama: {new Date(r.executes_at).toLocaleDateString('tr-TR')}
                    </div>
                  )}
                </div>
                <span style={{ fontFamily: 'var(--mono)', fontSize: 9, padding: '3px 8px', borderRadius: 4, background: 'var(--surface2)' }}>
                  {r.status}
                </span>
              </div>
              {r.status === 'pending' && (
                <div style={{ display: 'flex', gap: 6, marginTop: 10 }}>
                  <button onClick={async () => { if (await confirmDialog({ title: 'Onayla', body: '7 gün sonra uygulanır', confirmLabel: 'Onayla' })) decideMut.mutate({ id: r.id, decision: 'approved' }) }}
                    className="btn btn-primary btn-sm">✓ ONAY</button>
                  <button onClick={() => decideMut.mutate({ id: r.id, decision: 'rejected' })} className="btn btn-ghost btn-sm" style={{ color: 'var(--red)' }}>✗ RED</button>
                </div>
              )}
              {r.status === 'approved' && (
                <button onClick={async () => { if (await confirmDialog({ title: 'Uygula', body: `${r.kind} işlemi GERİ ALINAMAZ. Devam?`, confirmLabel: 'UYGULA' })) execMut.mutate(r.id) }}
                  className="btn btn-primary btn-sm" style={{ marginTop: 10, background: 'var(--red)', color: '#fff' }}>⚡ ŞİMDİ UYGULA</button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function AuditTab() {
  const [days, setDays] = useState(30)
  const { data, isLoading } = useQuery({
    queryKey: ['audit-summary', days],
    queryFn: () => api.get(`/integrity/audit-summary?days=${days}`).then(r => r.data),
  })
  if (isLoading || !data) return <SkeletonTable rows={6} cols={3} />

  return (
    <div>
      <div style={{ marginBottom: 12, display: 'flex', gap: 6 }}>
        {[7, 30, 90].map(d => (
          <button key={d} onClick={() => setDays(d)} className="btn btn-ghost btn-xs"
            style={{ borderRadius: 8, ...(days === d ? { background: 'var(--accent)', color: '#000' } : {}) }}>{d}G</button>
        ))}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
        <div style={{ padding: 14, background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12 }}>
          <div style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--text3)', letterSpacing: 2, marginBottom: 10 }}>EN SIK AKSİYONLAR</div>
          {data.by_action.slice(0, 15).map(a => (
            <div key={a.action} style={{ display: 'flex', justifyContent: 'space-between', padding: '5px 0', borderBottom: '1px solid var(--border)', fontSize: 12 }}>
              <span style={{ fontFamily: 'var(--mono)' }}>{a.action}</span>
              <strong>{a.count}</strong>
            </div>
          ))}
        </div>

        <div style={{ padding: 14, background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12 }}>
          <div style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--text3)', letterSpacing: 2, marginBottom: 10 }}>EN AKTİF KULLANICILAR</div>
          {data.by_user.map(u => (
            <div key={u.username} style={{ display: 'flex', justifyContent: 'space-between', padding: '5px 0', borderBottom: '1px solid var(--border)', fontSize: 12 }}>
              <span>{u.full_name || u.username}</span>
              <strong>{u.count}</strong>
            </div>
          ))}
        </div>
      </div>

      <div style={{ marginTop: 14, padding: 14, background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12 }}>
        <div style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--text3)', letterSpacing: 2, marginBottom: 10 }}>GÜNLÜK AKTİVİTE</div>
        <div style={{ display: 'flex', alignItems: 'flex-end', gap: 3, height: 100 }}>
          {data.daily_trend.map(d => {
            const max = Math.max(...data.daily_trend.map(x => x.count), 1)
            const h = (d.count / max) * 80
            return (
              <div key={d.date} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }} title={`${d.date}: ${d.count}`}>
                <div style={{ width: '100%', height: h, background: 'var(--accent)', borderRadius: '2px 2px 0 0' }} />
                <div style={{ fontFamily: 'var(--mono)', fontSize: 7, color: 'var(--text4)' }}>{d.date.slice(8)}</div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

function BackupTab() {
  const { data } = useQuery({
    queryKey: ['backup-status'],
    queryFn: () => api.get('/integrity/backup-status').then(r => r.data),
  })

  return (
    <div>
      <div style={{ padding: 18, background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 14, marginBottom: 14 }}>
        <div style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--text3)', letterSpacing: 2, marginBottom: 8 }}>YEDEK SİSTEM</div>
        <p style={{ fontSize: 13, lineHeight: 1.6, color: 'var(--text3)' }}>
          PM2 cron her gece 03:00'te <code>/var/data/yys.db</code> dosyasını <code>/var/data/backups/</code> dizinine kopyalar.
          OFFSITE_BACKUP_CMD env değişkeni tanımlıysa rclone/aws s3/scp ile dış sunucuya da aktarır.
        </p>
        <p style={{ fontSize: 13, lineHeight: 1.6, color: 'var(--text3)', marginTop: 8 }}>
          <strong>Restore testi (sunucuda):</strong>
        </p>
        <pre style={{ background: '#000', color: '#0f0', padding: 10, borderRadius: 6, fontSize: 10, overflowX: 'auto' }}>
{`# Test ortamında geri yükleme
ssh root@89.167.55.173
cd /var/data/backups
ls -lt | head
cp yys-20260517.db /tmp/restore-test.db
sqlite3 /tmp/restore-test.db ".tables"
sqlite3 /tmp/restore-test.db "SELECT COUNT(*) FROM staff"`}
        </pre>
      </div>

      {data?.backups?.length > 0 ? (
        <div style={{ background: 'var(--surface)', borderRadius: 14, border: '1px solid var(--border)', overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
            <thead>
              <tr style={{ background: 'var(--surface2)' }}>
                <th style={{ padding: 10, textAlign: 'left', fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--text3)' }}>TARİH</th>
                <th style={{ padding: 10, textAlign: 'left', fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--text3)' }}>DOSYA</th>
                <th style={{ padding: 10, textAlign: 'right', fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--text3)' }}>BOYUT</th>
                <th style={{ padding: 10, fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--text3)' }}>OFFSITE</th>
              </tr>
            </thead>
            <tbody>
              {data.backups.map((b, i) => (
                <tr key={i} style={{ borderTop: '1px solid var(--border)' }}>
                  <td style={{ padding: 10, fontFamily: 'var(--mono)', fontSize: 10 }}>{new Date(b.created_at).toLocaleString('tr-TR')}</td>
                  <td style={{ padding: 10, fontFamily: 'var(--mono)', fontSize: 10 }}>{b.file_name || b.path || '—'}</td>
                  <td style={{ padding: 10, textAlign: 'right', fontFamily: 'var(--mono)', fontSize: 10 }}>{b.size_bytes ? (b.size_bytes / 1024 / 1024).toFixed(2) + ' MB' : '—'}</td>
                  <td style={{ padding: 10, textAlign: 'center', fontFamily: 'var(--mono)', color: b.offsite_ok ? 'var(--green)' : 'var(--text4)' }}>{b.offsite_ok ? '✓' : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div style={{ padding: 30, textAlign: 'center', color: 'var(--text4)', background: 'var(--surface)', borderRadius: 14 }}>
          {data?.message || 'Yedek kaydı bulunamadı'}
        </div>
      )}
    </div>
  )
}
