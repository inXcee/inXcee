import { useState, useMemo, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import api from '../../shared/api/client.js'
import { useToastStore } from '../../shared/store/toastStore.js'
import { confirmDialog } from '../../shared/components/ConfirmDialog.jsx'

const toastOk = (msg) => useToastStore.getState().addToast(msg, 'success')
const toastErr = (msg) => useToastStore.getState().addToast(msg, 'error')

// {{degisken}} yer tutucularını çıkar (backend extractVariables ile aynı desen)
function extractVars(text) {
  const set = new Set()
  const re = /\{\{\s*([\wğüşıöçĞÜŞİÖÇ]+)\s*\}\}/g
  let m
  while ((m = re.exec(text || '')) !== null) set.add(m[1])
  return [...set]
}

function fillVars(text, values) {
  return (text || '').replace(/\{\{\s*([\wğüşıöçĞÜŞİÖÇ]+)\s*\}\}/g, (_, k) => values[k] || `{{${k}}}`)
}

export default function MailComposePage() {
  const qc = useQueryClient()
  const [category, setCategory] = useState('rapor')
  const [activeTemplateId, setActiveTemplateId] = useState(null)
  const [rawSubject, setRawSubject] = useState('')
  const [rawBody, setRawBody] = useState('')
  const [varValues, setVarValues] = useState({})
  const [to, setTo] = useState('')
  const [cc, setCc] = useState('')
  const [sending, setSending] = useState(false)
  const [selectedAtt, setSelectedAtt] = useState([]) // seçili ek id'leri
  const [uploading, setUploading] = useState(false)

  const { data: tplData } = useQuery({
    queryKey: ['email-templates'],
    queryFn: () => api.get('/settings/email/templates').then(r => r.data),
  })
  const { data: contacts = [] } = useQuery({
    queryKey: ['email-contacts'],
    queryFn: () => api.get('/settings/email/contacts').then(r => r.data),
  })
  const { data: attachments = [] } = useQuery({
    queryKey: ['email-attachments'],
    queryFn: () => api.get('/settings/email/attachments').then(r => r.data),
  })

  const categories = tplData?.categories || []
  const templates = tplData?.templates || []
  const catTemplates = templates.filter(t => t.category === category)

  // Yer tutucular subject + body birleşiminden
  const vars = useMemo(() => extractVars(`${rawSubject}\n${rawBody}`), [rawSubject, rawBody])
  const finalSubject = fillVars(rawSubject, varValues)
  const finalBody = fillVars(rawBody, varValues)

  const pickTemplate = (t) => {
    setActiveTemplateId(t.id)
    setRawSubject(t.subject || '')
    setRawBody(t.body || '')
    setVarValues({})
  }

  const saveTemplate = useMutation({
    mutationFn: (payload) => api.post('/settings/email/templates', payload),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['email-templates'] }); toastOk('Şablon kaydedildi') },
    onError: (e) => toastErr(e?.response?.data?.error || 'Şablon kaydedilemedi'),
  })
  const deleteTemplate = useMutation({
    mutationFn: (id) => api.delete(`/settings/email/templates/${id}`),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['email-templates'] }); toastOk('Şablon silindi') },
    onError: (e) => toastErr(e?.response?.data?.error || 'Silinemedi'),
  })

  const deleteAttachment = useMutation({
    mutationFn: (id) => api.delete(`/settings/email/attachments/${id}`),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['email-attachments'] }); toastOk('Dosya silindi') },
    onError: (e) => toastErr(e?.response?.data?.error || 'Silinemedi'),
  })

  const uploadAttachment = async (file, existingId = null) => {
    const name = existingId
      ? (attachments.find(a => a.id === existingId)?.name || file.name)
      : (window.prompt('Dosya için kısa ad:', file.name) || '').trim()
    if (!existingId && !name) return
    const fd = new FormData()
    fd.append('file', file)
    fd.append('name', name)
    fd.append('category', existingId ? (attachments.find(a => a.id === existingId)?.category || 'genel') : 'genel')
    setUploading(true)
    try {
      if (existingId) await api.put(`/settings/email/attachments/${existingId}`, fd)
      else await api.post('/settings/email/attachments', fd)
      qc.invalidateQueries({ queryKey: ['email-attachments'] })
      toastOk(existingId ? 'Dosya güncellendi (yeni sürüm)' : 'Dosya arşive eklendi')
    } catch (e) {
      toastErr(e?.response?.data?.error || 'Yüklenemedi')
    } finally {
      setUploading(false)
    }
  }

  const toggleAtt = (id) => setSelectedAtt(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id])
  const fmtSize = (b) => b > 1048576 ? `${(b / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(b / 1024))} KB`

  const copyToClipboard = async () => {
    try {
      await navigator.clipboard.writeText(`Konu: ${finalSubject}\n\n${finalBody}`)
      toastOk('Mail metni panoya kopyalandı')
    } catch { toastErr('Kopyalanamadı') }
  }

  const send = async () => {
    if (!to.trim()) return toastErr('Alıcı girin')
    if (!finalSubject.trim()) return toastErr('Konu boş')
    if (!finalBody.trim()) return toastErr('Mesaj boş')
    setSending(true)
    try {
      await api.post('/settings/email/compose', { to, cc, subject: finalSubject, body: finalBody, attachmentIds: selectedAtt })
      toastOk('E-posta gönderildi')
    } catch (e) {
      const status = e?.response?.status
      const msg = e?.response?.data?.error || 'Gönderilemedi'
      if (status === 502) {
        // SMTP kurulu değil / gönderim hatası — kopyala fallback öner
        if (await confirmDialog({ title: 'Gönderilemedi', body: `${msg}\n\nMetni panoya kopyalayıp kendi mail hesabınızdan gönderebilirsiniz. Kopyalansın mı?` })) {
          copyToClipboard()
        }
      } else {
        toastErr(msg)
      }
    } finally {
      setSending(false)
    }
  }

  const saveAsTemplate = async () => {
    if (!rawSubject.trim() && !rawBody.trim()) return toastErr('Kaydedilecek içerik yok')
    const name = window.prompt('Şablon adı:')
    if (!name?.trim()) return
    saveTemplate.mutate({ category, name: name.trim(), subject: rawSubject, body: rawBody })
  }

  return (
    <div className="fade-up" style={{ maxWidth: '1100px' }}>
      <div className="sect"><div className="sect-title">MAIL GÖNDER</div><div className="sect-line" /></div>
      <p style={{ fontSize: '12px', color: 'var(--text3)', margin: '0 0 16px' }}>
        Hazır şablonu seç, boşlukları doldur, alıcıyı yaz ve gönder. Kendi şablonlarını da kaydedebilirsin.
      </p>

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(220px, 300px) 1fr', gap: '16px', alignItems: 'start' }}>
        {/* Sol: şablon seçimi */}
        <div className="panel">
          <div className="panel-header"><div className="panel-title">ŞABLONLAR</div></div>
          <div className="panel-body" style={{ padding: '10px' }}>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px', marginBottom: '10px' }}>
              {categories.map(c => (
                <button key={c.id} onClick={() => setCategory(c.id)}
                  className={`filter-chip ${category === c.id ? 'active' : ''}`}
                  style={{ fontSize: '9px', padding: '3px 8px' }}>
                  {c.label}
                </button>
              ))}
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
              {catTemplates.length === 0 && <div style={{ fontSize: '11px', color: 'var(--text3)', padding: '8px' }}>Bu kategoride şablon yok</div>}
              {catTemplates.map(t => (
                <div key={t.id}
                  style={{
                    display: 'flex', alignItems: 'center', gap: '6px',
                    padding: '8px 10px', borderRadius: '7px', cursor: 'pointer',
                    background: activeTemplateId === t.id ? 'var(--accent)' : 'var(--surface2)',
                    color: activeTemplateId === t.id ? '#000' : 'var(--text)',
                    border: '1px solid var(--border)',
                  }}
                  onClick={() => pickTemplate(t)}>
                  <span style={{ fontSize: '12px', flex: 1 }}>{t.name}</span>
                  {!t.builtin && (
                    <button title="Şablonu sil"
                      onClick={async (e) => {
                        e.stopPropagation()
                        if (await confirmDialog({ title: 'Şablonu Sil', body: `"${t.name}" silinsin mi?`, danger: true })) {
                          deleteTemplate.mutate(t.id.replace('custom:', ''))
                        }
                      }}
                      style={{ border: 'none', background: 'transparent', color: 'inherit', cursor: 'pointer', fontSize: '11px' }}>✕</button>
                  )}
                  {t.builtin && <span style={{ fontSize: '8px', opacity: .6, fontFamily: 'var(--mono)' }}>hazır</span>}
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Sağ: oluştur */}
        <div className="panel">
          <div className="panel-header"><div className="panel-title">MESAJ</div></div>
          <div className="panel-body" style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
              <div>
                <label className="form-label">Alıcı (virgülle ayır)</label>
                <input className="form-input" list="mail-contacts" value={to} onChange={e => setTo(e.target.value)}
                  placeholder="ornek@firma.com" />
                <datalist id="mail-contacts">
                  {contacts.map(c => <option key={c.email} value={c.email}>{c.label}</option>)}
                </datalist>
              </div>
              <div>
                <label className="form-label">CC (opsiyonel)</label>
                <input className="form-input" list="mail-contacts" value={cc} onChange={e => setCc(e.target.value)} />
              </div>
            </div>

            {vars.length > 0 && (
              <div style={{ padding: '10px 12px', background: 'var(--surface2)', borderRadius: '8px', border: '1px solid var(--border)' }}>
                <div style={{ fontFamily: 'var(--mono)', fontSize: '9px', color: 'var(--text3)', letterSpacing: '1px', marginBottom: '8px' }}>BOŞLUKLARI DOLDUR</div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: '8px' }}>
                  {vars.map(v => (
                    <div key={v}>
                      <label style={{ fontSize: '10px', color: 'var(--text3)', display: 'block', marginBottom: '2px' }}>{v}</label>
                      <input className="form-input" style={{ fontSize: '12px' }} value={varValues[v] || ''}
                        onChange={e => setVarValues(p => ({ ...p, [v]: e.target.value }))} />
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div>
              <label className="form-label">Konu</label>
              <input className="form-input" value={rawSubject} onChange={e => setRawSubject(e.target.value)} />
            </div>
            <div>
              <label className="form-label">Mesaj</label>
              <textarea className="form-input" rows={12} value={rawBody} onChange={e => setRawBody(e.target.value)}
                style={{ resize: 'vertical', fontFamily: 'inherit', lineHeight: 1.5 }} />
            </div>

            {vars.length > 0 && (finalSubject !== rawSubject || finalBody !== rawBody) && (
              <details>
                <summary style={{ fontSize: '11px', color: 'var(--text3)', cursor: 'pointer' }}>Önizleme (doldurulmuş hali)</summary>
                <div style={{ marginTop: '8px', padding: '12px', background: 'var(--surface2)', borderRadius: '8px', fontSize: '12px', whiteSpace: 'pre-wrap' }}>
                  <strong>{finalSubject}</strong>
                  <hr style={{ border: 'none', borderTop: '1px solid var(--border)', margin: '8px 0' }} />
                  {finalBody}
                </div>
              </details>
            )}

            {/* Ek dosya arşivi */}
            <div style={{ padding: '10px 12px', background: 'var(--surface2)', borderRadius: '8px', border: '1px solid var(--border)' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px', flexWrap: 'wrap', gap: '6px' }}>
                <span style={{ fontFamily: 'var(--mono)', fontSize: '9px', color: 'var(--text3)', letterSpacing: '1px' }}>
                  EKLER {selectedAtt.length > 0 && `· ${selectedAtt.length} seçili`}
                </span>
                <label className="btn btn-ghost btn-sm" style={{ fontSize: '10px', cursor: 'pointer', margin: 0 }}>
                  {uploading ? 'Yükleniyor...' : '＋ Arşive Dosya Yükle'}
                  <input type="file" hidden disabled={uploading}
                    onChange={e => { const f = e.target.files?.[0]; if (f) uploadAttachment(f); e.target.value = '' }} />
                </label>
              </div>
              {attachments.length === 0 ? (
                <div style={{ fontSize: '11px', color: 'var(--text3)' }}>
                  Arşivde dosya yok. Sık gönderdiğin dosyaları yükle; bir daha aramadan buradan eklersin, güncelleyince üstüne yeni sürüm koyarsın.
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', maxHeight: '180px', overflowY: 'auto' }}>
                  {attachments.map(a => (
                    <div key={a.id} style={{
                      display: 'flex', alignItems: 'center', gap: '8px', padding: '5px 8px', borderRadius: '6px',
                      background: selectedAtt.includes(a.id) ? 'rgba(240,165,0,.12)' : 'var(--surface)',
                      border: '1px solid var(--border)',
                    }}>
                      <input type="checkbox" checked={selectedAtt.includes(a.id)} onChange={() => toggleAtt(a.id)} />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: '12px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{a.name}</div>
                        <div style={{ fontFamily: 'var(--mono)', fontSize: '8px', color: 'var(--text3)' }}>
                          {a.category} · {a.original_name} · {fmtSize(a.size)}
                        </div>
                      </div>
                      <label title="Yeni sürüm yükle (üstüne yaz)" className="btn btn-ghost btn-sm" style={{ fontSize: '9px', cursor: 'pointer', margin: 0, padding: '2px 6px' }}>
                        ⟳
                        <input type="file" hidden onChange={e => { const f = e.target.files?.[0]; if (f) uploadAttachment(f, a.id); e.target.value = '' }} />
                      </label>
                      <button title="Sil" onClick={async () => {
                        if (await confirmDialog({ title: 'Dosyayı Sil', body: `"${a.name}" arşivden silinsin mi?`, danger: true })) {
                          deleteAttachment.mutate(a.id)
                          setSelectedAtt(prev => prev.filter(x => x !== a.id))
                        }
                      }} style={{ border: 'none', background: 'transparent', color: 'var(--text3)', cursor: 'pointer', fontSize: '12px' }}>✕</button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
              <button className="btn btn-ghost btn-sm" onClick={saveAsTemplate}>💾 Şablon Olarak Kaydet</button>
              <button className="btn btn-ghost btn-sm" onClick={copyToClipboard}>📋 Kopyala</button>
              <button className="btn btn-primary" onClick={send} disabled={sending}>
                {sending ? 'Gönderiliyor...' : '✉ Gönder'}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
