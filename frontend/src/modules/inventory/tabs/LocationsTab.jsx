import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import api from '../../../shared/api/client.js'
import Modal from '../components/Modal.jsx'
import { confirmDialog } from '../../../shared/components/ConfirmDialog.jsx'

function LocationFormModal({ initial, onClose, onSaved }) {
  const [name, setName] = useState(initial?.name || '')
  const [block, setBlock] = useState(initial?.block || '')
  const [notes, setNotes] = useState(initial?.notes || '')
  const [isActive, setIsActive] = useState(initial?.is_active ?? 1)

  const mut = useMutation({
    mutationFn: () => {
      const body = { name, block, notes, is_active: isActive }
      return initial?.id
        ? api.put(`/inventory/locations/${initial.id}`, body)
        : api.post('/inventory/locations', body)
    },
    onSuccess: () => { onSaved(); onClose() },
  })

  return (
    <Modal onClose={onClose} title={initial?.id ? 'LOKASYON DÜZENLE' : 'YENİ LOKASYON'} sub="DEPO / RAF" color="var(--blue),var(--teal)">
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <div>
          <label className="form-label">İsim *</label>
          <input className="form-input" value={name} onChange={e => setName(e.target.value)}
            placeholder="Ana Depo · A1 Raf · Çamaşır Odası…" autoFocus style={{ borderRadius: 10 }} />
        </div>
        <div>
          <label className="form-label">Blok / Bölge</label>
          <input className="form-input" value={block} onChange={e => setBlock(e.target.value)}
            placeholder="M1, S3, vb. (opsiyonel)" style={{ borderRadius: 10 }} />
        </div>
        <div>
          <label className="form-label">Notlar</label>
          <input className="form-input" value={notes} onChange={e => setNotes(e.target.value)}
            placeholder="Opsiyonel" style={{ borderRadius: 10 }} />
        </div>
        {initial?.id && (
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: 'var(--text2)', cursor: 'pointer' }}>
            <input type="checkbox" checked={!!isActive} onChange={e => setIsActive(e.target.checked ? 1 : 0)} />
            Aktif (kapatıldığında yeni atamalarda görünmez)
          </label>
        )}
      </div>
      {mut.isError && <div className="alert alert-danger" style={{ marginTop: 10, borderRadius: 10 }}><span>!</span><span>{mut.error?.response?.data?.error || 'Hata'}</span></div>}
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 14 }}>
        <button className="btn btn-ghost" onClick={onClose} style={{ borderRadius: 10 }}>İPTAL</button>
        <button className="btn btn-primary" disabled={!name || mut.isPending}
          onClick={() => mut.mutate()} style={{ borderRadius: 10 }}>
          {mut.isPending ? '...' : 'KAYDET'}
        </button>
      </div>
    </Modal>
  )
}

export default function LocationsTab() {
  const qc = useQueryClient()
  const [editing, setEditing] = useState(null)
  const [creating, setCreating] = useState(false)
  const [showInactive, setShowInactive] = useState(false)

  const { data: locations = [] } = useQuery({
    queryKey: ['inv-locations', showInactive],
    queryFn: () => api.get(`/inventory/locations${showInactive ? '' : '?active=1'}`).then(r => r.data),
  })

  const inv = () => qc.invalidateQueries({ queryKey: ['inv-locations'] })

  const deactivateMut = useMutation({
    mutationFn: (id) => api.delete(`/inventory/locations/${id}`),
    onSuccess: inv,
  })

  async function handleDeactivate(loc) {
    const ok = await confirmDialog({
      title: 'Lokasyon kapat',
      body: `"${loc.name}" pasifleştirilsin mi? Mevcut stoklara dokunulmaz, yalnız yeni atamalarda görünmez. Tekrar açılabilir.`,
      confirmLabel: 'Kapat',
    })
    if (ok) deactivateMut.mutate(loc.id)
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14, gap: 10, flexWrap: 'wrap' }}>
        <div style={{ fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--text4)', letterSpacing: 2 }}>
          {locations.length} LOKASYON {showInactive ? '(pasif dahil)' : ''}
        </div>
        <div style={{ display: 'flex', gap: 6 }}>
          <button onClick={() => setShowInactive(s => !s)} className="btn btn-ghost btn-sm" style={{ borderRadius: 10 }}>
            {showInactive ? 'SADECE AKTİF' : '+ PASİFLER'}
          </button>
          <button onClick={() => setCreating(true)} className="btn btn-primary btn-sm" style={{ borderRadius: 10 }}>+ LOKASYON</button>
        </div>
      </div>

      {locations.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '40px 20px', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 14, color: 'var(--text3)' }}>
          <div style={{ fontSize: 32, marginBottom: 10, opacity: 0.3 }}>📍</div>
          <div style={{ fontFamily: 'var(--display)', fontSize: 13, letterSpacing: 2, marginBottom: 6, color: 'var(--text2)' }}>HENÜZ LOKASYON YOK</div>
          <div style={{ fontFamily: 'var(--mono)', fontSize: 10 }}>Lokasyon takibi açık ürünlerde mal giriş/çıkışta zorunlu olur</div>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 10 }}>
          {locations.map(loc => (
            <div key={loc.id} style={{
              padding: '12px 14px', borderRadius: 12,
              background: loc.is_active ? 'var(--surface)' : 'var(--surface2)',
              border: '1px solid var(--border)',
              opacity: loc.is_active ? 1 : 0.6,
            }}>
              <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 }}>
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 3 }}>
                    <span style={{ fontSize: 14 }}>📍</span>
                    <strong style={{ fontSize: 13, color: 'var(--text)' }}>{loc.name}</strong>
                    {!loc.is_active && <span style={{ fontSize: 8, fontFamily: 'var(--mono)', color: 'var(--text3)', padding: '1px 6px', background: 'var(--surface3)', borderRadius: 4, letterSpacing: 1 }}>PASİF</span>}
                  </div>
                  {loc.block && (
                    <div style={{ fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--accent)', letterSpacing: 1 }}>{loc.block}</div>
                  )}
                  {loc.notes && (
                    <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 4 }}>{loc.notes}</div>
                  )}
                </div>
              </div>
              <div style={{ display: 'flex', gap: 4, marginTop: 10 }}>
                <button onClick={() => setEditing(loc)} className="btn btn-ghost btn-xs" style={{ flex: 1, borderRadius: 8 }}>DÜZENLE</button>
                {loc.is_active ? (
                  <button onClick={() => handleDeactivate(loc)} className="btn btn-ghost btn-xs" style={{ borderRadius: 8, color: 'var(--red)' }}>KAPAT</button>
                ) : null}
              </div>
            </div>
          ))}
        </div>
      )}

      {creating && <LocationFormModal onClose={() => setCreating(false)} onSaved={inv} />}
      {editing && <LocationFormModal initial={editing} onClose={() => setEditing(null)} onSaved={inv} />}
    </div>
  )
}
