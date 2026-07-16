import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import api from '../../shared/api/client.js'
import { SkeletonCard } from '../../shared/components/Skeleton.jsx'
import {
  DossierActivity,
  DossierField,
  DossierHeader,
  DossierMetric,
  DossierRisks,
  DossierSection,
  DossierUpcoming,
  DossierWorkMetrics,
  useStaffDossier,
} from '../personnel/dossier/StaffDossierShared.jsx'
import { BottomSheet, toastErr, toastOk } from './shared.jsx'

function QuickEditForm({ person, isPending, onSave, onCancel }) {
  const [form, setForm] = useState(() => ({
    full_name: person.full_name || '',
    phone: person.phone || '',
    email: person.email || '',
    position: person.position || '',
    emergency_contact: person.emergency_contact || '',
    emergency_phone: person.emergency_phone || '',
    address: person.address || '',
  }))
  return (
    <div style={{ display: 'grid', gap: 10 }}>
      <div style={{ fontFamily: 'var(--display)', fontSize: 14, letterSpacing: 1 }}>HIZLI PERSONEL DÜZENLEME</div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 9 }}>
        {[
          ['full_name', 'Ad Soyad', 'text'],
          ['position', 'Pozisyon', 'text'],
          ['phone', 'Telefon', 'tel'],
          ['email', 'E-posta', 'email'],
          ['emergency_contact', 'Acil kişi', 'text'],
          ['emergency_phone', 'Acil telefon', 'tel'],
        ].map(([key, label, type]) => (
          <div key={key}>
            <label className="form-label">{label}</label>
            <input className="form-input" type={type} value={form[key]} onChange={event => setForm(previous => ({ ...previous, [key]: event.target.value }))} />
          </div>
        ))}
        <div style={{ gridColumn: '1 / -1' }}>
          <label className="form-label">Adres</label>
          <textarea className="form-textarea" rows={3} value={form.address} onChange={event => setForm(previous => ({ ...previous, address: event.target.value }))} />
        </div>
      </div>
      <div style={{ display: 'flex', gap: 7 }}>
        <button className="btn btn-primary btn-sm" disabled={!form.full_name || isPending} onClick={() => onSave(form)}>
          {isPending ? 'Kaydediliyor…' : 'Kaydet'}
        </button>
        <button className="btn btn-ghost btn-sm" onClick={onCancel}>İptal</button>
      </div>
    </div>
  )
}

export default function StaffDetailPanel({ staffId, onClose }) {
  const qc = useQueryClient()
  const [editing, setEditing] = useState(false)
  const { data: dossier, isLoading, error } = useStaffDossier(staffId)
  const updateMutation = useMutation({
    mutationFn: payload => api.put(`/shifts/staff/${staffId}`, payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['staff-dossier', String(staffId)] })
      qc.invalidateQueries({ queryKey: ['staff-detail', String(staffId)] })
      qc.invalidateQueries({ queryKey: ['staff-list'] })
      setEditing(false)
      toastOk('Personel iletişim bilgileri güncellendi')
    },
    onError: toastErr,
  })

  useEffect(() => {
    const handleKey = event => {
      if (event.key !== 'Escape') return
      if (editing) setEditing(false)
      else onClose()
    }
    document.addEventListener('keydown', handleKey)
    return () => document.removeEventListener('keydown', handleKey)
  }, [editing, onClose])

  useEffect(() => { setEditing(false) }, [staffId])

  const fullPagePath = `/shifts/personnel/${staffId}`
  const actions = dossier?.person ? (
    <>
      <Link className="btn btn-primary btn-xs" to={fullPagePath} onClick={onClose}>Tam Dosya</Link>
      <button className="btn btn-ghost btn-xs" onClick={() => setEditing(true)}>Düzenle</button>
      <button className="btn btn-ghost btn-xs" onClick={onClose}>Kapat</button>
    </>
  ) : null

  return (
    <BottomSheet onClose={onClose}>
      <div style={{ padding: '4px 18px 18px', overflowY: 'auto', display: 'grid', gap: 12 }}>
        {isLoading && <SkeletonCard lines={8} />}
        {!isLoading && (error || !dossier?.person) && (
          <div style={{ padding: 22, textAlign: 'center' }}>
            <div style={{ color: 'var(--red)', fontFamily: 'var(--display)', letterSpacing: 1 }}>PERSONEL DOSYASI YÜKLENEMEDİ</div>
            <div style={{ color: 'var(--text3)', fontSize: 11, marginTop: 7 }}>{error?.response?.data?.error || 'Veri bulunamadı'}</div>
          </div>
        )}
        {dossier?.person && (
          <>
            <DossierHeader dossier={dossier} actions={actions} />
            {editing ? (
              <DossierSection title="HIZLI DÜZENLEME" subtitle="Kimlik ve finans alanları tam dosyadan yönetilir">
                <QuickEditForm
                  person={dossier.person}
                  isPending={updateMutation.isPending}
                  onSave={payload => updateMutation.mutate(payload)}
                  onCancel={() => setEditing(false)}
                />
              </DossierSection>
            ) : (
              <>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 7 }}>
                  <Link className="btn btn-primary btn-sm" to={`/shifts?tab=schedule&staff=${staffId}`} onClick={onClose}>+ Vardiya</Link>
                  <Link className="btn btn-ghost btn-sm" to={`/shifts?tab=leave&staff=${staffId}`} onClick={onClose}>+ İzin</Link>
                  <Link className="btn btn-ghost btn-sm" to={`/shifts?tab=overtime&staff=${staffId}`} onClick={onClose}>+ Mesai</Link>
                  {dossier.person.phone && <a className="btn btn-ghost btn-sm" href={`tel:${dossier.person.phone}`}>Ara</a>}
                  {dossier.person.email && <a className="btn btn-ghost btn-sm" href={`mailto:${dossier.person.email}`}>E-posta</a>}
                </div>
                <DossierWorkMetrics dossier={dossier} />
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(230px, 1fr))', gap: 10 }}>
                  <DossierSection title="AÇIK UYARILAR" subtitle={`Risk puanı ${dossier.risk_score || 0}`}>
                    <DossierRisks risks={dossier.risks} compact />
                  </DossierSection>
                  <DossierSection title="DOSYA DURUMU">
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 7 }}>
                      <DossierMetric label="BELGE TAMAMLAMA" value={`%${dossier.documents?.completion_rate ?? 100}`} color={dossier.documents?.missing ? 'var(--accent)' : 'var(--green)'} />
                      <DossierMetric label="AÇIK GÖREV" value={dossier.counters?.open_followups || 0} color="var(--blue)" />
                      <DossierMetric label="ZİMMET / KKD" value={(dossier.counters?.active_inventory || 0) + (dossier.counters?.active_kkd || 0)} color="var(--accent)" />
                      <DossierMetric label="SON PERFORMANS" value={dossier.latest_performance?.total_score ?? '—'} color="var(--purple)" />
                    </div>
                  </DossierSection>
                  <DossierSection title="İLETİŞİM VE KONUM">
                    <DossierField label="Telefon" value={dossier.person.phone} href={dossier.person.phone ? `tel:${dossier.person.phone}` : null} />
                    <DossierField label="E-posta" value={dossier.person.email} href={dossier.person.email ? `mailto:${dossier.person.email}` : null} />
                    <DossierField label="Acil kişi" value={dossier.person.emergency_contact} />
                    <DossierField label="Acil telefon" value={dossier.person.emergency_phone} />
                    <DossierField label="Yatakhane" value={dossier.room ? `${dossier.room.block}-${dossier.room.room_no} / ${dossier.room.bed_no || '—'}` : null} />
                  </DossierSection>
                  <DossierSection title="YAKLAŞAN TARİHLER">
                    <DossierUpcoming items={dossier.upcoming} compact />
                  </DossierSection>
                  <DossierSection title="SON İŞLEMLER">
                    <DossierActivity items={dossier.recent_activity} compact />
                  </DossierSection>
                </div>
                <Link to={fullPagePath} onClick={onClose} className="btn btn-primary" style={{ justifyContent: 'center', textDecoration: 'none' }}>
                  Tam Personel Dosyasını Aç
                </Link>
              </>
            )}
          </>
        )}
      </div>
    </BottomSheet>
  )
}
