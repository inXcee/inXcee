import { useEffect, useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import api from '../../../shared/api/client.js'
import { useToastStore } from '../../../shared/store/toastStore.js'
import { DossierSection } from './StaffDossierShared.jsx'
import './StaffOffboardingPanel.css'

const EXIT_TYPES = [
  ['resignation', 'İstifa'], ['employer_termination', 'İşveren feshi'], ['contract_end', 'Sözleşme sonu'],
  ['project_end', 'Proje sonu'], ['other', 'Diğer'],
]

function isoDate(date = new Date()) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

function impactTotal(counts = {}) {
  return Object.values(counts).reduce((sum, value) => sum + Number(value || 0), 0)
}

function DecisionRow({ type, record, value, onChange, exitDate }) {
  const isLeave = type === 'leaves'
  const date = record.work_date || `${record.start_date} → ${record.end_date}`
  const label = record.shift_name || record.leave_type || record.reason || 'Kayıt'
  const set = (key, nextValue) => onChange({ ...value, id: record.id, [key]: nextValue })
  return (
    <div className="offboarding-decision">
      <div><strong>{label}</strong><span>{date}</span></div>
      <select aria-label={`${label} kararı`} value={value?.action || ''} onChange={event => set('action', event.target.value)}>
        <option value="">Karar seçin</option><option value="cancel">İptal et</option>{isLeave && <option value="truncate">Tarihini kısalt</option>}<option value="keep">Gerekçeyle koru</option>
      </select>
      {value?.action === 'truncate' && <input aria-label={`${label} yeni bitiş tarihi`} type="date" max={exitDate} value={value.new_end_date || exitDate} onChange={event => set('new_end_date', event.target.value)} />}
      {['keep', 'truncate'].includes(value?.action) && <input aria-label={`${label} karar gerekçesi`} value={value.reason || ''} onChange={event => set('reason', event.target.value)} placeholder="Karar gerekçesi" />}
    </div>
  )
}

function ImpactSummary({ impact }) {
  const counts = impact?.counts || {}
  const items = [
    ['Gelecek vardiya', counts.schedules], ['İzin / rapor', counts.leaves], ['Mesai talebi', counts.overtime_requests],
    ['Gelecek atama', counts.future_assignments], ['Açık zimmet', counts.equipment], ['Açık görev', counts.followups],
  ]
  return <div className="offboarding-impact-grid">{items.map(([label, value]) => <div key={label}><span>{label}</span><strong>{Number(value || 0)}</strong></div>)}</div>
}

export default function StaffOffboardingPanel({ staffId, person, canManage }) {
  const queryClient = useQueryClient()
  const isActive = Number(person?.is_active) === 1
  const inProgress = isActive && !!person?.offboarding_started_at
  const [exitDate, setExitDate] = useState(person?.exit_date || isoDate())
  const [exitType, setExitType] = useState(person?.exit_type || 'resignation')
  const [reason, setReason] = useState(person?.exit_reason || '')
  const [restoreReason, setRestoreReason] = useState('Yeniden işe alım')
  const [restoreDate, setRestoreDate] = useState(isoDate())
  const [decisions, setDecisions] = useState({ schedules: {}, leaves: {}, overtime_requests: {} })
  const [equipmentException, setEquipmentException] = useState('')
  const impactQuery = useQuery({
    queryKey: ['personnel-offboarding-impact', String(staffId), exitDate],
    queryFn: () => api.get(`/personnel/${staffId}/offboarding-impact`, { params: { exit_date: exitDate } }).then(response => response.data),
    enabled: !!staffId && !!exitDate && isActive,
    staleTime: 10000,
  })
  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ['staff-dossier', String(staffId)] })
    queryClient.invalidateQueries({ queryKey: ['personnel-offboarding-impact', String(staffId)] })
    queryClient.invalidateQueries({ queryKey: ['personnel-tracking-detail', String(staffId)] })
    queryClient.invalidateQueries({ queryKey: ['personnel-tracking-timeline', String(staffId)] })
    queryClient.invalidateQueries({ queryKey: ['staff-list'] })
  }
  const success = message => { refresh(); useToastStore.getState().addToast(message, 'success') }
  const failure = (error, fallback) => useToastStore.getState().addToast(error.response?.data?.error || fallback, 'error')
  const startMutation = useMutation({ mutationFn: () => api.post(`/personnel/${staffId}/offboarding/start`, { exit_date: exitDate, exit_type: exitType, reason }), onSuccess: () => success('İşten çıkış süreci ve kontrol listesi başlatıldı'), onError: error => failure(error, 'Çıkış süreci başlatılamadı') })
  const finalizeMutation = useMutation({ mutationFn: payload => api.post(`/personnel/${staffId}/offboarding/finalize`, payload), onSuccess: () => success('İşten çıkış tamamlandı; personel arşive taşındı'), onError: error => failure(error, 'İşten çıkış tamamlanamadı') })
  const restoreMutation = useMutation({ mutationFn: () => api.post(`/personnel/${staffId}/restore`, { effective_from: restoreDate, reason: restoreReason }), onSuccess: () => success('Personel geçmişi korunarak yeniden işe alındı'), onError: error => failure(error, 'Geri işe alma tamamlanamadı') })
  const impact = impactQuery.data
  useEffect(() => {
    if (!impact) return
    setDecisions(previous => {
      const next = { schedules: {}, leaves: {}, overtime_requests: {} }
      for (const type of Object.keys(next)) {
        for (const row of impact[type] || []) next[type][row.id] = previous[type]?.[row.id] || { id: row.id, action: '' }
      }
      return next
    })
  }, [impact])
  const missingDecisions = useMemo(() => ['schedules', 'leaves', 'overtime_requests'].flatMap(type => (impact?.[type] || []).filter(row => !decisions[type]?.[row.id]?.action)), [impact, decisions])
  const invalidReasons = useMemo(() => Object.values(decisions).flatMap(group => Object.values(group)).filter(item => ['keep', 'truncate'].includes(item.action) && !String(item.reason || '').trim()), [decisions])
  const checklistComplete = !impact?.checklist || impact.checklist.status === 'completed' || Number(impact.checklist.completed_count) === Number(impact.checklist.total_count)
  const requiresEquipmentException = (impact?.equipment || []).length > 0 && !equipmentException.trim()
  const canFinalize = inProgress && !missingDecisions.length && !invalidReasons.length && checklistComplete && !requiresEquipmentException
  const updateDecision = (type, item) => setDecisions(previous => ({ ...previous, [type]: { ...previous[type], [item.id]: item } }))
  const finalize = () => finalizeMutation.mutate({
    schedules: Object.values(decisions.schedules), leaves: Object.values(decisions.leaves).map(item => item.action === 'truncate' ? { ...item, new_end_date: item.new_end_date || exitDate } : item),
    overtime_requests: Object.values(decisions.overtime_requests), equipment_exception_reason: equipmentException.trim() || undefined,
  })

  if (!isActive) return (
    <DossierSection title="GERİ İŞE ALMA" subtitle="Eski çıkış ve çalışma geçmişi korunur">
      <div className="offboarding-restore"><div><strong>Personel işten çıkmış / arşivde</strong><span>Yeni başlangıç tarihi ve etkili atama kaydı oluşturulur. İptal edilmiş vardiya ve izinler geri açılmaz.</span></div><label><span>Yeni başlangıç</span><input type="date" value={restoreDate} onChange={event => setRestoreDate(event.target.value)} /></label><label><span>Açıklama</span><input value={restoreReason} onChange={event => setRestoreReason(event.target.value)} /></label><button type="button" className="btn btn-primary btn-sm" disabled={!canManage || restoreMutation.isPending || !restoreReason.trim()} onClick={() => restoreMutation.mutate()}>Geri İşe Al</button></div>
    </DossierSection>
  )

  return (
    <DossierSection title="KONTROLLÜ İŞTEN ÇIKIŞ" subtitle={inProgress ? 'Çıkış sürecinde' : 'Etki önizlemesi ve kontrollü tamamlama'}>
      <div className="offboarding-panel">
        <div className="offboarding-form-grid"><label><span>Son çalışma tarihi</span><input type="date" value={exitDate} disabled={inProgress} onChange={event => setExitDate(event.target.value)} /></label><label><span>Çıkış türü</span><select value={exitType} disabled={inProgress} onChange={event => setExitType(event.target.value)}>{EXIT_TYPES.map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label><label className="offboarding-form-grid__reason"><span>Açıklama</span><input value={reason} disabled={inProgress} onChange={event => setReason(event.target.value)} placeholder="Çıkış gerekçesi ve operasyon notu" /></label></div>
        {impactQuery.isLoading ? <span className="page-spinner" /> : <><ImpactSummary impact={impact} /><div className="offboarding-impact-note"><strong>{impactTotal(impact?.counts)} etkilenen/açık kayıt</strong><span>Gelecek kayıtlar sessizce değiştirilmez; her biri için karar ve gerektiğinde gerekçe istenir.</span></div></>}
        {!inProgress && <button type="button" className="btn btn-primary btn-sm" disabled={!canManage || startMutation.isPending || !exitDate || !reason.trim()} onClick={() => startMutation.mutate()}>Çıkış Sürecini Başlat</button>}
        {inProgress && impact && <>
          {['schedules', 'leaves', 'overtime_requests'].map(type => (impact[type] || []).length > 0 && <div className="offboarding-decision-group" key={type}><strong>{type === 'schedules' ? 'Gelecek vardiyalar' : type === 'leaves' ? 'İzin ve raporlar' : 'Bekleyen mesai talepleri'}</strong>{impact[type].map(record => <DecisionRow key={record.id} type={type} record={record} value={decisions[type]?.[record.id]} exitDate={exitDate} onChange={item => updateDecision(type, item)} />)}</div>)}
          {(impact.equipment || []).length > 0 && <div className="offboarding-equipment"><strong>Açık zimmet ve ekipmanlar</strong>{impact.equipment.map(item => <span key={`${item.source_type}-${item.id}`}>{item.label} · {item.quantity} adet</span>)}<textarea value={equipmentException} onChange={event => setEquipmentException(event.target.value)} placeholder="İade tamamlanmadıysa campus_manager gerekçeli istisna girmeli" /></div>}
          <div className={`offboarding-check ${checklistComplete ? 'offboarding-check--ok' : ''}`}><strong>Çıkış kontrol listesi</strong><span>{impact.checklist ? `${impact.checklist.completed_count}/${impact.checklist.total_count} tamamlandı · ${impact.checklist.status}` : 'Kontrol listesi bulunamadı'}</span></div>
          <div className="offboarding-final"><div>{missingDecisions.length > 0 && <span>{missingDecisions.length} kayıt için karar bekleniyor.</span>}{invalidReasons.length > 0 && <span>{invalidReasons.length} karar için gerekçe zorunlu.</span>}{!checklistComplete && <span>Kontrol listesi tamamlanmalı.</span>}{requiresEquipmentException && <span>Zimmet iadesi veya gerekçeli istisna gerekli.</span>}{canFinalize && <span className="offboarding-final__ready">Tüm kontroller tamam. Çıkış sonlandırılabilir.</span>}</div><button type="button" className="btn btn-danger btn-sm" disabled={!canManage || !canFinalize || finalizeMutation.isPending} onClick={finalize}>İşten Çıkışı Tamamla</button></div>
        </>}
      </div>
    </DossierSection>
  )
}
