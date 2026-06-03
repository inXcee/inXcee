// Bir blok için hızlı arıza bildirim modalı (oda no opsiyonel + açıklama + öncelik
// + fotoğraf). Gönderimi kendi içinde yapar; başarıda onSuccess() çağrılır.
import { useState } from 'react'
import api from '../../shared/api/client.js'
import { useToastStore } from '../../shared/store/toastStore.js'
import { modalLabel, modalInput } from './shared.jsx'

export default function QuickFaultModal({ block, onClose, onSuccess }) {
  const [roomNo, setRoomNo] = useState('')
  const [description, setDescription] = useState('')
  const [priority, setPriority] = useState('normal')
  const [photo, setPhoto] = useState(null)
  const [submitting, setSubmitting] = useState(false)

  async function submit() {
    if (!description.trim() || description.trim().length < 5) {
      useToastStore.getState().addToast('Açıklama gerekli (min 5 karakter)', 'warning'); return
    }
    setSubmitting(true)
    try {
      const fd = new FormData()
      const location = roomNo ? `${block} - Oda ${roomNo.trim()}` : `${block} - Genel`
      fd.append('location', location)
      fd.append('description', description.trim())
      fd.append('priority', priority)
      if (photo) fd.append('photo_before', photo)
      await api.post('/maintenance/requests', fd, { headers: { 'Content-Type': 'multipart/form-data' } })
      onSuccess()
    } catch (err) {
      useToastStore.getState().addToast(err?.response?.data?.error || 'Gönderilemedi', 'error')
      setSubmitting(false)
    }
  }

  return (
    <div onClick={onClose} style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 1000,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
    }}>
      <div onClick={e => e.stopPropagation()} style={{
        background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10,
        padding: 20, width: 'min(420px, 90vw)', color: 'var(--text)',
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
          <div>
            <h3 style={{ fontFamily: 'var(--display)', fontSize: 18, letterSpacing: 2, margin: 0 }}>HIZLI ARIZA</h3>
            <div style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--text3)', letterSpacing: 1, marginTop: 4 }}>
              BLOK {block}
            </div>
          </div>
          <button onClick={onClose} style={{
            background: 'transparent', border: '1px solid var(--border)', borderRadius: 6,
            color: 'var(--text3)', padding: '4px 10px', cursor: 'pointer', fontSize: 13,
          }}>✕</button>
        </div>

        <label style={modalLabel}>ODA NO (OPSIYONEL)</label>
        <input type="text" placeholder="101, 203 vb. (bos = blok geneli)"
          value={roomNo} onChange={e => setRoomNo(e.target.value)} style={modalInput} />

        <label style={modalLabel}>ACIKLAMA *</label>
        <textarea placeholder="Ariza ne? (su sizinti, klima calismiyor, kapi kilidi vb.)"
          value={description} onChange={e => setDescription(e.target.value)}
          rows={4} style={{ ...modalInput, fontFamily: 'var(--sans)', resize: 'vertical' }} />

        <label style={modalLabel}>ONCELIK</label>
        <div style={{ display: 'flex', gap: 6, marginBottom: 12 }}>
          {[
            { v: 'normal', label: 'Normal', color: 'var(--text2)' },
            { v: 'high',   label: 'Acil',   color: '#f59e0b' },
            { v: 'urgent', label: 'Cok Acil', color: '#dc2626' },
          ].map(p => (
            <button key={p.v} onClick={() => setPriority(p.v)} style={{
              flex: 1,
              background: priority === p.v ? p.color : 'var(--surface2)',
              color: priority === p.v ? '#000' : 'var(--text2)',
              border: '1px solid var(--border)', borderRadius: 6,
              padding: '6px 10px', cursor: 'pointer',
              fontFamily: 'var(--mono)', fontSize: 10, letterSpacing: 1, fontWeight: 600,
            }}>{p.label}</button>
          ))}
        </div>

        <label style={modalLabel}>FOTOGRAF (OPSIYONEL)</label>
        <input type="file" accept="image/*"
          onChange={e => setPhoto(e.target.files?.[0] || null)}
          style={{ marginBottom: 14, color: 'var(--text2)', fontFamily: 'var(--mono)', fontSize: 11 }} />

        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={onClose} disabled={submitting} style={{
            flex: 1, background: 'var(--surface2)', color: 'var(--text2)',
            border: '1px solid var(--border)', borderRadius: 6,
            padding: '10px 12px', cursor: 'pointer',
            fontFamily: 'var(--mono)', fontSize: 11, letterSpacing: 1,
          }}>IPTAL</button>
          <button onClick={submit} disabled={submitting} style={{
            flex: 2, background: submitting ? 'var(--surface2)' : '#dc2626',
            color: '#fff', border: 'none', borderRadius: 6,
            padding: '10px 12px', cursor: submitting ? 'wait' : 'pointer',
            fontFamily: 'var(--mono)', fontSize: 11, letterSpacing: 1, fontWeight: 700,
          }}>
            {submitting ? 'GONDERILIYOR...' : '⚠ ARIZA BILDIR'}
          </button>
        </div>
      </div>
    </div>
  )
}
