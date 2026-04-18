import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import api from '../../shared/api/client.js'

export default function AvsWorkersPage() {
  const qc = useQueryClient()
  const [selected, setSelected] = useState(null)
  const [editForm, setEditForm] = useState({ full_name: '', role_label: '' })
  const [newForm, setNewForm] = useState({ full_name: '', role_label: '' })
  const [pinInput, setPinInput] = useState('')
  const [showPinField, setShowPinField] = useState(false)
  const [toast, setToast] = useState(null)

  const { data: workers = [], isLoading } = useQuery({
    queryKey: ['avs-workers'],
    queryFn: () => api.get('/avs-workers').then(r => r.data),
  })

  function showToast(msg, type = 'success') {
    setToast({ msg, type })
    setTimeout(() => setToast(null), 3000)
  }

  function selectWorker(w) {
    setSelected(w)
    setEditForm({ full_name: w.full_name, role_label: w.role_label || '' })
    setPinInput('')
    setShowPinField(false)
  }

  const createMut = useMutation({
    mutationFn: body => api.post('/avs-workers', body),
    onSuccess: data => {
      qc.invalidateQueries({ queryKey: ['avs-workers'] })
      setNewForm({ full_name: '', role_label: '' })
      showToast('Çalışan eklendi')
      selectWorker(data.data)
    },
    onError: e => showToast(e.response?.data?.error ?? 'Hata', 'error'),
  })

  const updateMut = useMutation({
    mutationFn: ({ id, ...body }) => api.put(`/avs-workers/${id}`, body),
    onSuccess: data => {
      qc.invalidateQueries({ queryKey: ['avs-workers'] })
      setSelected(data.data)
      showToast('Kaydedildi')
    },
    onError: e => showToast(e.response?.data?.error ?? 'Hata', 'error'),
  })

  const pinMut = useMutation({
    mutationFn: ({ id, pin }) => api.put(`/avs-workers/${id}/pin`, { new_pin: pin }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['avs-workers'] })
      setPinInput('')
      setShowPinField(false)
      showToast('PIN güncellendi')
    },
    onError: e => showToast(e.response?.data?.error ?? 'Hata', 'error'),
  })

  const toggleMut = useMutation({
    mutationFn: id => api.put(`/avs-workers/${id}/toggle`),
    onSuccess: (data, id) => {
      qc.invalidateQueries({ queryKey: ['avs-workers'] })
      const updated = { ...selected, is_active: data.data.is_active }
      setSelected(updated)
      showToast(data.data.is_active ? 'Aktif edildi' : 'Pasif edildi')
    },
    onError: e => showToast(e.response?.data?.error ?? 'Hata', 'error'),
  })

  const deleteMut = useMutation({
    mutationFn: id => api.delete(`/avs-workers/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['avs-workers'] })
      setSelected(null)
      showToast('Çalışan silindi')
    },
    onError: e => showToast(e.response?.data?.error ?? 'Hata', 'error'),
  })

  return (
    <div style={{ padding: '24px' }}>
      <div className="fade-up" style={{ marginBottom: '24px' }}>
        <h2 style={{ fontSize: '28px', letterSpacing: '4px' }}>AVS ÇALIŞANLARI</h2>
        <p style={{ fontFamily: 'var(--mono)', fontSize: '10px', color: 'var(--text3)', letterSpacing: '1px', marginTop: '4px' }}>
          ÇAMAŞIRHANE KIOSK PERSONEL YÖNETİMİ
        </p>
      </div>

      {toast && (
        <div style={{
          padding: '10px 16px', marginBottom: '16px', borderRadius: '6px',
          background: toast.type === 'success' ? '#dcfce7' : '#fee2e2',
          color: toast.type === 'success' ? '#166534' : '#991b1b',
          fontFamily: 'var(--mono)', fontSize: '12px',
        }}>
          {toast.msg}
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: '280px 1fr', gap: '16px', alignItems: 'start' }}>
        {/* Sol: liste */}
        <div className="panel fade-up-1">
          <div style={{ height: '2px', background: 'var(--accent)' }} />
          <div className="panel-header">
            <div className="panel-title">ÇALIŞANLAR</div>
            <span style={{ fontFamily: 'var(--mono)', fontSize: '10px', color: 'var(--text3)' }}>
              {workers.length} kayıt
            </span>
          </div>
          <div className="panel-body" style={{ padding: 0 }}>
            {isLoading ? (
              <div style={{ padding: '16px', color: 'var(--text3)', fontFamily: 'var(--mono)', fontSize: '12px' }}>Yükleniyor...</div>
            ) : workers.length === 0 ? (
              <div style={{ padding: '16px', color: 'var(--text3)', fontFamily: 'var(--mono)', fontSize: '12px' }}>Henüz çalışan yok</div>
            ) : workers.map(w => (
              <div
                key={w.id}
                onClick={() => selectWorker(w)}
                style={{
                  padding: '12px 16px',
                  cursor: 'pointer',
                  borderBottom: '1px solid var(--border)',
                  background: selected?.id === w.id ? 'rgba(240,165,0,0.08)' : 'transparent',
                  borderLeft: selected?.id === w.id ? '3px solid var(--accent)' : '3px solid transparent',
                  transition: 'all 0.15s',
                }}
                onMouseEnter={e => { if (selected?.id !== w.id) e.currentTarget.style.background = 'var(--surface2)' }}
                onMouseLeave={e => { if (selected?.id !== w.id) e.currentTarget.style.background = 'transparent' }}
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                  <span style={{ fontFamily: 'var(--sans)', fontSize: '13px', fontWeight: 500, color: 'var(--text)' }}>
                    {w.full_name}
                  </span>
                  <span style={{
                    fontFamily: 'var(--mono)', fontSize: '9px', padding: '2px 6px', borderRadius: '4px',
                    background: w.is_active ? 'rgba(34,197,94,0.15)' : 'rgba(239,68,68,0.12)',
                    color: w.is_active ? '#16a34a' : '#dc2626',
                  }}>
                    {w.is_active ? 'AKTİF' : 'PASİF'}
                  </span>
                </div>
                {w.role_label && (
                  <div style={{ fontFamily: 'var(--mono)', fontSize: '10px', color: 'var(--text3)', marginTop: '3px' }}>
                    {w.role_label}
                  </div>
                )}
                <div style={{ fontFamily: 'var(--mono)', fontSize: '10px', color: w.has_pin ? '#16a34a' : 'var(--text4)', marginTop: '2px' }}>
                  {w.has_pin ? '● PIN tanımlı' : '○ PIN yok'}
                </div>
              </div>
            ))}

            {/* Yeni çalışan ekleme */}
            <div style={{ padding: '12px 16px', borderTop: '1px solid var(--border)' }}>
              <div style={{ fontFamily: 'var(--mono)', fontSize: '9px', color: 'var(--text3)', letterSpacing: '1px', marginBottom: '8px' }}>
                YENİ ÇALIŞAN
              </div>
              <input
                className="form-input"
                placeholder="Ad soyad (en az 2 karakter)"
                value={newForm.full_name}
                onChange={e => setNewForm(f => ({ ...f, full_name: e.target.value }))}
                style={{ marginBottom: '6px', fontSize: '12px' }}
              />
              <input
                className="form-input"
                placeholder="Rol (opsiyonel, ör: Çamaşırhane)"
                value={newForm.role_label}
                onChange={e => setNewForm(f => ({ ...f, role_label: e.target.value }))}
                style={{ marginBottom: '8px', fontSize: '12px' }}
              />
              <button
                className="btn btn-primary"
                style={{ width: '100%', fontSize: '12px' }}
                disabled={createMut.isPending || newForm.full_name.trim().length < 2}
                onClick={() => createMut.mutate({ full_name: newForm.full_name.trim(), role_label: newForm.role_label.trim() || null })}
              >
                {createMut.isPending ? 'Ekleniyor...' : '+ Ekle'}
              </button>
            </div>
          </div>
        </div>

        {/* Sağ: detay panel */}
        {selected ? (
          <div className="panel fade-up-2">
            <div style={{ height: '2px', background: 'linear-gradient(90deg, var(--accent), var(--accent3))' }} />
            <div className="panel-header">
              <div className="panel-title">ÇALIŞAN DETAYI</div>
              <span style={{ fontFamily: 'var(--mono)', fontSize: '10px', color: 'var(--text3)' }}>
                #{selected.id}
              </span>
            </div>
            <div className="panel-body" style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              {/* Ad ve rol */}
              <div>
                <label style={{ fontFamily: 'var(--mono)', fontSize: '10px', color: 'var(--text3)', letterSpacing: '1px', display: 'block', marginBottom: '6px' }}>
                  AD SOYAD
                </label>
                <input
                  className="form-input"
                  value={editForm.full_name}
                  onChange={e => setEditForm(f => ({ ...f, full_name: e.target.value }))}
                  style={{ maxWidth: '320px' }}
                />
              </div>
              <div>
                <label style={{ fontFamily: 'var(--mono)', fontSize: '10px', color: 'var(--text3)', letterSpacing: '1px', display: 'block', marginBottom: '6px' }}>
                  ROL ETİKETİ
                </label>
                <input
                  className="form-input"
                  placeholder="ör: Çamaşırhane, Ütü"
                  value={editForm.role_label}
                  onChange={e => setEditForm(f => ({ ...f, role_label: e.target.value }))}
                  style={{ maxWidth: '320px' }}
                />
              </div>
              <div>
                <button
                  className="btn btn-primary"
                  disabled={updateMut.isPending || editForm.full_name.trim().length < 2}
                  onClick={() => updateMut.mutate({ id: selected.id, full_name: editForm.full_name.trim(), role_label: editForm.role_label.trim() || null })}
                >
                  {updateMut.isPending ? 'Kaydediliyor...' : 'Kaydet'}
                </button>
              </div>

              <div style={{ borderTop: '1px solid var(--border)', paddingTop: '16px' }}>
                <div style={{ fontFamily: 'var(--mono)', fontSize: '10px', color: 'var(--text3)', letterSpacing: '1px', marginBottom: '8px' }}>
                  PIN YÖNETİMİ · {selected.has_pin ? 'Tanımlı' : 'Tanımlı değil'}
                </div>
                {!showPinField ? (
                  <button
                    className="btn"
                    style={{ background: 'var(--surface2)', border: '1px solid var(--border)', color: 'var(--text)' }}
                    onClick={() => setShowPinField(true)}
                  >
                    {selected.has_pin ? 'PIN Sıfırla' : 'PIN Ata'}
                  </button>
                ) : (
                  <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
                    <input
                      className="form-input"
                      placeholder="4 haneli PIN"
                      value={pinInput}
                      onChange={e => setPinInput(e.target.value.replace(/\D/g, '').slice(0, 4))}
                      maxLength={4}
                      style={{ width: '120px', letterSpacing: '4px', textAlign: 'center' }}
                    />
                    <button
                      className="btn btn-primary"
                      disabled={pinInput.length !== 4 || pinMut.isPending}
                      onClick={() => pinMut.mutate({ id: selected.id, pin: pinInput })}
                    >
                      {pinMut.isPending ? 'Kaydediliyor...' : 'Onayla'}
                    </button>
                    <button
                      className="btn"
                      style={{ background: 'var(--surface2)', border: '1px solid var(--border)', color: 'var(--text3)' }}
                      onClick={() => { setShowPinField(false); setPinInput('') }}
                    >
                      İptal
                    </button>
                  </div>
                )}
              </div>

              <div style={{ borderTop: '1px solid var(--border)', paddingTop: '16px', display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                <button
                  className="btn"
                  style={{
                    background: selected.is_active ? 'rgba(239,68,68,0.1)' : 'rgba(34,197,94,0.1)',
                    border: `1px solid ${selected.is_active ? 'rgba(239,68,68,0.3)' : 'rgba(34,197,94,0.3)'}`,
                    color: selected.is_active ? '#dc2626' : '#16a34a',
                  }}
                  disabled={toggleMut.isPending}
                  onClick={() => toggleMut.mutate(selected.id)}
                >
                  {toggleMut.isPending ? '...' : selected.is_active ? 'Pasif Et' : 'Aktif Et'}
                </button>
                <button
                  className="btn"
                  style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', color: '#dc2626' }}
                  disabled={deleteMut.isPending}
                  onClick={() => {
                    if (window.confirm(`"${selected.full_name}" silinsin mi?`)) deleteMut.mutate(selected.id)
                  }}
                >
                  {deleteMut.isPending ? 'Siliniyor...' : 'Sil'}
                </button>
              </div>

              <div style={{ fontFamily: 'var(--mono)', fontSize: '10px', color: 'var(--text4)', marginTop: '4px' }}>
                Oluşturma: {new Date(selected.created_at).toLocaleDateString('tr-TR')}
              </div>
            </div>
          </div>
        ) : (
          <div className="panel fade-up-2" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '200px' }}>
            <span style={{ fontFamily: 'var(--mono)', fontSize: '12px', color: 'var(--text4)' }}>
              Soldaki listeden bir çalışan seçin
            </span>
          </div>
        )}
      </div>
    </div>
  )
}
