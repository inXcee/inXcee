import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import api from '../../shared/api/client.js'

export default function AnnouncementsPage() {
  const qc = useQueryClient()
  const [toast, setToast] = useState(null)
  const [form, setForm] = useState({ title:'', body:'', expires_at:'' })

  const { data: list = [], isLoading } = useQuery({
    queryKey: ['admin-announcements'],
    queryFn: () => api.get('/announcements').then(r => r.data),
  })

  const create = useMutation({
    mutationFn: body => api.post('/announcements', body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin-announcements'] })
      setForm({ title:'', body:'', expires_at:'' })
      showToast('Duyuru oluşturuldu','success')
    },
    onError: e => showToast(e.response?.data?.error ?? 'Hata','error'),
  })
  const remove = useMutation({
    mutationFn: id => api.delete(`/announcements/${id}`),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['admin-announcements'] }); showToast('Duyuru silindi','success') },
    onError: e => showToast(e.response?.data?.error ?? 'Hata','error'),
  })

  function showToast(msg, type) { setToast({ msg, type }); setTimeout(() => setToast(null), 3000) }

  function handleSubmit(e) {
    e.preventDefault()
    if (!form.title.trim() || !form.body.trim()) return showToast('Başlık ve içerik gerekli','error')
    create.mutate({ title: form.title.trim(), body: form.body.trim(), expires_at: form.expires_at || null })
  }

  if (isLoading) return <div style={{ padding:'32px' }}>Yükleniyor...</div>

  return (
    <div style={{ padding:'24px', maxWidth:'700px' }}>
      <h2 style={{ fontSize:'24px', letterSpacing:'4px', marginBottom:'4px' }}>DUYURULAR</h2>
      <p style={{ fontFamily:'var(--mono)', fontSize:'10px', color:'var(--text3)', marginBottom:'24px', letterSpacing:'2px' }}>
        KİOSK DUYURU YÖNETİMİ
      </p>

      {toast && (
        <div style={{ padding:'10px 16px', marginBottom:'16px', borderRadius:'6px',
          background: toast.type==='success' ? '#dcfce7' : '#fee2e2',
          color: toast.type==='success' ? '#166534' : '#991b1b',
          border: `1px solid ${toast.type==='success' ? '#86efac' : '#fca5a5'}` }}>
          {toast.msg}
        </div>
      )}

      {/* Yeni Duyuru Formu */}
      <div className="panel" style={{ marginBottom:'24px' }}>
        <div style={{ height:'2px', background:'var(--accent)' }} />
        <div className="panel-header"><div className="panel-title">YENİ DUYURU</div></div>
        <div className="panel-body">
          <form onSubmit={handleSubmit}>
            <div style={{ marginBottom:'12px' }}>
              <label className="form-label">BAŞLIK</label>
              <input className="form-input" placeholder="Duyuru başlığı" maxLength={100}
                value={form.title} onChange={e => setForm(f => ({...f, title:e.target.value}))} />
            </div>
            <div style={{ marginBottom:'12px' }}>
              <label className="form-label">İÇERİK</label>
              <textarea className="form-input" rows={4} placeholder="Duyuru metni..."
                value={form.body} onChange={e => setForm(f => ({...f, body:e.target.value}))}
                style={{ resize:'vertical' }} />
            </div>
            <div style={{ marginBottom:'16px' }}>
              <label className="form-label">BİTİŞ TARİHİ (OPSİYONEL)</label>
              <input type="datetime-local" className="form-input"
                value={form.expires_at} onChange={e => setForm(f => ({...f, expires_at:e.target.value}))} />
              <p style={{ fontSize:'11px', color:'#94a3b8', marginTop:'4px' }}>Boş bırakılırsa duyuru süresiz görünür</p>
            </div>
            <button type="submit" className="btn btn-primary" disabled={create.isPending}>
              {create.isPending ? 'Oluşturuluyor...' : 'Duyuru Oluştur'}
            </button>
          </form>
        </div>
      </div>

      {/* Duyuru Listesi */}
      <div className="panel">
        <div style={{ height:'2px', background:'var(--accent)' }} />
        <div className="panel-header"><div className="panel-title">MEVCUT DUYURULAR ({list.length})</div></div>
        <div className="panel-body">
          {list.length === 0 ? (
            <p style={{ color:'#94a3b8', fontSize:'13px' }}>Henüz duyuru yok</p>
          ) : list.map(a => {
            const expired = a.expires_at && new Date(a.expires_at) < new Date()
            return (
              <div key={a.id} style={{ borderBottom:'1px solid #f1f5f9', paddingBottom:'16px', marginBottom:'16px' }}>
                <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start' }}>
                  <div style={{ flex:1 }}>
                    <div style={{ fontWeight:600, color: expired ? '#94a3b8' : '#1e293b', marginBottom:'4px' }}>
                      {a.title}
                      {expired && <span style={{ marginLeft:'8px', fontSize:'11px', color:'#94a3b8', fontWeight:'normal' }}>(süresi doldu)</span>}
                    </div>
                    <div style={{ fontSize:'13px', color:'#64748b', marginBottom:'6px', whiteSpace:'pre-line' }}>{a.body}</div>
                    <div style={{ fontSize:'11px', color:'#94a3b8' }}>
                      {new Date(a.created_at).toLocaleString('tr-TR')}
                      {a.expires_at && ` · ${new Date(a.expires_at).toLocaleDateString('tr-TR')} tarihinde sona erer`}
                    </div>
                  </div>
                  <button onClick={() => remove.mutate(a.id)} disabled={remove.isPending}
                    style={{ marginLeft:'16px', background:'#fee2e2', color:'#dc2626', border:'none', borderRadius:'6px',
                      padding:'6px 12px', cursor:'pointer', fontSize:'12px', fontWeight:600 }}>
                    Sil
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
