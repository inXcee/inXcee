import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import api from '../../shared/api/client.js'

const DAYS = ['Paz','Pzt','Sal','Çar','Per','Cum','Cmt']
const MINUTES = [0, 15, 30, 45]
const SECTIONS = [
  { key:'occupancy',   label:'Doluluk' },
  { key:'housekeeping',label:'Temizlik' },
  { key:'maintenance', label:'Arıza' },
  { key:'laundry',     label:'Çamaşır' },
  { key:'checkinout',  label:'Giriş/Çıkış' },
]

function Panel({ title, children }) {
  return (
    <div className="panel" style={{ marginBottom: '20px' }}>
      <div style={{ height:'2px', background:'var(--accent)' }} />
      <div className="panel-header"><div className="panel-title">{title}</div></div>
      <div className="panel-body">{children}</div>
    </div>
  )
}

export default function SettingsPage() {
  const qc = useQueryClient()
  const [toast, setToast] = useState(null)
  const [showSmtpPass, setShowSmtpPass] = useState(false)
  const [previewHtml, setPreviewHtml] = useState(null)
  const [previewLoading, setPreviewLoading] = useState(false)

  const { data: kioskCfg, isLoading: kioskLoading } = useQuery({
    queryKey: ['kiosk-settings'],
    queryFn: () => api.get('/settings/email/kiosk').then(r => r.data),
  })
  const saveKiosk = useMutation({
    mutationFn: body => api.put('/settings/email/kiosk', body),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['kiosk-settings'] }); showToast('Kiosk ayarı kaydedildi','success') },
    onError: e => showToast(e.response?.data?.error ?? 'Hata','error'),
  })

  const { data, isLoading } = useQuery({
    queryKey: ['email-settings'],
    queryFn: () => api.get('/settings/email').then(r => r.data),
  })
  const { data: emailLog = [] } = useQuery({
    queryKey: ['email-log'],
    queryFn: () => api.get('/settings/email/log').then(r => r.data),
  })

  const [form, setForm] = useState(null)
  const current = form ?? data

  const save = useMutation({
    mutationFn: body => api.put('/settings/email', body),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['email-settings'] }); setForm(null); showToast('Ayarlar kaydedildi','success') },
    onError: e => showToast(e.response?.data?.error ?? 'Hata','error'),
  })
  const testSend = useMutation({
    mutationFn: () => api.post('/settings/email/test'),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['email-log'] }); showToast('Test e-postası gönderildi','success') },
    onError: e => showToast(e.response?.data?.error ?? 'Gönderim hatası','error'),
  })

  function showToast(msg, type) { setToast({ msg, type }); setTimeout(() => setToast(null), 3500) }

  function patch(obj) { setForm(f => ({ ...(f ?? data), ...obj })) }
  function patchSmtp(obj) { setForm(f => ({ ...(f ?? data), smtp: { ...(f ?? data)?.smtp, ...obj } })) }

  function toggleDay(idx) {
    const days = current?.days ?? [1,2,3,4,5]
    patch({ days: days.includes(idx) ? days.filter(d => d !== idx) : [...days, idx].sort((a,b) => a-b) })
  }
  function toggleSection(key) {
    const sections = current?.sections ?? SECTIONS.map(s => s.key)
    patch({ sections: sections.includes(key) ? sections.filter(s => s !== key) : [...sections, key] })
  }

  async function handlePreview() {
    setPreviewLoading(true)
    try {
      const res = await api.get('/settings/email/preview', { responseType:'text' })
      setPreviewHtml(res.data)
    } catch(e) { showToast('Önizleme yüklenemedi','error') }
    finally { setPreviewLoading(false) }
  }

  function handleSave(e) {
    e.preventDefault()
    const days = current.days ?? [1,2,3,4,5]
    if (days.length === 0) return showToast('En az 1 gün seçilmeli','error')
    save.mutate({
      enabled: current.enabled,
      hour:    parseInt(current.hour, 10),
      minute:  parseInt(current.minute, 10),
      cc:      current.cc ?? '',
      days,
      sections: current.sections ?? SECTIONS.map(s => s.key),
      smtp: current.smtp ?? {},
    })
  }

  if (isLoading || !current) return <div style={{ padding:'32px' }}>Yükleniyor...</div>

  return (
    <div style={{ padding:'24px', maxWidth:'600px' }}>
      <h2 style={{ fontSize:'24px', letterSpacing:'4px', marginBottom:'4px' }}>AYARLAR</h2>
      <p style={{ fontFamily:'var(--mono)', fontSize:'10px', color:'var(--text3)', marginBottom:'24px', letterSpacing:'2px' }}>
        E-POSTA RAPORU KONFIGURASYONU
      </p>

      {toast && (
        <div style={{ padding:'10px 16px', marginBottom:'16px', borderRadius:'6px',
          background: toast.type==='success' ? '#dcfce7' : '#fee2e2',
          color: toast.type==='success' ? '#166534' : '#991b1b',
          border: `1px solid ${toast.type==='success' ? '#86efac' : '#fca5a5'}` }}>
          {toast.msg}
        </div>
      )}

      <form onSubmit={handleSave}>
        {/* Bölüm 1: Zamanlama */}
        <Panel title="ZAMANLAMA">
          <div style={{ display:'flex', alignItems:'center', gap:'12px', marginBottom:'16px' }}>
            <label style={{ fontSize:'13px', fontWeight:600 }}>E-posta Raporu</label>
            <button type="button" onClick={() => patch({ enabled: !current.enabled })}
              style={{ width:'44px', height:'24px', borderRadius:'12px', border:'none', cursor:'pointer',
                background: current.enabled ? 'var(--accent)' : '#cbd5e1', position:'relative', transition:'background 0.2s' }}>
              <span style={{ position:'absolute', top:'3px', left: current.enabled ? '22px' : '3px',
                width:'18px', height:'18px', borderRadius:'50%', background:'#fff', transition:'left 0.2s', display:'block' }} />
            </button>
            <span style={{ fontSize:'12px', color:'#64748b' }}>{current.enabled ? 'Aktif' : 'Kapalı'}</span>
          </div>
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'12px', marginBottom:'16px' }}>
            <div>
              <label className="form-label">GÖNDERİM SAATİ (0-23)</label>
              <input type="number" min="0" max="23" className="form-input"
                value={current.hour} onChange={e => patch({ hour: e.target.value })} />
            </div>
            <div>
              <label className="form-label">DAKİKA</label>
              <select className="form-select" value={current.minute}
                onChange={e => patch({ minute: parseInt(e.target.value, 10) })}>
                {MINUTES.map(m => <option key={m} value={m}>{String(m).padStart(2,'0')}</option>)}
              </select>
            </div>
          </div>
          <div>
            <label className="form-label">CC ADRESİ (OPSİYONEL)</label>
            <input type="email" className="form-input" placeholder="cc@ornek.com"
              value={current.cc ?? ''} onChange={e => patch({ cc: e.target.value })} />
          </div>
        </Panel>

        {/* Bölüm 2: Gün Seçimi */}
        <Panel title="GÜN SEÇİMİ">
          <p style={{ fontSize:'12px', color:'#64748b', marginBottom:'12px' }}>Hangi günler rapor gönderilsin?</p>
          <div style={{ display:'flex', gap:'6px', flexWrap:'wrap' }}>
            {DAYS.map((d, i) => {
              const selected = (current.days ?? [1,2,3,4,5]).includes(i)
              return (
                <button key={i} type="button" onClick={() => toggleDay(i)}
                  style={{ padding:'6px 12px', borderRadius:'8px', border:'none', cursor:'pointer', fontSize:'13px', fontWeight:600,
                    background: selected ? 'var(--accent)' : '#e2e8f0', color: selected ? '#fff' : '#64748b', transition:'all 0.15s' }}>
                  {d}
                </button>
              )
            })}
          </div>
        </Panel>

        {/* Bölüm 3: Rapor Bölümleri */}
        <Panel title="RAPOR BÖLÜMLERİ">
          <p style={{ fontSize:'12px', color:'#64748b', marginBottom:'12px' }}>E-postaya hangi bölümler dahil edilsin?</p>
          <div style={{ display:'flex', gap:'8px', flexWrap:'wrap' }}>
            {SECTIONS.map(({ key, label }) => {
              const selected = (current.sections ?? SECTIONS.map(s => s.key)).includes(key)
              return (
                <button key={key} type="button" onClick={() => toggleSection(key)}
                  style={{ padding:'6px 14px', borderRadius:'8px', border:'none', cursor:'pointer', fontSize:'13px', fontWeight:600,
                    background: selected ? '#dcfce7' : '#e2e8f0', color: selected ? '#166534' : '#64748b', transition:'all 0.15s' }}>
                  {selected ? '✓ ' : ''}{label}
                </button>
              )
            })}
          </div>
        </Panel>

        {/* Bölüm 4: SMTP */}
        <Panel title="SMTP AYARLARI">
          <p style={{ fontSize:'12px', color:'#64748b', marginBottom:'12px' }}>Boş bırakılırsa .env ayarları kullanılır.</p>
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'12px', marginBottom:'12px' }}>
            <div>
              <label className="form-label">HOST</label>
              <input className="form-input" placeholder="smtp.gmail.com"
                value={current.smtp?.host ?? ''} onChange={e => patchSmtp({ host: e.target.value })} />
            </div>
            <div>
              <label className="form-label">PORT</label>
              <input type="number" className="form-input" placeholder="587"
                value={current.smtp?.port ?? ''} onChange={e => patchSmtp({ port: e.target.value })} />
            </div>
          </div>
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'12px', marginBottom:'12px' }}>
            <div>
              <label className="form-label">KULLANICI</label>
              <input className="form-input" placeholder="user@ornek.com"
                value={current.smtp?.user ?? ''} onChange={e => patchSmtp({ user: e.target.value })} />
            </div>
            <div>
              <label className="form-label">ŞİFRE</label>
              <div style={{ position:'relative' }}>
                <input type={showSmtpPass ? 'text' : 'password'} className="form-input"
                  placeholder="●●●●" style={{ paddingRight:'36px' }}
                  value={current.smtp?.pass ?? ''} onChange={e => patchSmtp({ pass: e.target.value })} />
                <button type="button" onClick={() => setShowSmtpPass(v => !v)}
                  style={{ position:'absolute', right:'8px', top:'50%', transform:'translateY(-50%)', background:'none', border:'none', cursor:'pointer', color:'#94a3b8', fontSize:'14px' }}>
                  {showSmtpPass ? '🙈' : '👁️'}
                </button>
              </div>
            </div>
          </div>
          <div>
            <label className="form-label">FROM ADRESİ</label>
            <input className="form-input" placeholder="YYS <noreply@yys.local>"
              value={current.smtp?.from ?? ''} onChange={e => patchSmtp({ from: e.target.value })} />
          </div>
        </Panel>

        {/* Bölüm 4b: Kiosk Giriş Yöntemi */}
        <Panel title="KİOSK GİRİŞ YÖNTEMİ">
          <p style={{ fontSize:'12px', color:'#64748b', marginBottom:'12px' }}>Personel kiosk ekranına nasıl giriş yapabilsin?</p>
          {kioskLoading ? <p style={{ fontSize:'13px', color:'#94a3b8' }}>Yükleniyor...</p> : (
            <div style={{ display:'flex', gap:'8px', flexWrap:'wrap' }}>
              {[
                { val:'tc_no', label:'TC No + PIN' },
                { val:'name',  label:'İsimle Ara + PIN' },
                { val:'both',  label:'Her İkisi (kullanıcı seçer)' },
              ].map(({ val, label }) => (
                <button key={val} type="button"
                  onClick={() => saveKiosk.mutate({ login_method: val })}
                  style={{ padding:'8px 16px', borderRadius:'8px', border:'none', cursor:'pointer', fontSize:'13px', fontWeight:600, transition:'all 0.15s',
                    background: (kioskCfg?.login_method ?? 'both') === val ? 'var(--accent)' : '#e2e8f0',
                    color: (kioskCfg?.login_method ?? 'both') === val ? '#fff' : '#64748b' }}>
                  {(kioskCfg?.login_method ?? 'both') === val ? '✓ ' : ''}{label}
                </button>
              ))}
            </div>
          )}
        </Panel>

        {/* Kaydet + Test butonları */}
        <div style={{ display:'flex', gap:'8px', marginBottom:'24px' }}>
          <button type="submit" className="btn btn-primary" disabled={save.isPending}>
            {save.isPending ? 'Kaydediliyor...' : 'Kaydet'}
          </button>
          <button type="button" className="btn btn-secondary" disabled={testSend.isPending} onClick={() => testSend.mutate()}>
            {testSend.isPending ? 'Gönderiliyor...' : 'Test Gönder'}
          </button>
        </div>
      </form>

      {/* Bölüm 5: Önizleme */}
      <Panel title="E-POSTA ÖNİZLEME">
        <button type="button" className="btn btn-secondary" onClick={handlePreview} disabled={previewLoading}>
          {previewLoading ? 'Yükleniyor...' : '👁️ Önizle'}
        </button>
        {previewHtml && (
          <div style={{ marginTop:'16px', border:'1px solid #e2e8f0', borderRadius:'8px', overflow:'hidden' }}>
            <iframe srcDoc={previewHtml} style={{ width:'100%', height:'500px', border:'none' }} title="E-posta önizleme" />
          </div>
        )}
      </Panel>

      {/* Bölüm 6: Gönderim Geçmişi */}
      <Panel title="GÖNDERİM GEÇMİŞİ">
        {emailLog.length === 0 ? (
          <p style={{ fontSize:'13px', color:'#94a3b8' }}>Henüz gönderim yok</p>
        ) : (
          <table style={{ width:'100%', borderCollapse:'collapse', fontSize:'12px' }}>
            <thead>
              <tr style={{ borderBottom:'1px solid #e2e8f0' }}>
                <th style={{ padding:'6px 8px', textAlign:'left', color:'#64748b' }}>Tarih</th>
                <th style={{ padding:'6px 8px', textAlign:'left', color:'#64748b' }}>Alıcı</th>
                <th style={{ padding:'6px 8px', textAlign:'left', color:'#64748b' }}>Durum</th>
              </tr>
            </thead>
            <tbody>
              {emailLog.map(row => (
                <tr key={row.id} style={{ borderBottom:'1px solid #f1f5f9' }}>
                  <td style={{ padding:'6px 8px', color:'#475569' }}>{new Date(row.sent_at).toLocaleString('tr-TR')}</td>
                  <td style={{ padding:'6px 8px', color:'#475569', maxWidth:'180px', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{row.recipients}</td>
                  <td style={{ padding:'6px 8px' }}>
                    {row.status === 'success'
                      ? <span style={{ color:'#16a34a', fontWeight:600 }}>✓ Başarılı</span>
                      : <span style={{ color:'#dc2626', fontWeight:600 }} title={row.error_msg}>✗ Hata</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Panel>
    </div>
  )
}
